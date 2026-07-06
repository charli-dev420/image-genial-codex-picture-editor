# Architecture

Image Genial Codex Picture Editor is split into three runtime layers.

## 1. Codex Conversation Layer

Codex remains the orchestrator. It decides when the image editor skill applies, renders the inline MCP widget, calls MCP tools, makes local images visible with `view_image`, and invokes native `image_gen`.

The plugin never replaces the native image generation path.

## 2. Inline Widget

`mcp/image-editor-widget.html` is a single inline MCP app. It owns user interaction:

- importing or associating images;
- drawing and refining zones;
- assigning image roles;
- editing constraints;
- creating handoffs;
- registering artifact candidates;
- reviewing versions.

The widget persists state only through `window.openai.callTool`. It does not perform network calls.

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

## Data Flow

1. User opens the inline editor in the Codex conversation.
2. Widget saves editor state through `update_editor_state`.
3. Request Builder ingests prompt text and images.
4. MCP creates a normalized `$imagegen` context packet.
5. MCP creates a handoff with `view_image` instructions and expected artifact path.
6. Codex runs native `image_gen`.
7. User or host saves the real artifact into the workspace.
8. Artifact Bridge registers the artifact candidate.
9. Acceptance delegates to `save_generated_result`.
10. Review compares the version and prepares retry prompts if needed.

## Host Dependency

The main production dependency is the Codex host's ability to return or save native Image Gen artifacts back into the plugin workflow. If that bridge is unavailable, the plugin records `host_blocked`.
