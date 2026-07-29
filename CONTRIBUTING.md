# Contributing to Image Genial

Thank you for helping improve the plugin. Image Genial is source-available and maintained as a controlled, conversation-native Codex plugin bundle.

## Before opening an issue

- Read the README, release checklist and known host-level limitations.
- Describe the user-visible problem before proposing implementation details.
- Include the operating system, Node version, Codex host context and a minimal reproduction.
- Remove private images, prompts, generated artefacts, credentials and personal paths.

## Development boundaries

Contributions must preserve the product's current trust model:

- keep the MCP server non-generative;
- do not add direct Images API calls, API keys, cloud backends, network fetches, fallback generators or simulated production artefacts;
- keep UI changes inside the inline MCP widget;
- preserve local, non-destructive storage of states, overlays, prompts, handoffs, references, artefacts and versions;
- require a real `codex-image-gen` origin before an artefact can be accepted;
- add or update tests when behaviour changes.

## Validation before a pull request

Run from the repository root:

```powershell
npm run privacy:check
npm run test
npm run check
npm run preflight:local-deploy
```

When working in a local Codex development environment, also run the plugin validator:

```powershell
python <path-to-plugin-creator>/scripts/validate_plugin.py .
```

## Pull request notes

Include:

- the problem and user-visible result;
- files changed;
- validation commands and results;
- screenshots or interaction evidence when the UI changed;
- any host-level limitation that could not be tested locally.

Public visibility does not grant unrestricted reuse. Review the repository `LICENSE` before redistributing or integrating the code.
