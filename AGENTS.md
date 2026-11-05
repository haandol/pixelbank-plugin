# Pixelbank Plugin contributor guide

This repository owns the public installable MCP bridge, creative-workflow skill and public contracts. Pixelbank owns the remote service, identity, user assets and credits.

- Follow the repository layout used by `encbird-plugin`: root marketplace entries select `plugins/pixelbank`, which is a self-contained installation with manifests, skills, contracts and the bundled MCP bridge.
- Keep root and plugin READMEs focused on installation and usage. Put developer instructions in `docs/`; never include private service source or operational data there.
- Keep the workspace, package, host manifests and marketplace versions aligned. A layout or naming correction does not require a version bump.
- Use `npm run check` for manifest validation, typechecking, bundle generation and tests. The Dev Container provides the same Node 24 environment as CI.
- Local commits do not authorize remote creation, renaming, pushing, releases or approval requests. Preserve all existing Git/security hooks.
- Push and publish only from the release container: `bash scripts/container-git.sh push …` and `bash scripts/container-release.sh vX.Y.Z` (see `docs/releases.md`). Never push from the host, bypass the receipt check, force-push, or overwrite a tag, release or asset. Pass the GitHub credential only over standard input as the scripts do.
- Release notes describe user-visible changes in Korean and belong in the ignored `.release/` directory.

- Keep private service source, deployment secrets and user data out of this repository.
- Follow the approved Pixelbank MCP contract; browser OAuth uses a dedicated public Cognito client and PKCE S256. Never accept a password or token in tool arguments.
- Every operation preserves ownership, scopes, consent, stable operation identity and original workflow provenance.
- Local callback listeners bind only to loopback. Remote production origins are fixed and verified; there is no arbitrary API proxy or automatic environment fallback.
- Test with signed synthetic credentials, isolated local fixtures and fake processing. Do not infer paid-inference or deployment authorization from a test request.
- Default-browser workspace opening must not control a user's existing active tab or keyboard.
- Comments and documentation use English. Keep inline comments short; test contract-relevant success and failure behavior.
- Validate public contracts, tests, typechecking and the built bundle before claiming completion.
