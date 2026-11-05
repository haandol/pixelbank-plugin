import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { imageSize } from 'image-size';
import { Auth } from './auth.js';
import { DEFAULT_BASE, validateBase } from './config.js';
import { SafeError } from './errors.js';
import { object } from './http.js';

export const UPLOAD_PURPOSES = [
  'workflow-input', 'generation-base', 'upscaling-input', 'generation-guide', 'generation-mask',
  'generation-object', 'segmentation-input', 'segmentation-cutout', 'background-removal-input',
  'animation-start', 'animation-end', 'animation-reference',
] as const;
const preparation = () => new SafeError('IMAGE_PREPARATION_REQUIRED', 'Choose a regular PNG, JPEG or WebP image within the input limits. Preserve the original when preparing a smaller copy.');
const invalid = () => new SafeError('INVALID_UPLOAD', 'The service upload ticket did not match the selected image, owner, purpose, or supported storage destination.');

/** Read one opened inode; a replaced path or a modified file never reaches the uploader. */
export async function readSelectedImage(path: string, limit: number): Promise<Buffer> {
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > limit) throw preparation();
    const canonical = await realpath(path);
    const file = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const same = (stat: typeof before) => stat.isFile() && stat.dev === before.dev && stat.ino === before.ino && stat.size === before.size && stat.mtimeMs === before.mtimeMs && stat.ctimeMs === before.ctimeMs;
      if (!same(await file.stat()) || await realpath(path) !== canonical) throw preparation();
      const bytes = Buffer.alloc(before.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length !== before.size || !same(await file.stat()) || !same(await lstat(path))) throw preparation();
      return bytes.subarray(0, length);
    } finally { await file.close(); }
  } catch { throw preparation(); }
}

export type UploadInput = { file_path: string; purpose: string; save_source?: boolean };
export function parseUploadInput(input: Record<string, unknown>): UploadInput {
  if (typeof input.file_path !== 'string' || typeof input.purpose !== 'string' || (input.save_source !== undefined && typeof input.save_source !== 'boolean') || Object.keys(input).some(key => !['file_path', 'purpose', 'save_source'].includes(key))) throw new SafeError('INVALID_INPUT', 'A local image path and upload purpose are required.');
  return { file_path: input.file_path, purpose: input.purpose, save_source: input.save_source as boolean | undefined };
}

type UploadRequest = { purpose: string; content_type: string; size_bytes: number; width: number; height: number; checksum_sha256: string };
export function validateTicket(value: unknown, base: string, request: UploadRequest, owner: string) {
  try {
    validateBase(base);
    const ticket = object(value), reference = object(ticket.reference), rawHeaders = object(ticket.headers);
    if (Object.keys(ticket).some(key => !['upload_url', 'reference', 'headers'].includes(key)) ||
        Object.keys(reference).length !== 7 || Object.entries(request).some(([key, expected]) => reference[key] !== expected)) throw invalid();
    const key = reference.key;
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[request.content_type];
    if (!owner || /[\s/\\\x00-\x1f\x7f]/.test(owner) || owner.includes('..') || typeof key !== 'string' || key.length > 1024 ||
        key.split('/').some(part => !part || part === '.' || part === '..') ||
        !key.endsWith(`.${extension}`) || key.split('/').slice(-5, -1).join('/') !== `tmp/image-uploads/${owner}/${request.purpose}` ||
        !/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(key.split('/').at(-1)!)) throw invalid();
    const expectedHeaders: Record<string, string> = {
      'content-type': request.content_type, 'x-amz-checksum-sha256': request.checksum_sha256,
      'x-amz-meta-owner': owner, 'x-amz-meta-purpose': request.purpose,
      'x-amz-meta-checksum-sha256': request.checksum_sha256, 'x-amz-meta-width': String(request.width),
      'x-amz-meta-height': String(request.height), 'x-amz-tagging': 'retention=pending-upload',
      'x-amz-storage-class': 'INTELLIGENT_TIERING',
    };
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawHeaders)) {
      const lower = key.toLowerCase();
      if (Object.hasOwn(headers, lower) || typeof value !== 'string' || expectedHeaders[lower] !== value) throw invalid();
      headers[lower] = value;
    }
    if (Object.keys(headers).length !== Object.keys(expectedHeaders).length) throw invalid();
    if (typeof ticket.upload_url !== 'string' || /[\s\\\x00-\x1f\x7f]/.test(ticket.upload_url)) throw invalid();
    const target = new URL(ticket.upload_url);
    const local = base !== DEFAULT_BASE && target.origin === new URL(base).origin;
    const virtualS3 = /^[a-z0-9][a-z0-9.-]+\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(target.hostname);
    const pathS3 = /^s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(target.hostname);
    if ((!local && (target.protocol !== 'https:' || target.port || (!virtualS3 && !pathS3))) || target.username || target.password || target.hash) throw invalid();
    const expectedPath = !local && pathS3 ? `/${target.pathname.split('/')[1]}/${key}` : `/${key}`;
    if (decodeURIComponent(target.pathname) !== expectedPath) throw invalid();
    if (!local) {
      const params = target.searchParams;
      if ([...params.keys()].some(key => params.getAll(key).length !== 1) ||
          params.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256' ||
          !/^[a-f0-9]{64}$/.test(params.get('X-Amz-Signature') ?? '') ||
          !/^\d{8}T\d{6}Z$/.test(params.get('X-Amz-Date') ?? '') ||
          !/^[^/]+\/\d{8}\/[a-z0-9-]+\/s3\/aws4_request$/.test(params.get('X-Amz-Credential') ?? '') ||
          !/^\d+$/.test(params.get('X-Amz-Expires') ?? '') || Number(params.get('X-Amz-Expires')) < 1 || Number(params.get('X-Amz-Expires')) > 900 ||
          !params.get('X-Amz-SignedHeaders')?.split(';').includes('host')) throw invalid();
    }
    return { target, headers, reference: { key, ...request } };
  } catch { throw invalid(); }
}

/** The upload ticket stays private; only the verified reference or saved source reaches the model. */
export async function uploadImage(auth: Pick<Auth, 'callCreativeTool' | 'secrets' | 'store'>, base: string, input: UploadInput, signal?: AbortSignal) {
  if (!UPLOAD_PURPOSES.includes(input.purpose as typeof UPLOAD_PURPOSES[number]) || (input.save_source && input.purpose !== 'workflow-input')) throw new SafeError('INVALID_INPUT', 'Choose a published image upload purpose; persistent workspace sources require workflow-input.');
  const dimensionLimit = 2048, byteLimit = 5 * 1024 * 1024;
  const bytes = await readSelectedImage(input.file_path, byteLimit);
  let size: ReturnType<typeof imageSize>;
  try { size = imageSize(bytes); } catch { throw preparation(); }
  const contentType = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[size.type ?? ''];
  if (!contentType || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1 || size.width > dimensionLimit || size.height > dimensionLimit) throw preparation();
  const request = { purpose: input.purpose, content_type: contentType, size_bytes: bytes.length, width: size.width, height: size.height, checksum_sha256: createHash('sha256').update(bytes).digest('base64') };
  const response = await auth.callCreativeTool('pixelbank_issue_upload', request, { signal });
  const raw = object(response.data);
  auth.secrets.add(raw.upload_url);
  const owner = await auth.store.withLock(async tx => { const value = await tx.load(); return value?.status === 'active' ? value.subject : undefined; });
  const { target, headers, reference } = validateTicket(raw, base, request, owner ?? '');
  for (const key of ['X-Amz-Signature', 'X-Amz-Credential', 'X-Amz-Security-Token']) auth.secrets.add(target.searchParams.get(key));
  try {
    const timeout = AbortSignal.timeout(60_000);
    const uploaded = await fetch(target, { method: 'PUT', headers, body: new Uint8Array(bytes), redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    await uploaded.body?.cancel().catch(() => {});
    if (!uploaded.ok) throw new Error();
  } catch { throw new SafeError('UPLOAD_FAILED', 'The selected image upload was not confirmed. No creative processing was submitted. Do not automatically repeat the upload.'); }
  if (input.save_source) return auth.callCreativeTool('pixelbank_save_source', reference, { signal });
  return { data: { reference } };
}
