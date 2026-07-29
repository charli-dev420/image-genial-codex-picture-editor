# Image Genial for Codex

**A conversation-native image-editing workspace for precise masked changes, protected regions and explicit human review.**

[![Status: beta](https://img.shields.io/badge/status-beta-F97316)](#current-status)
[![Codex plugin](https://img.shields.io/badge/Codex-local%20plugin-111827)](#installation)
[![Source available](https://img.shields.io/badge/licence-source--available-2563EB)](#licence)

Image Genial turns an ambiguous editing request into a structured, reviewable handoff for Codex Image Gen. Select what may change, protect what must remain untouched, describe the intended result, then review the real generated artefact before accepting it.

```text
source image
→ editable / excluded / protected regions
→ structured Image Gen request
→ native Codex handoff
→ before / after review
→ accept, reject or refine
```

> Image Genial does not replace the native Image Gen engine. It prepares the request, preserves constraints and manages review inside the Codex conversation.

## Why it is useful

Image-editing prompts quickly become ambiguous: one region must change, another must remain identical, a reference must be respected and the result must be reviewed. Image Genial makes those constraints visible and explicit before generation.

### Main capabilities

- Draw or select regions with brush, lasso, polygon, rectangle and ellipse tools.
- Mark regions as `include`, `exclude` or `protect`.
- Add safety margins, feathering, grids and snapping.
- Apply presets for style, background, lighting, cleanup and grading.
- Build a structured `$imagegen` request without direct Images API calls.
- Hand the request back to Codex through the native MCP Apps `ui/message` path.
- Review genuine `codex-image-gen` artefacts and accept, reject or prepare a narrower retry.
- Keep source images, prompts and workspace state local to the selected workspace.

## Typical workflow

1. **Open an image** and choose whole-image editing or a precise selection.
2. **Protect important areas** that must not be changed.
3. **Describe the edit** and optionally apply a preset.
4. **Send the structured request** to the current Codex conversation.
5. **Review the real result** before accepting it or refining the request.

## Current status

**v0.2.1-beta — working MVP beta.**

Passing automated gates as of 27 July 2026:

- privacy and secret scanning;
- widget syntax and interaction contract;
- request persistence and native handoff;
- region validation and protected-area handling;
- artefact origin, review, rejection and retry flows;
- plugin manifest validation and local deployment preflight.

The remaining host-level release gate is an observed end-to-end acceptance of a real Image Gen artefact through the Artifact Bridge. The repository therefore does not claim production certification.

## Local preview

Requirements: Git, Python and Node.js `>=22 <25`.

```powershell
npm run test
npm run harness:widget -- --port 4318 --image "C:\path\to\image.png" --request "Improve only the selected details"
```

Open `http://127.0.0.1:4318/`.

The harness validates the widget experience and the `ui/message` contract. It deliberately does not simulate a generated Image Gen artefact.

## Installation

Run the read-only preflight first:

```powershell
npm run preflight:local-deploy
```

After the reviewed revision is available locally, deploy it to the personal marketplace:

```powershell
.\scripts\deploy-local.ps1 -Apply -InstallPlugin
```

The script validates the plugin, synchronises the bundle, updates the personal marketplace entry atomically and writes a report to `%USERPROFILE%\.agents\plugins\reports\`.

See [Local deployment](docs/LOCAL_DEPLOYMENT.md) for the complete desktop gate.

## Validation

```powershell
npm run privacy:check
npm run test
npm run check
npm run preflight:local-deploy
python <plugin-creator-path>\scripts\validate_plugin.py .
```

The automated checks cover:

- personal paths and secrets in text and binary files;
- prohibition of direct image APIs and external fallback services;
- widget hydration, tools, regions and persistence;
- native handoff and one-message emission;
- artefact provenance and review state;
- manifest and local-deployment contracts.

See the [public release checklist](docs/PUBLIC_RELEASE.md), [marketplace sheet](docs/MARKETPLACE.md) and [design review](design-qa.md).

## Native Image Gen boundary

- No direct Images API call.
- No API key, BYOK flow, external image service or cloud backend.
- No simulated production result or fake generation progress.
- The MCP server stores local state, validates requests and versions real artefacts.
- Generation runs only through the native Codex `image_gen` / `$imagegen` path.

## Privacy

Runtime state is stored in `.codex-image-editor/` inside the selected workspace and remains ignored by Git.

Do not publish private source images, prompts, generated artefacts or workspace state. See [SECURITY.md](SECURITY.md).

## Repository layout

```text
.codex-plugin/plugin.json        plugin manifest and marketplace page
.mcp.json                        MCP server declaration
assets/                          brand and functional assets
mcp/server.mjs                   local state, validation and native handoff
mcp/image-editor-widget.html     single-page editing interface
scripts/                         validation, privacy, smoke and deployment tools
skills/image-editor/SKILL.md     native Codex editing workflow
```

## Licence

This repository is public and source-available, but it is not distributed under an open-source licence. See [LICENSE](LICENSE) before reuse or redistribution.
