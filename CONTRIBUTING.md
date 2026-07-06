# Contributing

This project is source-available and currently maintained as a controlled Codex plugin bundle. Contributions should preserve the existing local-first, conversation-native design.

## Development Rules

- Keep the MCP server non-generative.
- Do not add direct Images API calls, API keys, cloud backends, network fetches, fallback generators, or simulated production artifacts.
- Keep UI changes inside the inline MCP widget.
- Preserve local, non-destructive storage of states, overlays, prompts, handoffs, references, artifacts, and versions.
- Add or update tests when behavior changes.

## Validation Before A PR

Run from the repository root:

```powershell
npm run test
npm run check
```

When working in a local Codex development environment, also run the plugin validator:

```powershell
python <path-to-plugin-creator>/scripts/validate_plugin.py .
```

## Pull Request Notes

Include:

- summary of behavior changed;
- files touched;
- validation commands and results;
- any host-level limitation that could not be tested locally.
