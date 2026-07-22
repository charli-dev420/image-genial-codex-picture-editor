# Architecture

Codex Image Editor is split into three runtime layers.

## 1. Codex Conversation Layer

Codex remains the orchestrator. It decides when the image editor skill applies, renders the inline MCP widget, calls MCP tools, makes local images visible with `view_image`, and invokes native `image_gen`.

The plugin never replaces the native image generation path.

## 2. Inline Widget

`mcp/image-editor-widget.html` is a single inline MCP app organized around Zone, Demande, and Envoi. It owns user interaction:

- importing or associating images;
- drawing and refining zones;
- assigning image roles;
- editing constraints;
- creating handoffs;
- registering artifact candidates;
- reviewing versions.

The widget calls MCP tools through the standard MCP Apps JSON-RPC bridge (`ui/initialize`, `tools/call`, and tool notifications). `window.openai` remains an additive compatibility path for Codex hosts that expose it. The widget itself performs no direct image or external network API calls.

Its conversation dock sends follow-up text and the exact native Image Gen handoff through `ui/message`. This message returns control to Codex; the widget never pretends to invoke Image Gen by itself.

## 3. Local MCP Server

`mcp/server.mjs` owns local persistence and validation:

- editor state;
- overlays and precision previews;
- references;
- normalized request packets;
- handoffs and pending generations;
- artifact candidates;
- version records and invariant checks.

The MCP server writes only under the selected workspace root. It rejects generated result registration unless the declared origin is exactly `codex-image-gen`.

## Privacy Boundary

Operational paths are required for `view_image`, persistence, and artifact registration, but they stay inside local MCP state and handoff packets. The primary interface renders the image basename, not the absolute source path. Workspace and artifact paths are available only inside collapsed technical sections for local troubleshooting. No editor state, prompt, image, or path is sent to an external service by the plugin.

Repository captures are generated from the widget surface, stripped of host chrome and image metadata, and checked by `npm run privacy:check`.

## Data Flow

1. **Zone:** the user associates any target image and draws one or more edit regions.
2. The widget saves state through `update_editor_state`.
3. **Demande:** the user confirms the change and optional references.
4. MCP creates a normalized `$imagegen` context packet and a handoff with `view_image` instructions.
5. **Envoi:** the widget sends the exact handoff back to the current conversation through `ui/message`.
6. Codex follows the `view_image` instructions and runs native `image_gen`.
7. Codex or the host saves the real artifact into the workspace.
8. Artifact Bridge registers the artifact candidate.
9. Acceptance delegates to `save_generated_result`.
10. Review compares the version and prepares a narrower retry when needed.

## Host Dependency

The main production dependency is the Codex host's ability to return or save native Image Gen artifacts back into the plugin workflow. If that bridge is unavailable, the plugin records `host_blocked`.
