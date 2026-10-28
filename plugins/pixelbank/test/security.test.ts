import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from './helpers.js';
import { Auth } from '../src/auth.js';
import { apiRequest } from '../src/api.js';
import { callback, proof } from '../src/oauth.js';

for (const mode of ['required-missing', 'wrong', 'valid', 'optional-wrong'] as const) test(`authorization response issuer ${mode} is validated before code redemption`, async t => {
  const m = await mock(); t.after(() => m.close());
  if (mode !== 'optional-wrong') m.hooks.discovery = { authorization_response_iss_parameter_supported: true };
  if (mode === 'valid') m.hooks.callbackIssuer = m.config.issuer;
  if (mode === 'wrong' || mode === 'optional-wrong') m.hooks.callbackIssuer = `${m.origin}/wrong`;
  const result = (await m.login()).result as any;
  if (mode === 'valid') { assert.equal(result.data.status, 'connected'); assert.equal(m.counts.exchange, 1); }
  else { assert.equal(result.error.code, 'OAUTH_ISSUER_MISMATCH'); assert.equal(m.counts.exchange, 0); assert.equal(await m.read(), undefined); }
});

test('duplicate callback issuer and nonce/state mismatch never yield an authorization code', async () => {
  const values = proof();
  const listener = await callback(values.state, new AbortController().signal, 1000, { value: 'https://issuer.example', required: true });
  const result = assert.rejects(listener.result, { code: 'OAUTH_ISSUER_MISMATCH' });
  try {
    const response = await fetch(`http://localhost:18766/oauth/callback?state=${values.state}&code=fixture&iss=https%3A%2F%2Fissuer.example&iss=https%3A%2F%2Fissuer.example`);
    assert.equal(response.status, 400); await result;
  } finally { listener.cancel(); }
});

for (const mode of ['future', 'overlong', 'wrong-use', 'wrong-authorized-party']) test(`signed OIDC token ${mode} is rejected and never registered`, async t => {
  const m = await mock(); t.after(() => m.close()); const now = Math.floor(Date.now() / 1000);
  if (mode === 'future') m.hooks.idIssuedAt = now + 120;
  if (mode === 'overlong') m.hooks.idExpiresAt = now + 7200;
  if (mode === 'wrong-use') m.hooks.idClaims = { token_use: 'access' };
  if (mode === 'wrong-authorized-party') m.hooks.idClaims = { azp: 'another-client' };
  assert.equal(((await m.login()).result as any).error.code, 'INVALID_ID_TOKEN');
  assert.equal(m.counts.register, 0); assert.equal(m.refreshTokens.size, 0);
});

test('rotated refresh preserves scopes and the original one-day horizon across process restart', async t => {
  const m = await mock(); t.after(() => m.close()); await m.login();
  const original = (await m.read())!; assert.ok(original.refreshExpiresAt! > Date.now());
  await m.store.withLock(async tx => { const value = (await tx.load())!; value.expiresAt = 0; await tx.save(value); });
  const restarted = new Auth(m.base, m.store, m.secrets, m.browser);
  await restarted.request('GET', '/test');
  const refreshed = (await m.read())!;
  assert.notEqual(original.refreshToken, refreshed.refreshToken);
  assert.equal(original.refreshExpiresAt, refreshed.refreshExpiresAt); assert.deepEqual(original.oauth.scopes, refreshed.oauth.scopes);
  await m.store.withLock(async tx => { const value = (await tx.load())!; value.expiresAt = 0; value.refreshExpiresAt = Date.now() - 1; await tx.save(value); });
  await assert.rejects(restarted.request('GET', '/test'), { code: 'OAUTH_INVALID_GRANT' });
  assert.equal(m.counts.refresh, 1); assert.equal((await m.read())!.status, 'disabled');
  assert.ok((await m.read())!.refreshToken); assert.equal((await m.read())!.cleanup!.backend, true);
});

test('API routes reject path traversal and alternate authorities without sending a request', async t => {
  const m = await mock(); t.after(() => m.close()); const count = m.requests.length;
  for (const path of ['//attacker.invalid', '/../anything', '/route/../../any', '/\\attacker', '/path#secret']) await assert.rejects(apiRequest(m.base, 'fixture', 'POST', path, {}), { code: 'INVALID_ROUTE' });
  assert.equal(m.requests.length, count);
});

test('known refresh credentials in creative values or keys are blocked before transport', async t => {
  const m = await mock(); t.after(() => m.close()); await m.login(); const value = (await m.read())!;
  const count = m.requests.length;
  for (const input of [{ prompt: value.refreshToken }, { [value.accessToken!]: 'value' }, { prompt: 'Bearer injected' }]) await assert.rejects(m.auth.callCreativeTool('pixelbank_test', input), { code: 'SECRET_INPUT' });
  assert.equal(m.requests.length, count);
});
