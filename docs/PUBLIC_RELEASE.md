# Public Release Checklist — v0.2.0-beta

## Completed Locally

- Plugin manifest validates.
- Runtime boundary scan passes.
- Widget contract test passes.
- MCP smoke test passes.
- `mcp/server.mjs` syntax check passes.
- Logo asset is bundled under `assets/logo.png`.
- Public documentation, security policy, contribution guide, changelog, and CI workflow are present.
- Public proof board and short demo are cropped to exclude account, project, terminal, and local-path data.
- Marketplace metadata points to an existing PNG proof asset inside the plugin archive.
- A recorded Codex desktop flow shows inline rendering, selection, request preparation, handoff confirmation, and response follow-up.

## Required Before Production Claim

- Save the real Image Gen artifact into the expected workspace path.
- Register and accept the artifact candidate.
- Verify the accepted version appears inline without conversation reload.

## Release Boundary

Until the Artifact Bridge test is complete on a real host artifact, describe the project as an MVP beta that is locally validated and demonstrated in Codex, not fully production-certified.
