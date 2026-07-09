# Local Deployment

## Scope

This procedure installs the complete `codex-image-editor` bundle through the personal Codex marketplace. It does not configure a standalone MCP server, use an API key, or enable any Image Gen feature flag.

## Preconditions

- Windows with Git, Python, and Node `>=22 <25` available to the Codex desktop process.
- A clean source checkout tracking `origin/main`.
- `%USERPROFILE%\.agents\plugins\marketplace.json` with the `personal` marketplace.
- A Codex desktop session authenticated through ChatGPT/Codex.

## Deploy

Run from the source checkout:

```powershell
.\scripts\deploy-local.ps1 -Apply
```

The script creates or updates `%USERPROFILE%\.agents\plugins\plugins\codex-image-editor`, validates the checkout, applies a generated `+codex.*` cachebuster only in that deployment checkout, and atomically appends or repairs the marketplace entry. Existing marketplace entries are preserved.

It writes the current report to:

```text
%USERPROFILE%\.agents\plugins\reports\codex-image-editor.json
```

The script prints a `codex://` detail link. Install or enable the plugin from that desktop page, then open a new thread. When the installed CLI later exposes `codex plugin`, the optional command is:

```powershell
.\scripts\deploy-local.ps1 -Apply -InstallPlugin
```

## Host Gate

After installation, a real desktop thread must confirm all of the following:

1. `get_editor_state` renders the MCP card inline and `window.openai.callTool` works.
2. A request with image target, references, correction zones, and freeze/protect zones creates a handoff.
3. Codex uses native `image_gen` after the generated `view_image` instructions.
4. A real artifact is saved into the workspace, registered with origin `codex-image-gen`, and accepted or rejected inline.

If native Image Gen, the inline widget, or artifact return is unavailable, the expected outcome is `host_blocked`. The plugin must not switch to an external generator or produce a simulated result.
