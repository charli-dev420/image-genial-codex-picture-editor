# Image Genial Codex Picture Editor

Image Genial Codex Picture Editor is a conversation-native Codex plugin for preparing precise image generation and image editing requests directly inside the Codex discussion.

The plugin does not generate images itself. It prepares local image context, overlays, prompts, references, precision zones, handoff packets, review diagnostics, and version metadata so Codex can use the native built-in Image Gen flow tied to the user's Codex/ChatGPT account.

## Status

This repository is public-ready as a Codex plugin source bundle. Local MCP, widget, security-boundary, and smoke validations pass. A live Codex host validation is still required before claiming full production release because artifact return from native Image Gen depends on host support.

## Core Boundary

- No direct Images API calls.
- No API key, BYOK, fallback CLI, or external image backend.
- No simulated generation result or fake progress in production.
- MCP is local and non-generative: it stores state, validates requests, prepares prompts, tracks handoffs, and versions real Codex/Image Gen artifacts.
- Image generation must be performed by Codex through native `image_gen` / `$imagegen`.

## Capabilities

- Inline MCP editor rendered in the Codex conversation.
- Canvas editing tools: select, brush, lasso, polygon, rectangle, ellipse, eraser, pan, zoom, move, resize, duplicate, and delete.
- Layer model: correction, freeze, error, and reference layers with visibility, lock, and opacity controls.
- Precision zones: `include`, `exclude`, and `protect` geometry, numeric bounds, edge mode, safety margin, feather, grid/snap, keyboard nudge, validation, previews, and local presets.
- Request Builder: prompt ingestion, image role classification, normalized prompt draft, Codex-provided working translation storage, constraint extraction, blocking validation, and final `$imagegen` request export.
- Handoff and Artifact Bridge: host capability recording, `view_image` instructions, pending generation tracking, candidate artifact inbox, origin validation, accept/reject, and version registration.
- Review workflow: before/after views, split slider, side-by-side review, frozen-region diagnostics, accept/reject, and retry request generation.

## Repository Layout

```text
.codex-plugin/plugin.json      Codex plugin manifest
.mcp.json                      MCP server declaration
.app.json                      App manifest placeholder
assets/logo.png                Plugin logo used by the manifest and inline widget
docs/                          Host requirements and architecture notes
mcp/server.mjs                 Local MCP server and state/version logic
mcp/image-editor-widget.html   Inline conversation widget
scripts/                       Contract, security-boundary, and smoke tests
skills/image-editor/SKILL.md   Codex workflow instructions
```

## Install For Local Codex Development

The supported local deployment path is the personal Codex marketplace. It keeps the skill, MCP server, widget, and logo installed as one bundle.

Prerequisites: Git, Python, Node `>=22 <25`, a writable personal marketplace at `~/.agents/plugins/marketplace.json`, and a Codex desktop session authenticated with ChatGPT/Codex. No API key is used.

From the source checkout, run a read-only preflight first:

```powershell
npm run preflight:local-deploy
```

Then create or update the dedicated local deployment checkout and personal marketplace entry:

```powershell
.\scripts\deploy-local.ps1 -Apply
```

The script clones or fast-forwards `~/.agents/plugins/plugins/codex-image-editor`, validates it, applies a local-only Codex cachebuster, atomically adds the `personal` marketplace entry, and writes a preflight report under `~/.agents/plugins/reports/`.

Open the printed Codex deep link, install or enable the plugin in the desktop app, and start a new thread. The current CLI may not expose `codex plugin`; in that case the desktop install flow is the supported path.

For later updates, rerun the same `-Apply` command. It rejects user changes in the deployment checkout and only resets the generated manifest-only cachebuster before pulling a new revision.

## Validation

Run the local validation suite from the repository root:

```powershell
npm run test
npm run check
npm run preflight:local-deploy
python <path-to-plugin-creator>/scripts/validate_plugin.py .
```

`npm run test` performs:

- banned runtime pattern scan for direct image API/network usage;
- widget contract checks;
- MCP smoke tests for prompt ingestion, precision zones, handoff creation, artifact candidate rejection/acceptance, invariant review, retry, commit, and reject flows.

## Live Host Gate

Before a production release, validate the real host path:

1. Open the inline editor in a Codex conversation.
2. Import or select a target image.
3. Mark a correction zone and a freeze/protect zone.
4. Build the request and create the Codex handoff.
5. Run native `image_gen` through Codex, not through MCP.
6. Register the real artifact candidate.
7. Accept or reject it in the Artifact Bridge.
8. Confirm the version appears without reloading the conversation block.

If the Codex host cannot surface or save Image Gen artifacts back into the workspace, the plugin must report `host_blocked` instead of inventing a result.

## Security

See [SECURITY.md](SECURITY.md). The short version: do not add direct image API calls, credentials, cloud fallbacks, external network calls, or simulated production artifacts.

## License

This repository is public source-available but not open-source licensed. See [LICENSE](LICENSE).
