# Public Release Checklist

## Completed Locally

- Plugin manifest validates.
- Runtime boundary scan passes.
- Widget contract test passes.
- MCP smoke test passes.
- `mcp/server.mjs` syntax check passes.
- Logo asset is bundled under `assets/logo.png`.
- Public documentation, security policy, contribution guide, changelog, and CI workflow are present.

## Required Before Production Claim

- Install the plugin in a real Codex host.
- Open the inline editor inside a conversation.
- Run a native Codex/Image Gen request from a handoff.
- Save the real Image Gen artifact into the expected workspace path.
- Register and accept the artifact candidate.
- Verify the accepted version appears inline without conversation reload.

## Release Boundary

Until the live host test is complete, describe the project as locally validated and public-ready, not fully production-certified.
