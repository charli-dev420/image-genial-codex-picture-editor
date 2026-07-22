# Changelog

## 0.2.0 - 2026-07-22

- Shipped the **MVP beta** visual redesign around the three-step Zone, Request, and Send flow.
- Replaced the prototype control wall with a compact selection toolbar, one primary Image Gen action, and contextual advanced controls.
- Made region editing generic for any image rather than assuming that the selected subject is a logo.
- Added DAWWWCORE visual assets, sanitized repository captures, an animated workflow demo, and a repository privacy check.
- Returned to selection automatically after a zone is drawn so consecutive edits remain predictable.
- Added a stateful conversation dock and explicit native Image Gen launch action inside the inline editor.
- Added the standard MCP Apps JSON-RPC bridge with `window.openai` compatibility.
- Added versioned UI resources, CSP/component metadata, tool-input hydration, theme handling, and display-mode controls.
- Fixed local marketplace resolution to `%USERPROFILE%\plugins\codex-image-editor` and removed the unused app manifest placeholder.
- Added widget syntax, resource metadata, native handoff, deployment, and browser-host validation coverage.
- Reworked the widget into focused Zone, Demande, and Envoi views; reduced the conversation dock to a single composer; removed duplicate workflow/footer chrome; and made zone, precision, layer, and review controls strictly contextual.

## 0.1.0 - 2026-07-06

Initial public source-available release.

- Added conversation-native inline editor for Codex image workflows.
- Added canvas tools, layer controls, annotations, references, and version review.
- Added Request Builder for prompt and image ingestion into native `$imagegen` requests.
- Added precision zones with `include`, `exclude`, and `protect` geometry plus local presets.
- Added Codex/Image Gen handoff tracking and Artifact Bridge candidate review.
- Added local validation suite for runtime boundaries, widget contract, and MCP smoke coverage.
- Added public repository metadata, logo asset, security policy, contribution guide, and CI workflow.
