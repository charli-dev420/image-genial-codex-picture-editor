# Public Release Checklist — v0.2.1-beta

## Completed Locally

- Plugin manifest validates.
- Runtime boundary scan passes.
- Widget contract test passes.
- MCP smoke test passes.
- `mcp/server.mjs` syntax check passes.
- Logo asset is bundled under `assets/logo.png`.
- Public documentation, security policy, contribution guide, changelog, and CI workflow are present.
- The manifest includes only functional brand assets; no `0.2.0-beta` screenshots or video are packaged.
- A browser-host pass covers the one-page layout, region tools, preset handoff, and native message emission.

## Required Before Production Claim

- Save the real Image Gen artifact into the expected workspace path.
- Register and accept the artifact candidate.
- Verify the accepted version appears inline without conversation reload.

## Release Boundary

Until the Artifact Bridge test is complete on a real host artifact, describe the project as an MVP beta that is locally validated, not fully production-certified.
