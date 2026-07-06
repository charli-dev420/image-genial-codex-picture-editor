---
name: image-editor
description: Use automatically when the conversation contains an image generation or image editing task that would benefit from marking zones, freezing elements, reviewing references, annotating errors, or saving Image Gen versions. Render the inline editor in the Codex discussion with MCP output templates. This workflow must use Codex's built-in image_gen path and must not use external image APIs, API keys, or CLI fallback.
---

# Codex Image Editor

This skill routes image editing through the user's native Codex Image Gen capability. The plugin renders an inline editor in the Codex conversation and prepares local canvas context; Codex performs the actual image generation or edit with the built-in `image_gen` tool.

## Conversation-Native Rule

- The editor must appear inside the Codex discussion as an inline MCP-rendered card.
- Do not route the user to an external website, external desktop app, separate SaaS, or ordinary browser workflow.
- Do not make the user manually choose a separate tool if the current conversation already contains an image-editing intent; select this skill and call `get_editor_state`.
- Use the chat thread as the orchestration surface: references, source images, region notes, generated images, and review decisions remain visible in conversation.

## Hard Boundary

- Use the built-in `image_gen` tool for generation and editing.
- Do not use direct Image API client calls.
- Do not use the fallback CLI image generator.
- Do not ask for, read, or require an API key.
- Do not simulate generation progress or fabricate result artifacts.
- If the built-in Image Gen tool is unavailable, stop and report that Codex Image Gen is unavailable in this session.

## Required Workflow

1. When the context fits, call `get_editor_state`; the tool returns the inline editor widget for the current Codex discussion.
2. Let the user import or identify the target image, then mark regions:
   - `correct`: areas to change.
   - `freeze`: areas that must remain unchanged.
   - `error`: visual mistakes to fix.
   - `reference`: style, content, or composition references.
3. Use `update_editor_state` for autosave or explicit save from the inline block. This records a real `state_saved` event.
4. Use `add_reference_image` and `remove_reference_image` for reference images. References are stored locally with notes, weights, previews, and hashes.
5. If a zone is coarse, overlaps protected content, or needs reliable targeting, use Precision before export:
   - `set_zone_geometry` for exact `include`, `exclude`, and `protect` bounds or points.
   - `refine_zone` for contract, dilate, simplify, subtract, merge, or duplicate-as-protect overlay edits.
   - `validate_zone_precision` to block empty, invalid, out-of-image, or freeze/protect-overlapping zones.
   - `create_precision_preview` to export reviewable overlay SVG/JSON without generating an image.
   - `list_zone_presets`, `save_zone_preset`, `apply_zone_preset`, and `delete_zone_preset` for local presets only.
6. When the user gives prompt text, attached images, generated images, or ambiguous references, use the Request Builder tools before export:
   - `ingest_conversation_inputs` to hash and persist the prompt, images, artifacts, notes, and current editor state.
   - `classify_image_roles` to set each image as `edit_target`, `reference`, `style_reference`, `insert_source`, `previous_result`, or `rejected_result`.
   - `normalize_prompt_request` to detect `generate`/`edit`, choose the Image Gen use-case slug, and extract constraints without inventing extra requirements.
   - `translate_prompt_request` only to store a Codex-provided working translation. Never call an external translation service.
   - `validate_imagegen_request` to block critical conflicts, especially edit requests with no clear target image.
7. Prefer `create_imagegen_request_from_inputs` after a valid Request Builder pass. Use `create_generation_request` directly only for the older raw prompt workflow. `export_image_context` remains valid as a compatibility wrapper.
8. Use the returned `handoff` or call `create_codex_handoff` for an existing context. The handoff contains the exact prompt, required `view_image` instructions, expected result path, hashes, and host blockers.
9. Use `record_host_capabilities` when the host or widget can report real capabilities. If the handoff returns `host_blocked`, stop and report the missing host capability instead of opening an external workflow.
10. Read the returned prompt. It is written for `$imagegen` and contains the original prompt, normalized prompt, optional working translation, image roles, precision include/exclude/protect geometry, overlays, references, invariants, hashes, `view_image` instructions, and result-saving instruction.
11. Record `codex_imagegen_requested` or `waiting_for_codex_image_gen` only when Codex is actually about to run or has just run the built-in Image Gen flow. Do not record those statuses at simple prompt export time.
12. If the edit target or references are local files, first make them visible to Codex with `view_image`, then call the built-in `image_gen` tool.
13. Move or copy the selected built-in Image Gen artifact into the workspace path specified by the context packet.
14. Register the candidate with `register_artifact_candidate`. Accept it with `resolve_artifact_candidate` only when `origin` is exactly `codex-image-gen`; this delegates to `save_generated_result`. Use `save_generated_result` directly only for compatibility with older flows.
15. Use `compare_version` for review diagnostics and `create_retry_request` when a version is rejected or frozen-region drift is detected.
16. Use `list_pending_generations`, `list_versions`, `commit_version`, or `reject_version` for final review decisions.

## Prompt Discipline

When composing or refining an edit prompt:

- Repeat all frozen-region invariants.
- State that corrections apply only to marked `correct` or `error` regions.
- Keep each iteration focused on one requested change when possible.
- Preserve file paths and version IDs exactly.
- Treat overlay geometry as guidance for Codex and the user, not as a direct mask API.
- Treat `include/exclude/protect` as explicit prompt geometry, not a direct Image Gen mask parameter.
- Include reference image paths, weights, and notes in the prompt as references only, not as edit targets.
- Preserve exact in-image text separately from any working translation; text listed as verbatim must stay in the language supplied by the user.
- If `compare_version` reports `drift_detected`, keep the retry prompt narrow and repeat frozen-region invariants.

## Failure Rules

- If no target image is visible in the conversation, ask the user to attach it or call `view_image` on a local file before using Image Gen.
- If the generated image cannot be traced to a built-in Codex Image Gen artifact, do not save it as a final version.
- If the host cannot bridge or save artifacts from built-in Image Gen, mark the handoff `host_blocked` and keep the exported request pending.
- If a result appears to alter frozen regions, reject or mark it for review and prepare a narrower follow-up context.
- Do not record synthetic generation progress. Only record events caused by real widget actions, Codex actions, or artifact registration.
