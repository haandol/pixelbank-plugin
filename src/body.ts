export const MAX_RESPONSE_BYTES = 1_048_576;
type BodyResult = { kind: 'complete'; text: string } | { kind: 'too-large' };

export async function readBoundedBody(body: ReadableStream<Uint8Array> | null): Promise<BodyResult> {
  const reader = body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try { if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        return { kind: 'too-large' };
      }
      chunks.push(value);
    }
  } } finally { reader?.releaseLock(); }
  return { kind: 'complete', text: Buffer.concat(chunks).toString('utf8') };
}

/** Bound each SSE event and the whole stream while delivering chunks immediately. */
export function boundedEventStream(body: ReadableStream<Uint8Array>, fail: () => Error) {
  const reader = body.getReader();
  let total = 0, event = 0, line = 0, cr = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) { reader.releaseLock(); controller.close(); return; }
        total += value.length;
        if (total > 16 * MAX_RESPONSE_BYTES) throw fail();
        for (const byte of value) {
          if (++event > MAX_RESPONSE_BYTES) throw fail();
          if (byte === 10 && cr) { cr = false; continue; }
          if (byte === 10 || byte === 13) {
            if (line === 0) event = 0;
            line = 0; cr = byte === 13;
          } else { line++; cr = false; }
        }
        controller.enqueue(value);
      } catch (error) { await reader.cancel().catch(() => {}); reader.releaseLock(); controller.error(error); }
    },
    async cancel(reason) { await reader.cancel(reason).catch(() => {}); reader.releaseLock(); },
  });
}
