# Security Policy

## Supported Scope

Security review currently covers the local Codex plugin bundle in this repository:

- MCP server runtime in `mcp/server.mjs`;
- inline widget in `mcp/image-editor-widget.html`;
- plugin manifest and skill instructions;
- local validation scripts.

## Hard Security Boundary

The plugin must not:

- call direct OpenAI Images API endpoints;
- require `OPENAI_API_KEY` or any user-provided API key;
- use a cloud backend, fallback CLI generator, or external image service;
- use `fetch`, `WebSocket`, `XMLHttpRequest`, iframe navigation, or browser navigation from the production widget;
- simulate generated artifacts or fake generation progress.

The only supported generation path is native Codex/Image Gen initiated by Codex in the conversation.

## Reporting Issues

Open a GitHub issue with:

- affected file and version or commit;
- steps to reproduce;
- expected and actual behavior;
- whether the issue could expose local files, credentials, generated images, or workspace state.

Do not include secrets, private images, or proprietary prompts in public issues.

## Local Validation

Run:

```powershell
npm run test
npm run check
```

The test suite includes a static scan for banned runtime patterns and an MCP smoke test for artifact-origin enforcement.
