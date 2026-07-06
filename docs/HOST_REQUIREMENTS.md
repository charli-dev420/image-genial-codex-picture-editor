# Conversation Host Requirements

Codex Image Editor intentionally does not generate images in its MCP server and must not send the user to an external app. A production Codex host must provide these capabilities inside the conversation surface:

- Render MCP resources with `text/html;profile=mcp-app` inline in the discussion.
- Support `openai/outputTemplate` on tool results.
- Let the widget call MCP tools through the Codex host bridge.
- Let Codex pass visible conversation images/artifacts to MCP tools, or allow the widget to associate local/imported images manually inside the same inline card.
- Let Codex call the built-in Image Gen tool from the generated `$imagegen` prompt.
- Let Codex save or move selected Image Gen artifacts into the workspace before calling `save_generated_result`.
- Let the widget or Codex record host capabilities with `record_host_capabilities`, including whether inline widgets, the tool bridge, native Image Gen, artifact bridge, and workspace artifact saving are actually available.
- Let the plugin create and preserve handoff packets with required `view_image` instructions before Codex calls native Image Gen.
- Let candidate Image Gen artifacts be registered, reviewed, accepted, or rejected through the inline Artifact Bridge without reloading the conversation block.
- Let the inline widget update itself from real MCP tool results without reloading the conversation block.
- Treat status changes such as `waiting_for_codex_image_gen`, `artifact_received`, and `drift_detected` as recorded workflow events, not synthetic progress.

If the host cannot render the editor inside the conversation or surface built-in Image Gen artifacts back to the plugin workflow, the plugin must stop at exported context packets and report the host limitation instead of inventing a result or opening an external workflow.

Production release requires a live host pass that confirms `create_codex_handoff`, native `image_gen`, `register_artifact_candidate`, and `resolve_artifact_candidate` operate on real Codex/Image Gen artifacts. Until that pass is run, validation is local-contract complete but host-artifact incomplete.
