# Pixelbank MCP contributor guide

This repository owns the public installable MCP bridge, creative-workflow skill and public contracts. Pixelbank owns the remote service, identity, user assets and credits.

- Keep private service source, deployment secrets and user data out of this repository.
- Follow the approved Pixelbank MCP contract; browser OAuth uses a dedicated public Cognito client and PKCE S256. Never accept a password or token in tool arguments.
- Every operation preserves ownership, scopes, consent, stable operation identity and original workflow provenance.
- Local callback listeners bind only to loopback. Remote production origins are fixed and verified; there is no arbitrary API proxy or automatic environment fallback.
- Test with signed synthetic credentials, isolated local fixtures and fake processing. Do not infer paid-inference or deployment authorization from a test request.
- Default-browser workspace opening must not control a user's existing active tab or keyboard.
- Comments and documentation use English. Keep inline comments short; test contract-relevant success and failure behavior.
- Validate public contracts, tests, typechecking and the built bundle before claiming completion.
