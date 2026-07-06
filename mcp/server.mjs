import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const widgetUri = "ui://codex-image-editor/editor.html";
const editorDirName = ".codex-image-editor";
const previewMaxBytes = 8 * 1024 * 1024;
const invariantSampleLimit = 250000;
const eventTypes = [
  "state_saved",
  "context_exported",
  "waiting_for_codex_image_gen",
  "artifact_received",
  "review_ready",
  "drift_detected",
  "version_committed",
  "version_rejected",
  "retry_created",
  "reference_added",
  "reference_removed",
  "request_ingested",
  "request_normalized",
  "request_translated",
  "request_validated",
  "image_roles_classified",
  "zone_precision_validated",
  "zone_refined",
  "zone_geometry_set",
  "precision_preview_created",
  "preset_saved",
  "preset_applied",
  "preset_deleted",
  "host_capabilities_recorded",
  "handoff_created",
  "handoff_event_recorded",
  "artifact_candidate_received",
  "artifact_candidate_resolved",
  "host_blocked"
];
const referenceWeights = ["low", "medium", "high"];
const imageRoles = ["edit_target", "reference", "style_reference", "insert_source", "previous_result", "rejected_result"];
const zoneSubtypes = ["include", "exclude", "protect"];
const edgeModes = ["hard", "soft"];
const presetKinds = ["zone", "layer", "prompt", "review"];
const refineOperations = ["contract", "dilate", "smooth", "simplify", "subtract", "merge", "duplicate_as_protect"];
const handoffStatuses = [
  "ready_for_handoff",
  "view_image_required",
  "codex_imagegen_requested",
  "awaiting_artifact",
  "artifact_candidate_received",
  "registered",
  "host_blocked",
  "failed"
];
const terminalHandoffStatuses = ["registered", "failed"];
const artifactCandidateStatuses = ["pending", "registered", "rejected"];
const hostCapabilityKeys = [
  "inlineMcpWidget",
  "callToolBridge",
  "visibleConversationImages",
  "artifactBridge",
  "workspaceArtifactSave",
  "canAttachLocalImages",
  "canCallNativeImageGen"
];
const constraintKeys = [
  "must_keep",
  "must_change",
  "must_avoid",
  "text_verbatim",
  "style_constraints",
  "composition_constraints",
  "identity_constraints",
  "output_use",
  "review_checks"
];
const generateUseCases = [
  "photorealistic-natural",
  "product-mockup",
  "ui-mockup",
  "infographic-diagram",
  "scientific-educational",
  "ads-marketing",
  "productivity-visual",
  "logo-brand",
  "illustration-story",
  "stylized-concept",
  "historical-scene"
];
const editUseCases = [
  "text-localization",
  "identity-preserve",
  "precise-object-edit",
  "lighting-weather",
  "background-extraction",
  "style-transfer",
  "compositing",
  "sketch-to-render"
];
const defaultPresetDefinitions = {
  zone: [
    { presetId: "object_removal_precise", label: "Object removal precise", values: { edgeMode: "hard", safetyMarginPx: 2, featherPx: 1, priority: "high", constraintType: "correct" } },
    { presetId: "face_identity_lock", label: "Face identity lock", values: { edgeMode: "soft", safetyMarginPx: 8, featherPx: 3, priority: "high", constraintType: "freeze" } },
    { presetId: "background_only", label: "Background only", values: { edgeMode: "soft", safetyMarginPx: 4, featherPx: 6, priority: "medium", constraintType: "correct" } },
    { presetId: "text_fix_box", label: "Text fix box", values: { edgeMode: "hard", safetyMarginPx: 1, featherPx: 0, priority: "high", constraintType: "correct" } },
    { presetId: "edge_cleanup", label: "Edge cleanup", values: { edgeMode: "soft", safetyMarginPx: 1, featherPx: 2, priority: "medium", constraintType: "correct" } },
    { presetId: "small_artifact_fix", label: "Small artifact fix", values: { edgeMode: "soft", safetyMarginPx: 0, featherPx: 1, priority: "medium", constraintType: "error" } }
  ],
  layer: [
    { presetId: "strict_freeze", label: "Strict freeze", values: { layer: "freeze", visible: true, locked: true, opacity: 0.9 } },
    { presetId: "soft_reference", label: "Soft reference", values: { layer: "reference", visible: true, locked: false, opacity: 0.45 } },
    { presetId: "high_priority_error", label: "High priority error", values: { layer: "error", visible: true, locked: false, opacity: 0.85 } },
    { presetId: "localized_correction", label: "Localized correction", values: { layer: "correct", visible: true, locked: false, opacity: 0.75 } }
  ],
  prompt: [
    { presetId: "minimal_change", label: "Minimal change", values: { must_keep: ["Preserve everything outside the marked include zone."], must_avoid: ["Do not introduce unrelated changes."] } },
    { presetId: "preserve_identity", label: "Preserve identity", values: { identity_constraints: ["Preserve face, body, pose, and identity."], review_checks: ["Review identity drift before accepting."] } },
    { presetId: "repair_generation_error", label: "Repair generation error", values: { must_change: ["Repair only the marked generation error."], must_keep: ["Keep surrounding content unchanged."] } },
    { presetId: "match_reference_style", label: "Match reference style", values: { style_constraints: ["Use labelled style references as style guidance only."] } },
    { presetId: "background_replacement", label: "Background replacement", values: { must_change: ["Change the background only."], must_keep: ["Preserve subject edges and foreground details."] } }
  ],
  review: [
    { presetId: "strict_pixel_freeze", label: "Strict pixel freeze", values: { freezeTolerance: 0, requiresPixelCheck: true } },
    { presetId: "dimension_only", label: "Dimension only", values: { requiresDimensionCheck: true, requiresPixelCheck: false } },
    { presetId: "visual_review_required", label: "Visual review required", values: { requiresHumanReview: true } }
  ]
};

const tools = [
  t(
    "update_editor_state",
    "Update Editor State",
    "Atomically persist the inline editor state and record a real state_saved event.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      editorState: { type: "object", additionalProperties: true }
    }, ["editorState"]),
    false
  ),
  t(
    "add_reference_image",
    "Add Reference Image",
    "Persist a local or inline-imported reference image with note, weight, preview, and hash.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      referenceImagePath: p("Optional workspace-local reference image path."),
      imageDataUrl: p("Optional PNG/JPEG/WEBP data URL imported from the inline widget."),
      fileName: p("Optional source file name for imported data URL."),
      note: p("How Codex should use this reference."),
      weight: { type: "string", enum: referenceWeights, description: "Reference influence weight." }
    }),
    false
  ),
  t(
    "remove_reference_image",
    "Remove Reference Image",
    "Remove a reference from the active editor state without deleting generated versions.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      referenceId: p("Reference id to remove.")
    }, ["referenceId"]),
    false
  ),
  t(
    "ingest_conversation_inputs",
    "Ingest Conversation Inputs",
    "Persist user text, visible images, local imports, Codex artifacts, and notes as a hashed request input package. This does not generate images.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      userText: p("Original user prompt from the Codex conversation."),
      images: { type: "array", description: "Images visible or manually associated with the request.", items: { type: "object", additionalProperties: true } },
      artifacts: { type: "array", description: "Codex artifacts to associate with the request.", items: { type: "object", additionalProperties: true } },
      notes: p("Request-builder notes."),
      context: { type: "object", additionalProperties: true },
      editorState: { type: "object", additionalProperties: true }
    }),
    false
  ),
  t(
    "classify_image_roles",
    "Classify Image Roles",
    "Propose or persist image roles for the latest ingested request: edit target, references, insert sources, previous or rejected results.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      inputPackageId: p("Optional input package id; defaults to latest."),
      intent: { type: "string", enum: ["generate", "edit"], description: "Optional known request intent." },
      imageRoles: { type: "array", description: "Optional user-corrected roles keyed by imageId.", items: { type: "object", additionalProperties: true } }
    }),
    false
  ),
  t(
    "normalize_prompt_request",
    "Normalize Prompt Request",
    "Detect intent/use case, extract constraints, and create a structured prompt draft without adding unsupported creative requirements.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      inputPackageId: p("Optional input package id; defaults to latest."),
      userText: p("Optional prompt override."),
      intent: { type: "string", enum: ["generate", "edit"], description: "Optional intent override from Codex or the widget." },
      constraintsOverride: { type: "object", additionalProperties: true }
    }),
    false
  ),
  t(
    "translate_prompt_request",
    "Store Prompt Translation",
    "Store a Codex-provided working translation while preserving verbatim in-image text separately. This tool does not call a translation API.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      inputPackageId: p("Optional input package id; defaults to latest."),
      draftId: p("Optional normalized draft id; defaults to latest."),
      targetLanguage: p("Working language, usually en."),
      workingTranslation: p("Translation supplied by Codex in the conversation."),
      translatorNote: p("Optional note about preserved text or ambiguity.")
    }),
    false
  ),
  t(
    "validate_imagegen_request",
    "Validate Image Gen Request",
    "Validate that the normalized request is executable by the built-in Codex Image Gen flow and return blocking errors and warnings.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      inputPackageId: p("Optional input package id; defaults to latest."),
      draftId: p("Optional normalized draft id; defaults to latest.")
    }),
    false
  ),
  t(
    "create_imagegen_request_from_inputs",
    "Create Image Gen Request From Inputs",
    "Create the final $imagegen packet from ingested conversation inputs, roles, constraints, and overlays. This does not generate images.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      inputPackageId: p("Optional input package id; defaults to latest."),
      draftId: p("Optional normalized draft id; defaults to latest."),
      editorState: { type: "object", additionalProperties: true },
      expectedResultPath: p("Optional workspace-local path where Codex should save the Image Gen result.")
    }),
    false
  ),
  t(
    "validate_zone_precision",
    "Validate Zone Precision",
    "Validate composed include/exclude/protect geometry, coverage, and conflicts. This does not edit pixels.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      shapeId: p("Optional zone id; validates all zones when omitted."),
      editorState: { type: "object", additionalProperties: true }
    }),
    false
  ),
  t(
    "refine_zone",
    "Refine Zone Geometry",
    "Apply non-destructive geometry operations to a zone overlay: contract, dilate, simplify, subtract, merge, or duplicate as protect.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      shapeId: p("Zone id to refine."),
      operation: { type: "string", enum: refineOperations, description: "Overlay-only refinement operation." },
      amountPx: { type: "number", description: "Pixel amount for contract/dilate/smooth." },
      sourceShapeId: p("Optional second zone id for subtract/merge."),
      targetSubtype: { type: "string", enum: zoneSubtypes, description: "Subtype to update when applicable." },
      editorState: { type: "object", additionalProperties: true }
    }, ["shapeId", "operation"]),
    false
  ),
  t(
    "set_zone_geometry",
    "Set Zone Geometry",
    "Persist precise coordinates or points for include/exclude/protect sub-zones from the inline widget.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      shapeId: p("Zone id to update."),
      subtype: { type: "string", enum: zoneSubtypes, description: "Geometry subtype." },
      subzoneId: p("Optional exclude/protect sub-zone id to replace."),
      bounds: { type: "object", additionalProperties: true },
      points: { type: "array", items: { type: "object", additionalProperties: true } },
      edgeMode: { type: "string", enum: edgeModes, description: "hard or soft edge." },
      safetyMarginPx: { type: "number" },
      featherPx: { type: "number" },
      editorState: { type: "object", additionalProperties: true }
    }, ["shapeId", "subtype"]),
    false
  ),
  t(
    "create_precision_preview",
    "Create Precision Preview",
    "Export a precision overlay SVG/JSON preview for review without generating or editing an image.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      shapeId: p("Optional zone id; includes all visible zones when omitted."),
      editorState: { type: "object", additionalProperties: true }
    }),
    false
  ),
  t(
    "list_zone_presets",
    "List Zone Presets",
    "List built-in and local precision presets for zones, layers, prompts, and review.",
    s({
      workspaceRoot: p("Workspace root where presets are stored."),
      sessionId: p("Editor session id."),
      kind: { type: "string", enum: presetKinds, description: "Preset kind to list." }
    }),
    true
  ),
  t(
    "save_zone_preset",
    "Save Zone Preset",
    "Save a local hashed preset for precision zones, layers, prompts, or review.",
    s({
      workspaceRoot: p("Workspace root where presets are stored."),
      sessionId: p("Editor session id."),
      kind: { type: "string", enum: presetKinds, description: "Preset kind." },
      presetId: p("Optional preset id; generated from label when omitted."),
      label: p("Preset label."),
      values: { type: "object", additionalProperties: true }
    }, ["kind", "label", "values"]),
    false
  ),
  t(
    "apply_zone_preset",
    "Apply Zone Preset",
    "Apply a local or built-in preset to a zone, layer, prompt constraints, or review settings.",
    s({
      workspaceRoot: p("Workspace root where presets are stored."),
      sessionId: p("Editor session id."),
      kind: { type: "string", enum: presetKinds, description: "Preset kind." },
      presetId: p("Preset id."),
      shapeId: p("Optional target zone id for zone presets."),
      editorState: { type: "object", additionalProperties: true }
    }, ["kind", "presetId"]),
    false
  ),
  t(
    "delete_zone_preset",
    "Delete Zone Preset",
    "Remove a user-saved local preset. Built-in presets cannot be deleted.",
    s({
      workspaceRoot: p("Workspace root where presets are stored."),
      sessionId: p("Editor session id."),
      kind: { type: "string", enum: presetKinds, description: "Preset kind." },
      presetId: p("Preset id.")
    }, ["kind", "presetId"]),
    false
  ),
  t(
    "record_host_capabilities",
    "Record Host Capabilities",
    "Persist the real Codex host capabilities available to the inline editor. This only records host facts and blockers.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      capabilities: { type: "object", additionalProperties: true },
      reportedBy: p("Optional reporter label, usually widget or codex.")
    }, ["capabilities"]),
    false
  ),
  t(
    "create_codex_handoff",
    "Create Codex Image Gen Handoff",
    "Create a non-generative handoff packet for Codex to run view_image and the built-in image_gen tool.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      contextId: p("Optional context id. Defaults to the latest generated request."),
      hostCapabilities: { type: "object", additionalProperties: true }
    }),
    false
  ),
  t(
    "record_handoff_event",
    "Record Handoff Event",
    "Record a real handoff state change caused by Codex, the widget, or an artifact bridge event.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      handoffId: p("Handoff id to update."),
      contextId: p("Optional context id if handoff id is unavailable."),
      status: { type: "string", enum: handoffStatuses, description: "Real handoff status." },
      message: p("Short event message."),
      data: { type: "object", additionalProperties: true }
    }, ["status"]),
    false
  ),
  t(
    "register_artifact_candidate",
    "Register Artifact Candidate",
    "Register a possible Codex Image Gen artifact for review before it is accepted as a version.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      contextId: p("Context id for the generated request."),
      handoffId: p("Optional handoff id."),
      artifactPath: p("Optional workspace-local artifact path."),
      artifactId: p("Optional Codex artifact id."),
      codexTurnId: p("Optional Codex turn id or thread note."),
      origin: p("Must be codex-image-gen before acceptance."),
      notes: p("Optional candidate notes.")
    }, ["origin"]),
    false
  ),
  t(
    "resolve_artifact_candidate",
    "Resolve Artifact Candidate",
    "Accept or reject a registered artifact candidate. Accepting uses save_generated_result and still requires origin codex-image-gen.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      candidateId: p("Artifact candidate id."),
      decision: { type: "string", enum: ["accept", "reject"], description: "Candidate decision." },
      reason: p("Required when rejecting or useful review note when accepting.")
    }, ["candidateId", "decision"]),
    false
  ),
  t(
    "list_pending_generations",
    "List Pending Generations",
    "List non-terminal handoffs and artifact candidates for the current inline editor session.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id.")
    }),
    true
  ),
  t(
    "create_generation_request",
    "Create Image Gen Request",
    "Persist the marked editor state and generate a strict $imagegen request packet. This does not generate images.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      baseImagePath: p("Local target image path inside the workspace root."),
      userRequest: p("User-facing edit request."),
      editorState: { type: "object", additionalProperties: true },
      expectedResultPath: p("Optional workspace-local path where Codex should save the Image Gen result."),
      source: p("Optional request source label.")
    }, ["userRequest"]),
    false
  ),
  t(
    "get_editor_state",
    "Show Inline Codex Image Editor",
    "Render the conversation-native editor card and read the current local canvas state.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Optional editor session id.")
    }),
    true,
    { "openai/outputTemplate": widgetUri }
  ),
  t(
    "export_image_context",
    "Export Image Context",
    "Persist the marked editor state and generate a strict $imagegen prompt packet. This does not generate images.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      baseImagePath: p("Local target image path inside the workspace root."),
      userRequest: p("User-facing edit request."),
      editorState: { type: "object", additionalProperties: true },
      expectedResultPath: p("Optional workspace-local path where Codex should save the Image Gen result.")
    }, ["userRequest"]),
    false
  ),
  t(
    "save_generated_result",
    "Save Generated Result",
    "Register a real Codex Image Gen artifact as a local reviewed version. This does not generate images.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      contextId: p("Context id returned by export_image_context."),
      artifactPath: p("Workspace-local image artifact path produced by Codex Image Gen."),
      origin: p("Must be codex-image-gen."),
      codexTurnId: p("Optional Codex turn id or thread note."),
      notes: p("Optional review notes.")
    }, ["artifactPath", "origin"]),
    false
  ),
  t(
    "record_generation_event",
    "Record Generation Event",
    "Record a real Codex/Image Gen workflow event in the local session journal.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      eventType: { type: "string", enum: eventTypes, description: "Real workflow event type." },
      contextId: p("Optional generation context/request id."),
      versionId: p("Optional generated version id."),
      message: p("Short event message."),
      data: { type: "object", additionalProperties: true }
    }, ["eventType"]),
    false
  ),
  t(
    "compare_version",
    "Compare Image Version",
    "Compare a generated version with its source context and return review diagnostics.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      versionId: p("Version id to compare."),
      contextId: p("Optional context id override.")
    }, ["versionId"]),
    true
  ),
  t(
    "create_retry_request",
    "Create Retry Request",
    "Create a narrower $imagegen request from a rejected version or drift warning.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      versionId: p("Version id that needs retry."),
      reason: p("Retry reason or rejection note."),
      userRequest: p("Optional replacement user request."),
      expectedResultPath: p("Optional workspace-local path for the retry result.")
    }, ["versionId"]),
    false
  ),
  t(
    "list_versions",
    "List Image Versions",
    "List local generated result versions for an editor session.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id.")
    }),
    true
  ),
  t(
    "commit_version",
    "Commit Image Version",
    "Mark a generated result version as accepted and optionally copy it to a final workspace path.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      versionId: p("Version id to commit."),
      exportPath: p("Optional final workspace-local output path.")
    }, ["versionId"]),
    false
  ),
  t(
    "reject_version",
    "Reject Image Version",
    "Mark a generated result version as rejected with a reason.",
    s({
      workspaceRoot: p("Workspace root where editor state is stored."),
      sessionId: p("Editor session id."),
      versionId: p("Version id to reject."),
      reason: p("Reason for rejection.")
    }, ["versionId", "reason"]),
    false
  )
];

function p(description = "") {
  return { type: "string", description };
}

function s(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function t(name, title, description, inputSchema, readOnly = false, meta = {}) {
  return {
    name,
    title,
    description,
    inputSchema,
    annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false },
    ...(Object.keys(meta).length ? { _meta: meta } : {})
  };
}

function now() {
  return new Date().toISOString();
}

function safeId(value, fallback = "session") {
  const cleaned = String(value || "").replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function workspaceRoot(args = {}) {
  const root = path.resolve(args.workspaceRoot || process.env.CODEX_IMAGE_EDITOR_WORKSPACE || process.cwd());
  return root;
}

function assertInside(root, target, label = "path") {
  const resolved = path.resolve(target);
  const rel = path.relative(root, resolved);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return resolved;
  throw new Error(`${label} must stay inside workspace root: ${resolved}`);
}

function sessionId(args = {}) {
  return safeId(args.sessionId || "default", "default");
}

function sessionDir(root, id) {
  return path.join(root, editorDirName, "sessions", safeId(id, "default"));
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  renameSync(temp, file);
}

function statePath(root, id) {
  return path.join(sessionDir(root, id), "state.json");
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256File(file) {
  return sha256Buffer(readFileSync(file));
}

function sha256Json(value) {
  return sha256Buffer(Buffer.from(JSON.stringify(value), "utf8"));
}

function eventLogPath(root, id) {
  return path.join(sessionDir(root, id), "events.jsonl");
}

function appendEvent(root, id, eventType, payload = {}) {
  if (!eventTypes.includes(eventType)) throw new Error(`Unsupported event type: ${eventType}`);
  const event = {
    eventId: uniqueId("evt"),
    eventType,
    sessionId: id,
    createdAt: now(),
    contextId: payload.contextId || "",
    versionId: payload.versionId || "",
    message: payload.message || "",
    data: payload.data || {}
  };
  ensureDir(sessionDir(root, id));
  appendFileSync(eventLogPath(root, id), `${JSON.stringify(event)}\n`, "utf8");
  const state = loadState(root, id);
  state.events = [...(state.events || []), event].slice(-250);
  state.updatedAt = now();
  writeJson(statePath(root, id), state);
  return event;
}

function defaultState(root, id) {
  const layerSettings = {};
  for (const layer of ["correct", "freeze", "error", "reference"]) {
    layerSettings[layer] = { visible: true, locked: false, opacity: 1 };
  }
  return {
    schemaVersion: 1,
    sessionId: id,
    workspaceRoot: root,
    baseImagePath: "",
    imageInfo: null,
    userRequest: "",
    activeTool: "brush",
    activeLayer: "correct",
    precisionMode: false,
    layers: {
      correct: [],
      freeze: [],
      error: [],
      reference: []
    },
    layerSettings,
    annotations: [],
    references: [],
    events: [],
    versions: [],
    generationRequests: [],
    reviewReports: [],
    artifactHashes: {},
    conversationInputs: [],
    imageRoles: {},
    promptDrafts: [],
    translations: [],
    constraintSets: [],
    requestValidationReports: [],
    precisionReports: [],
    precisionPreviews: [],
    presets: [],
    appliedPresets: [],
    hostCapabilities: {},
    handoffs: [],
    pendingGenerations: [],
    artifactCandidates: [],
    handoffEvents: [],
    activeInputPackageId: "",
    activePromptDraftId: "",
    selectedShapeId: "",
    activeVersionId: "",
    createdAt: now(),
    updatedAt: now()
  };
}

function loadState(root, id) {
  const file = statePath(root, id);
  const state = readJson(file, null);
  if (state) return normalizeState({ ...state, workspaceRoot: root, sessionId: id });
  const fresh = defaultState(root, id);
  writeJson(file, fresh);
  return fresh;
}

function normalizeState(input = {}) {
  const base = defaultState(input.workspaceRoot || "", input.sessionId || "default");
  const state = { ...base, ...input };
  state.layers = { ...base.layers, ...(input.layers || {}) };
  for (const key of ["correct", "freeze", "error", "reference"]) {
    state.layers[key] = Array.isArray(state.layers[key]) ? state.layers[key] : [];
    state.layers[key] = state.layers[key].map((shape) => normalizeZoneShape(shape, key, state.imageInfo || input.imageInfo || null));
  }
  state.annotations = Array.isArray(state.annotations) ? state.annotations : [];
  state.references = Array.isArray(state.references) ? state.references.map(stripPreviewFields) : [];
  state.events = Array.isArray(state.events) ? state.events : [];
  state.versions = Array.isArray(state.versions) ? state.versions.map(stripPreviewFields) : [];
  state.generationRequests = Array.isArray(state.generationRequests) ? state.generationRequests : [];
  state.reviewReports = Array.isArray(state.reviewReports) ? state.reviewReports : [];
  state.artifactHashes = typeof state.artifactHashes === "object" && state.artifactHashes ? state.artifactHashes : {};
  state.conversationInputs = Array.isArray(state.conversationInputs) ? state.conversationInputs.map(stripConversationInputPreviews) : [];
  state.imageRoles = typeof state.imageRoles === "object" && state.imageRoles ? state.imageRoles : {};
  state.promptDrafts = Array.isArray(state.promptDrafts) ? state.promptDrafts : [];
  state.translations = Array.isArray(state.translations) ? state.translations : [];
  state.constraintSets = Array.isArray(state.constraintSets) ? state.constraintSets : [];
  state.requestValidationReports = Array.isArray(state.requestValidationReports) ? state.requestValidationReports : [];
  state.precisionReports = Array.isArray(state.precisionReports) ? state.precisionReports : [];
  state.precisionPreviews = Array.isArray(state.precisionPreviews) ? state.precisionPreviews : [];
  state.presets = Array.isArray(state.presets) ? state.presets : [];
  state.appliedPresets = Array.isArray(state.appliedPresets) ? state.appliedPresets : [];
  state.hostCapabilities = typeof state.hostCapabilities === "object" && state.hostCapabilities ? normalizeHostCapabilities(state.hostCapabilities) : {};
  state.handoffs = Array.isArray(state.handoffs) ? state.handoffs.map(normalizeHandoff).filter(Boolean) : [];
  state.pendingGenerations = Array.isArray(state.pendingGenerations) ? state.pendingGenerations.map(normalizePendingGeneration).filter(Boolean) : [];
  state.artifactCandidates = Array.isArray(state.artifactCandidates) ? state.artifactCandidates.map(normalizeArtifactCandidate).filter(Boolean) : [];
  state.handoffEvents = Array.isArray(state.handoffEvents) ? state.handoffEvents : [];
  state.activeInputPackageId = String(state.activeInputPackageId || "");
  state.activePromptDraftId = String(state.activePromptDraftId || "");
  state.layerSettings = { ...base.layerSettings, ...(input.layerSettings || {}) };
  for (const key of ["correct", "freeze", "error", "reference"]) {
    state.layerSettings[key] = { ...base.layerSettings[key], ...(state.layerSettings[key] || {}) };
    state.layerSettings[key].visible = state.layerSettings[key].visible !== false;
    state.layerSettings[key].locked = state.layerSettings[key].locked === true;
    state.layerSettings[key].opacity = clamp(Number(state.layerSettings[key].opacity ?? 1), 0.05, 1);
  }
  state.selectedShapeId = String(state.selectedShapeId || "");
  state.precisionMode = state.precisionMode === true;
  state.updatedAt = now();
  return state;
}

function stripPreviewFields(value) {
  const clone = { ...(value || {}) };
  delete clone.previewDataUrl;
  delete clone.baseImageDataUrl;
  delete clone.previewImageDataUrl;
  return clone;
}

function stripConversationInputPreviews(input) {
  const clone = { ...(input || {}) };
  clone.images = Array.isArray(clone.images) ? clone.images.map(stripPreviewFields) : [];
  delete clone.previewDataUrl;
  return clone;
}

function normalizeHostCapabilities(input = {}) {
  const caps = {};
  for (const key of hostCapabilityKeys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) caps[key] = boolValue(input[key], false);
  }
  caps.reportedBy = String(input.reportedBy || "");
  caps.reportedAt = String(input.reportedAt || "");
  caps.notes = String(input.notes || "");
  return caps;
}

function hasHostCapabilityReport(capabilities = {}) {
  return hostCapabilityKeys.some((key) => Object.prototype.hasOwnProperty.call(capabilities, key));
}

function hostBlockersForCapabilities(capabilities = {}) {
  if (!hasHostCapabilityReport(capabilities)) return [];
  const blockers = [];
  if (capabilities.inlineMcpWidget !== true) blockers.push("Host did not confirm inline MCP widget rendering.");
  if (capabilities.callToolBridge !== true) blockers.push("Host did not confirm the inline widget can call MCP tools.");
  if (capabilities.canCallNativeImageGen !== true) blockers.push("Host did not confirm native Codex Image Gen is callable.");
  if (capabilities.artifactBridge !== true && capabilities.workspaceArtifactSave !== true) blockers.push("Host cannot return or save Codex Image Gen artifacts into the workspace.");
  return blockers;
}

function normalizeHandoff(input = {}) {
  if (!input) return null;
  const contextId = String(input.contextId || "");
  const handoffId = String(input.handoffId || (contextId ? `handoff-${safeId(contextId)}` : ""));
  if (!handoffId) return null;
  const status = handoffStatuses.includes(input.status) ? input.status : "ready_for_handoff";
  return {
    handoffId,
    contextId,
    sessionId: String(input.sessionId || ""),
    createdAt: String(input.createdAt || now()),
    updatedAt: String(input.updatedAt || input.createdAt || now()),
    promptPath: String(input.promptPath || ""),
    contextPath: String(input.contextPath || ""),
    expectedResultPath: String(input.expectedResultPath || ""),
    overlayPath: String(input.overlayPath || ""),
    precisionPreviewPath: String(input.precisionPreviewPath || ""),
    precisionPreviewSha256: String(input.precisionPreviewSha256 || ""),
    requestSha256: String(input.requestSha256 || ""),
    promptSha256: String(input.promptSha256 || ""),
    imageGenPrompt: String(input.imageGenPrompt || ""),
    requiredImages: Array.isArray(input.requiredImages) ? input.requiredImages : [],
    viewImageInstructions: Array.isArray(input.viewImageInstructions) ? input.viewImageInstructions : [],
    hostCapabilities: normalizeHostCapabilities(input.hostCapabilities || {}),
    hostBlockers: Array.isArray(input.hostBlockers) ? input.hostBlockers.map(String) : [],
    status,
    events: Array.isArray(input.events) ? input.events : [],
    generationBoundary: {
      executor: "codex-built-in-image-gen",
      mcpGeneratesImages: false,
      apiFallbackAllowed: false,
      simulatedResultsAllowed: false,
      ...(input.generationBoundary || {})
    }
  };
}

function normalizePendingGeneration(input = {}) {
  if (!input?.handoffId) return null;
  return {
    handoffId: String(input.handoffId),
    contextId: String(input.contextId || ""),
    status: handoffStatuses.includes(input.status) ? input.status : "ready_for_handoff",
    expectedResultPath: String(input.expectedResultPath || ""),
    createdAt: String(input.createdAt || ""),
    updatedAt: String(input.updatedAt || ""),
    hostBlockers: Array.isArray(input.hostBlockers) ? input.hostBlockers.map(String) : []
  };
}

function normalizeArtifactCandidate(input = {}) {
  if (!input) return null;
  const candidateId = String(input.candidateId || "");
  if (!candidateId) return null;
  const status = artifactCandidateStatuses.includes(input.status) ? input.status : "pending";
  return {
    candidateId,
    contextId: String(input.contextId || ""),
    handoffId: String(input.handoffId || ""),
    artifactPath: String(input.artifactPath || ""),
    artifactId: String(input.artifactId || ""),
    codexTurnId: String(input.codexTurnId || ""),
    origin: String(input.origin || ""),
    sha256: String(input.sha256 || ""),
    imageInfo: input.imageInfo || null,
    receivedAt: String(input.receivedAt || now()),
    resolvedAt: String(input.resolvedAt || ""),
    status,
    versionId: String(input.versionId || ""),
    notes: String(input.notes || ""),
    rejectionReason: String(input.rejectionReason || "")
  };
}

function pendingFromHandoffs(handoffs = []) {
  return handoffs
    .filter((handoff) => !terminalHandoffStatuses.includes(handoff.status))
    .map((handoff) => normalizePendingGeneration({
      handoffId: handoff.handoffId,
      contextId: handoff.contextId,
      status: handoff.status,
      expectedResultPath: handoff.expectedResultPath,
      createdAt: handoff.createdAt,
      updatedAt: handoff.updatedAt,
      hostBlockers: handoff.hostBlockers || []
    }))
    .filter(Boolean);
}

function upsertByKey(list, key, item, limit = 100) {
  const filtered = (Array.isArray(list) ? list : []).filter((entry) => entry?.[key] !== item[key]);
  return [...filtered, item].slice(-limit);
}

function updateHandoffInState(state, handoff) {
  const normalized = normalizeHandoff(handoff);
  state.handoffs = upsertByKey(state.handoffs || [], "handoffId", normalized, 100);
  state.pendingGenerations = pendingFromHandoffs(state.handoffs);
  return normalized;
}

function requiredImagesForPacket(packet = {}) {
  const seen = new Set();
  const images = [];
  const add = (source) => {
    if (!source?.path) return;
    const role = source.role || "reference";
    const key = `${role}:${source.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    images.push({
      role,
      path: source.path,
      sha256: source.sha256 || source.hash || "",
      caption: source.caption || "",
      note: source.note || source.userNote || "",
      visibleInConversation: source.visibleInConversation === true,
      requiresViewImage: source.visibleInConversation !== true
    });
  };
  if (packet.baseImagePath) {
    add({ role: "edit_target", path: packet.baseImagePath, sha256: packet.baseImageSha256, caption: "Target image", visibleInConversation: false });
  }
  for (const image of packet.conversationImages || []) add(image);
  for (const reference of packet.references || []) add({ role: "reference", path: reference.path, sha256: reference.sha256, note: reference.note, visibleInConversation: false });
  return images;
}

function initialHandoffStatus(requiredImages, hostBlockers = []) {
  if (hostBlockers.length) return "host_blocked";
  if ((requiredImages || []).some((image) => image.requiresViewImage)) return "view_image_required";
  return "ready_for_handoff";
}

function buildCodexHandoff(root, id, packet, prompt, options = {}) {
  const hostCapabilities = normalizeHostCapabilities(options.hostCapabilities || loadState(root, id).hostCapabilities || {});
  const hostBlockers = hostBlockersForCapabilities(hostCapabilities);
  const requiredImages = requiredImagesForPacket(packet);
  const viewImageInstructions = requiredImages
    .filter((image) => image.requiresViewImage)
    .map((image) => ({
      tool: "view_image",
      path: image.path,
      role: image.role,
      reason: `Make ${image.role} visible in the Codex conversation before running native image_gen.`
    }));
  return normalizeHandoff({
    handoffId: options.handoffId || packet.handoffId || uniqueId("handoff"),
    contextId: packet.contextId,
    sessionId: id,
    createdAt: now(),
    updatedAt: now(),
    promptPath: packet.promptPath || "",
    contextPath: packet.contextPath || "",
    expectedResultPath: packet.expectedResultPath || "",
    overlayPath: packet.overlayPath || "",
    precisionPreviewPath: packet.precisionPreviewPath || "",
    precisionPreviewSha256: packet.precisionPreviewSha256 || "",
    requestSha256: packet.contextSha256 || "",
    promptSha256: packet.promptSha256 || "",
    imageGenPrompt: prompt || "",
    requiredImages,
    viewImageInstructions,
    hostCapabilities,
    hostBlockers,
    status: initialHandoffStatus(requiredImages, hostBlockers),
    generationBoundary: packet.generationBoundary || {}
  });
}

function persistHandoff(root, id, handoff, eventType = "handoff_created", message = "Codex Image Gen handoff created.") {
  const state = loadState(root, id);
  const normalized = updateHandoffInState(state, handoff);
  state.handoffEvents = [...(state.handoffEvents || []), {
    eventId: uniqueId("handoffevt"),
    handoffId: normalized.handoffId,
    contextId: normalized.contextId,
    status: normalized.status,
    createdAt: now(),
    message
  }].slice(-250);
  state.artifactHashes = {
    ...(state.artifactHashes || {}),
    [`${normalized.contextId}:handoff`]: sha256Json({ ...normalized, events: [] })
  };
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, eventType, {
    contextId: normalized.contextId,
    message,
    data: { handoffId: normalized.handoffId, status: normalized.status, hostBlockers: normalized.hostBlockers }
  });
  return { handoff: normalized, event };
}

function findHandoff(state, { handoffId = "", contextId = "" } = {}) {
  if (handoffId) return (state.handoffs || []).find((item) => item.handoffId === handoffId) || null;
  if (contextId) return latest(state.handoffs || [], (item) => item.contextId === contextId);
  return latest(state.handoffs || []);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return max;
  return Math.max(min, Math.min(max, value));
}

function imageInfo(file) {
  const data = readFileSync(file);
  if (data.length >= 24 && data.toString("ascii", 1, 4) === "PNG") {
    return { type: "png", width: data.readUInt32BE(16), height: data.readUInt32BE(20), bytes: data.length };
  }
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    return { type: "webp", width: null, height: null, bytes: data.length };
  }
  if (data.length >= 10 && data[0] === 0xff && data[1] === 0xd8) {
    let cursor = 2;
    while (cursor + 9 < data.length) {
      if (data[cursor] !== 0xff) break;
      const marker = data[cursor + 1];
      const length = data.readUInt16BE(cursor + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
        return { type: "jpeg", width: data.readUInt16BE(cursor + 7), height: data.readUInt16BE(cursor + 5), bytes: data.length };
      }
      cursor += 2 + length;
    }
    return { type: "jpeg", width: null, height: null, bytes: data.length };
  }
  throw new Error(`Unsupported or invalid image file: ${file}`);
}

function mimeForType(type) {
  if (type === "jpeg") return "image/jpeg";
  if (type === "webp") return "image/webp";
  return "image/png";
}

function dataUrlForFile(file) {
  const info = imageInfo(file);
  const size = statSync(file).size;
  if (size > previewMaxBytes) {
    return { dataUrl: "", previewUnavailableReason: `Image is ${size} bytes; inline preview limit is ${previewMaxBytes} bytes.` };
  }
  const data = readFileSync(file);
  return { dataUrl: `data:${mimeForType(info.type)};base64,${data.toString("base64")}`, previewUnavailableReason: "" };
}

function extensionForMime(mime) {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/png") return ".png";
  throw new Error(`Unsupported import MIME type: ${mime}`);
}

function saveDataUrlImage(root, id, dataUrl, fileName = "imported-image") {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("Imported image must be a PNG, JPEG, or WEBP data URL.");
  const mime = match[1].toLowerCase();
  const data = Buffer.from(match[2], "base64");
  if (!data.length) throw new Error("Imported image is empty.");
  const importsDir = ensureDir(path.join(sessionDir(root, id), "imports"));
  const cleanedName = safeId(path.basename(fileName, path.extname(fileName)), "image");
  const target = path.join(importsDir, `${Date.now().toString(36)}-${cleanedName}${extensionForMime(mime)}`);
  writeFileSync(target, data);
  const info = imageInfo(target);
  return { path: target, info, sha256: sha256Buffer(data) };
}

function assertImagePath(root, value, label) {
  if (!value) throw new Error(`${label} is required`);
  const resolved = assertInside(root, value, label);
  if (!existsSync(resolved)) throw new Error(`${label} does not exist: ${resolved}`);
  const info = imageInfo(resolved);
  return { path: resolved, info };
}

function normalizeZoneShape(shape = {}, layer = "correct", info = null) {
  const cloned = { ...(shape || {}) };
  const points = normalizePoints(cloned.points || cloned.include?.points || []);
  const bounds = normalizeBoundsObject(cloned.bounds || cloned.include?.bounds || boundsForPoints(points));
  cloned.id = String(cloned.id || uniqueId("shape"));
  cloned.kind = cloned.kind || cloned.type || cloned.include?.kind || "path";
  cloned.layer = cloned.layer || layer;
  cloned.points = points.length ? points : pointsForBounds(bounds);
  cloned.bounds = bounds || boundsForPoints(cloned.points || []);
  cloned.geometryVersion = Number(cloned.geometryVersion || 2);
  cloned.include = normalizeSubZone(cloned.include || {
    subtype: "include",
    kind: cloned.kind,
    points: cloned.points,
    bounds: cloned.bounds,
    closed: cloned.closed
  }, "include", cloned);
  cloned.exclude = Array.isArray(cloned.exclude) ? cloned.exclude.map((item) => normalizeSubZone(item, "exclude", cloned)).filter(Boolean) : [];
  cloned.protect = Array.isArray(cloned.protect) ? cloned.protect.map((item) => normalizeSubZone(item, "protect", cloned)).filter(Boolean) : [];
  cloned.edgeMode = edgeModes.includes(cloned.edgeMode) ? cloned.edgeMode : "soft";
  cloned.safetyMarginPx = clamp(Number(cloned.safetyMarginPx ?? 0), 0, 512);
  cloned.featherPx = clamp(Number(cloned.featherPx ?? 0), 0, 512);
  const validation = validateZoneObject(cloned, info, []);
  cloned.precisionScore = validation.precisionScore;
  cloned.warnings = validation.warnings;
  return cloned;
}

function normalizeSubZone(input, subtype, parent = {}) {
  if (!input) return null;
  const points = normalizePoints(input.points || []);
  const bounds = normalizeBoundsObject(input.bounds || boundsForPoints(points));
  const finalPoints = points.length ? points : pointsForBounds(bounds);
  const finalBounds = bounds || boundsForPoints(finalPoints);
  if (!finalBounds) return null;
  return {
    id: String(input.id || uniqueId(subtype)),
    subtype,
    kind: input.kind || parent.kind || "rectangle",
    points: finalPoints,
    bounds: finalBounds,
    closed: input.closed !== false,
    note: input.note || "",
    visible: input.visible !== false,
    locked: input.locked === true
  };
}

function normalizePoints(points) {
  if (!Array.isArray(points)) return [];
  return points.map((pnt) => ({ x: Number(pnt.x), y: Number(pnt.y) })).filter((pnt) => Number.isFinite(pnt.x) && Number.isFinite(pnt.y));
}

function normalizeBoundsObject(bounds) {
  if (!bounds) return null;
  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return {
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height)
  };
}

function pointsForBounds(bounds) {
  const b = normalizeBoundsObject(bounds);
  if (!b) return [];
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height }
  ];
}

function boundsUnion(items) {
  const boxes = items.map((item) => normalizeBoundsObject(item?.bounds || item)).filter(Boolean);
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((box) => box.x));
  const y0 = Math.min(...boxes.map((box) => box.y));
  const x1 = Math.max(...boxes.map((box) => box.x + box.width));
  const y1 = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function inflateBounds(bounds, amount) {
  const b = normalizeBoundsObject(bounds);
  const a = Number(amount || 0);
  if (!b) return null;
  return {
    x: b.x - a,
    y: b.y - a,
    width: Math.max(0, b.width + a * 2),
    height: Math.max(0, b.height + a * 2)
  };
}

function intersectBounds(a, b) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function boundsArea(bounds) {
  const b = normalizeBoundsObject(bounds);
  return b ? Math.max(0, b.width) * Math.max(0, b.height) : 0;
}

function findZoneById(state, shapeId) {
  for (const layer of ["correct", "freeze", "error", "reference"]) {
    const index = (state.layers[layer] || []).findIndex((shape) => shape.id === shapeId);
    if (index >= 0) return { layer, index, shape: state.layers[layer][index] };
  }
  return null;
}

function layerSummary(state) {
  return ["correct", "freeze", "error", "reference"].map((key) => ({
    layer: key,
    count: state.layers[key]?.length || 0,
    items: (state.layers[key] || []).map((shape, index) => ({
      index,
      id: shape.id || "",
      label: shape.label || "",
      kind: shape.kind || shape.type || "path",
      note: shape.note || "",
      constraintType: shape.constraintType || key,
      priority: shape.priority || "medium",
      visible: shape.visible !== false,
      locked: shape.locked === true,
      bounds: shape.bounds || boundsForPoints(shape.points || []),
      geometryVersion: shape.geometryVersion || 2,
      include: shape.include || null,
      exclude: shape.exclude || [],
      protect: shape.protect || [],
      edgeMode: shape.edgeMode || "soft",
      safetyMarginPx: Number(shape.safetyMarginPx || 0),
      featherPx: Number(shape.featherPx || 0),
      precisionScore: Number(shape.precisionScore || 0),
      warnings: shape.warnings || [],
      presetId: shape.presetId || ""
    }))
  }));
}

function boundsForPoints(points) {
  if (!Array.isArray(points) || !points.length) return null;
  const xs = points.map((pnt) => Number(pnt.x)).filter(Number.isFinite);
  const ys = points.map((pnt) => Number(pnt.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

function overlaySvg(state) {
  const width = Number(state.imageInfo?.width || state.canvasWidth || 1024);
  const height = Number(state.imageInfo?.height || state.canvasHeight || 1024);
  const layerStyle = {
    correct: { stroke: "#ef4444", fill: "rgba(239,68,68,0.18)" },
    freeze: { stroke: "#2563eb", fill: "rgba(37,99,235,0.14)" },
    error: { stroke: "#f59e0b", fill: "rgba(245,158,11,0.18)" },
    reference: { stroke: "#22c55e", fill: "rgba(34,197,94,0.14)" }
  };
  const shapes = [];
  for (const [layer, items] of Object.entries(state.layers || {})) {
    const settings = state.layerSettings?.[layer] || { visible: true, opacity: 1 };
    if (settings.visible === false) continue;
    const style = layerStyle[layer] || layerStyle.correct;
    for (const item of items || []) {
      if (item.visible === false) continue;
      const opacity = clamp(Number(settings.opacity ?? 1), 0.05, 1);
      const include = item.include || normalizeSubZone({ kind: item.kind, points: item.points, bounds: item.bounds, closed: item.closed }, "include", item);
      shapes.push(svgForSubZone(include, layer, item, style, opacity, "include"));
      for (const sub of item.exclude || []) {
        shapes.push(svgForSubZone(sub, layer, item, { stroke: "#f97316", fill: "rgba(249,115,22,0.12)" }, opacity, "exclude"));
      }
      for (const sub of item.protect || []) {
        shapes.push(svgForSubZone(sub, layer, item, { stroke: "#38bdf8", fill: "rgba(56,189,248,0.12)" }, opacity, "protect"));
      }
    }
  }
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="none"/>`,
    ...shapes,
    `</svg>`
  ].join("\n");
}

function svgForSubZone(subZone, layer, item, style, opacity, subtype) {
  if (!subZone) return "";
  const points = normalizePoints(subZone.points || []);
  const bounds = normalizeBoundsObject(subZone.bounds || boundsForPoints(points));
  if (!bounds) return "";
  const strokeWidth = Math.max(2, Number(item.size || 8));
  const dash = subtype === "exclude" ? ` stroke-dasharray="8 5"` : subtype === "protect" ? ` stroke-dasharray="3 4"` : "";
  const common = `data-layer="${layer}" data-shape-id="${escapeAttr(item.id || "")}" data-subtype="${subtype}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${dash}`;
  if (subZone.kind === "rectangle" || !points.length) {
    return `<rect x="${num(bounds.x)}" y="${num(bounds.y)}" width="${num(bounds.width)}" height="${num(bounds.height)}" ${common}/>`;
  }
  if (subZone.kind === "ellipse") {
    return `<ellipse cx="${num(bounds.x + bounds.width / 2)}" cy="${num(bounds.y + bounds.height / 2)}" rx="${num(Math.abs(bounds.width / 2))}" ry="${num(Math.abs(bounds.height / 2))}" ${common}/>`;
  }
  const d = points.map((pnt, index) => `${index === 0 ? "M" : "L"} ${num(pnt.x)} ${num(pnt.y)}`).join(" ");
  const close = subZone.closed || subZone.kind === "polygon" || subZone.kind === "lasso" ? " Z" : "";
  return `<path d="${d}${close}" ${common} stroke-linecap="round" stroke-linejoin="round"/>`;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(3)) : 0;
}

function escapeAttr(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
}

function buildPrompt(state, contextId, expectedResultPath, overlayPath, contextPath, preparedRequest = null) {
  const baseImagePath = state.baseImagePath || "(image must be attached or selected before Image Gen)";
  const frozen = (state.layers.freeze || []).map((item, index) => `- freeze ${index + 1}: ${item.note || "preserve this marked region exactly"} ${JSON.stringify(item.bounds || boundsForPoints(item.points || []))}`).join("\n") || "- none";
  const corrections = (state.layers.correct || []).map((item, index) => `- correct ${index + 1}: ${item.note || "apply the requested change only in this marked region"} ${JSON.stringify(item.bounds || boundsForPoints(item.points || []))}`).join("\n") || "- none";
  const errors = (state.layers.error || []).map((item, index) => `- error ${index + 1}: ${item.note || "fix this generation error"} ${JSON.stringify(item.bounds || boundsForPoints(item.points || []))}`).join("\n") || "- none";
  const refs = (state.layers.reference || []).map((item, index) => `- marked reference region ${index + 1}: ${item.note || "use this region as style/content reference"} ${JSON.stringify(item.bounds || boundsForPoints(item.points || []))}`).join("\n") || "- none";
  const referenceImages = referencePromptLines(state.references || []);
  const annotations = (state.annotations || []).map((item, index) => `- note ${index + 1} [${item.layer || "general"}]: ${item.text || item.note || ""}`).join("\n") || "- none";
  const precisionZones = precisionPromptLines(state);
  const prepared = preparedRequest || latestPreparedRequest(state);
  const preparedSection = prepared ? preparedPromptSection(prepared) : "Request Builder package: not used for this export.";
  const imageInstructions = prepared ? viewImageInstructions(prepared.images, baseImagePath) : defaultViewImageInstructions(baseImagePath, state.references || []);
  const modeLine = prepared?.draft?.intent === "generate"
    ? "Mode: generate a new image using the labelled references only."
    : "Mode: edit an existing image when the target image is visible in this conversation.";
  return `Use $imagegen with the built-in Codex Image Gen tool only.

${modeLine}
Do not use an external image API, a key-based fallback, a CLI image generator, or a simulated result.

Target image path: ${baseImagePath}
Overlay SVG: ${overlayPath}
Context JSON: ${contextPath}
Context id: ${contextId}

Prepared conversation request:
${preparedSection}

User request:
${state.userRequest || "Apply the marked corrections while preserving frozen regions."}

Regions to correct:
${corrections}

Regions to freeze and preserve:
${frozen}

Marked generation errors:
${errors}

Reference regions:
${refs}

Reference images:
${referenceImages}

Annotations:
${annotations}

Precision geometry:
${precisionZones}

Execution requirements:
1. Make required local images visible before the Image Gen call:
${imageInstructions}
2. Label every image by role before invoking Image Gen. Only an image labelled edit_target may be edited.
3. Use the built-in image_gen tool for the edit.
4. Preserve every frozen region aggressively.
5. Change only the requested marked correction/error areas unless the user request explicitly requires a broader change.
6. After Image Gen returns, copy the selected Codex Image Gen artifact into this workspace path:
${expectedResultPath}
7. Call save_generated_result with origin "codex-image-gen", contextId "${contextId}", and artifactPath "${expectedResultPath}".
`;
}

function referencePromptLines(references) {
  const active = references.filter((ref) => ref && ref.removed !== true);
  if (!active.length) return "- none";
  return active.map((ref, index) => {
    const weight = referenceWeights.includes(ref.weight) ? ref.weight : "medium";
    return `- reference image ${index + 1}: path=${ref.path}; weight=${weight}; sha256=${ref.sha256 || ""}; note=${ref.note || "use as reference only"}`;
  }).join("\n");
}

function precisionSummary(state) {
  return ["correct", "freeze", "error", "reference"].flatMap((layer) => (state.layers[layer] || []).map((shape, index) => ({
    layer,
    index,
    id: shape.id || "",
    label: shape.label || "",
    note: shape.note || "",
    geometryVersion: shape.geometryVersion || 2,
    include: shape.include || null,
    exclude: shape.exclude || [],
    protect: shape.protect || [],
    edgeMode: shape.edgeMode || "soft",
    safetyMarginPx: Number(shape.safetyMarginPx || 0),
    featherPx: Number(shape.featherPx || 0),
    precisionScore: Number(shape.precisionScore || 0),
    warnings: shape.warnings || [],
    presetId: shape.presetId || ""
  })));
}

function precisionPromptLines(state) {
  const zones = precisionSummary(state);
  if (!zones.length) return "- none";
  return zones.map((zone, index) => [
    `- zone ${index + 1}: id=${zone.id}; layer=${zone.layer}; score=${zone.precisionScore}; edge=${zone.edgeMode}; safetyMarginPx=${zone.safetyMarginPx}; featherPx=${zone.featherPx}; preset=${zone.presetId || "none"}`,
    `  include: ${JSON.stringify(zone.include?.bounds || null)}`,
    `  exclude: ${zone.exclude.length ? zone.exclude.map((item) => JSON.stringify(item.bounds)).join("; ") : "none"}`,
    `  protect: ${zone.protect.length ? zone.protect.map((item) => JSON.stringify(item.bounds)).join("; ") : "none"}`,
    `  warnings: ${zone.warnings?.length ? zone.warnings.join("; ") : "none"}`
  ].join("\n")).join("\n");
}

function preparedPromptSection(prepared) {
  const draft = prepared.draft || {};
  const constraints = draft.constraints || {};
  const translation = prepared.translation || null;
  const validation = prepared.validation || null;
  return [
    `Input package id: ${prepared.inputPackage?.inputPackageId || ""}`,
    `Normalized draft id: ${draft.draftId || ""}`,
    `Intent: ${draft.intent || "generate"}`,
    `Use case: ${draft.useCase || ""}`,
    `Asset type: ${draft.assetType || ""}`,
    "",
    "Original prompt:",
    draft.originalPrompt || prepared.inputPackage?.userText || "",
    "",
    "Normalized prompt:",
    draft.normalizedPrompt || "",
    "",
    "Working translation:",
    translation?.workingTranslation || "- none",
    "",
    "Image roles:",
    imageRolePromptLines(prepared.images || []),
    "",
    "Constraints:",
    constraintsToPrompt(constraints),
    "",
    "Validation:",
    validation ? `blocking=${validation.blockingErrors?.length || 0}; warnings=${validation.warnings?.length || 0}` : "- not validated"
  ].join("\n");
}

function imageRolePromptLines(images) {
  if (!images.length) return "- none";
  return images.map((image, index) => {
    const visible = image.visibleInConversation === true ? "visible" : "not visible";
    const location = image.path ? `path=${image.path}` : `artifactId=${image.artifactId || ""}`;
    return `- image ${index + 1}: role=${image.role || "unassigned"}; sourceType=${image.sourceType || ""}; ${location}; sha256=${image.sha256 || ""}; status=${visible}; note=${image.userNote || image.caption || ""}`;
  }).join("\n");
}

function constraintsToPrompt(constraints = {}) {
  return constraintKeys.map((key) => {
    const values = Array.isArray(constraints[key]) ? constraints[key].filter(Boolean) : [];
    return `- ${key}: ${values.length ? values.join("; ") : "none"}`;
  }).join("\n");
}

function viewImageInstructions(images = [], fallbackTarget = "") {
  const local = images.filter((image) => image.path && image.visibleInConversation !== true);
  if (!local.length && fallbackTarget && fallbackTarget !== "(image must be attached or selected before Image Gen)") {
    return `  - view_image: ${fallbackTarget}`;
  }
  if (!local.length) return "  - none; all required images are already visible in the conversation or no local image is available.";
  return local.map((image, index) => `  - view_image image ${index + 1}: ${image.path} (role=${image.role || "unassigned"})`).join("\n");
}

function defaultViewImageInstructions(baseImagePath, references = []) {
  const lines = [];
  if (baseImagePath && baseImagePath !== "(image must be attached or selected before Image Gen)") lines.push(`  - view_image target: ${baseImagePath}`);
  for (const ref of references.filter((item) => item && item.removed !== true && item.path)) {
    lines.push(`  - view_image reference: ${ref.path}`);
  }
  return lines.length ? lines.join("\n") : "  - none; no local image path is currently available.";
}

function normalizeRole(role) {
  return imageRoles.includes(role) ? role : "";
}

function boolValue(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function latest(list, predicate = () => true) {
  if (!Array.isArray(list)) return null;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (predicate(list[index])) return list[index];
  }
  return null;
}

function findInputPackage(state, inputPackageId = "") {
  if (inputPackageId) {
    const found = (state.conversationInputs || []).find((item) => item.inputPackageId === inputPackageId);
    if (!found) throw new Error(`Unknown input package: ${inputPackageId}`);
    return found;
  }
  const found = latest(state.conversationInputs || []);
  if (!found) throw new Error("No conversation input package has been ingested.");
  return found;
}

function findPromptDraft(state, draftId = "", inputPackageId = "") {
  if (draftId) {
    const found = (state.promptDrafts || []).find((item) => item.draftId === draftId);
    if (!found) throw new Error(`Unknown prompt draft: ${draftId}`);
    return found;
  }
  const found = latest(state.promptDrafts || [], (item) => !inputPackageId || item.inputPackageId === inputPackageId);
  if (!found) throw new Error("No normalized prompt draft is available.");
  return found;
}

function latestPreparedRequest(state, selectors = {}) {
  let inputPackage = null;
  let draft = null;
  try {
    inputPackage = findInputPackage(state, selectors.inputPackageId || state.activeInputPackageId || "");
  } catch {
    inputPackage = latest(state.conversationInputs || []);
  }
  try {
    draft = findPromptDraft(state, selectors.draftId || state.activePromptDraftId || "", inputPackage?.inputPackageId || "");
  } catch {
    draft = latest(state.promptDrafts || []);
  }
  if (!inputPackage && !draft) return null;
  if (!inputPackage && draft) inputPackage = latest(state.conversationInputs || [], (item) => item.inputPackageId === draft.inputPackageId);
  if (!draft && inputPackage) draft = latest(state.promptDrafts || [], (item) => item.inputPackageId === inputPackage.inputPackageId);
  const translation = draft ? latest(state.translations || [], (item) => item.draftId === draft.draftId) : null;
  const validation = draft ? latest(state.requestValidationReports || [], (item) => item.draftId === draft.draftId) : null;
  return {
    inputPackage,
    draft,
    translation,
    validation,
    images: inputPackage?.images || []
  };
}

function normalizeConversationImage(root, id, image = {}, index = 0, total = 0, intent = "") {
  let saved = null;
  let imagePath = "";
  if (image.imageDataUrl) {
    saved = saveDataUrlImage(root, id, image.imageDataUrl, image.fileName || image.name || `conversation-image-${index + 1}`);
    imagePath = saved.path;
  } else if (image.path || image.artifactPath) {
    const checked = assertImagePath(root, image.path || image.artifactPath, "image.path");
    imagePath = checked.path;
    saved = { path: checked.path, info: checked.info, sha256: sha256File(checked.path) };
  }
  const artifactId = String(image.artifactId || "");
  const role = normalizeRole(image.role) || proposeImageRole(image, index, total, intent);
  const sourceType = String(image.sourceType || (image.imageDataUrl ? "inline_import" : imagePath ? "local_file" : artifactId ? "codex_artifact" : "conversation_image"));
  const sha = saved?.sha256 || image.sha256 || sha256Json({
    artifactId,
    caption: image.caption || "",
    userNote: image.userNote || image.note || "",
    role,
    sourceType
  });
  return {
    imageId: safeId(image.imageId || image.id || uniqueId("img"), `img-${index + 1}`),
    sourceType,
    role,
    path: imagePath,
    artifactId,
    sha256: sha,
    caption: String(image.caption || ""),
    userNote: String(image.userNote || image.note || ""),
    visibleInConversation: boolValue(image.visibleInConversation, !imagePath),
    imageInfo: saved?.info || image.imageInfo || null,
    weight: referenceWeights.includes(image.weight) ? image.weight : "medium",
    createdAt: now()
  };
}

function proposeImageRole(image = {}, index = 0, total = 0, intent = "") {
  const text = `${image.sourceType || ""} ${image.caption || ""} ${image.userNote || image.note || ""} ${image.fileName || image.name || ""}`.toLowerCase();
  if (text.includes("rejected")) return "rejected_result";
  if (text.includes("previous") || text.includes("result")) return "previous_result";
  if (text.includes("style")) return "style_reference";
  if (text.includes("insert") || text.includes("source")) return "insert_source";
  if (text.includes("target") || text.includes("cible") || text.includes("edit")) return "edit_target";
  if (intent === "edit" && index === 0) return "edit_target";
  if (total === 1 && intent === "edit") return "edit_target";
  return "reference";
}

function artifactImages(artifacts = []) {
  return artifacts.map((artifact) => ({
    ...artifact,
    sourceType: artifact.sourceType || "codex_artifact",
    path: artifact.path || artifact.artifactPath || "",
    artifactId: artifact.artifactId || artifact.id || ""
  }));
}

function detectLanguage(text = "") {
  const lower = text.toLowerCase();
  if (/[àâçéèêëîïôùûüÿœ]/i.test(text)) return "fr";
  if (/\b(le|la|les|des|une|un|avec|sans|conserver|modifier|corriger|image|texte|visage)\b/.test(lower)) return "fr";
  return "en";
}

function detectIntent(text = "", images = []) {
  const lower = text.toLowerCase();
  const editWords = /\b(modifie|modifier|corrige|corriger|retouche|remplace|remplacer|supprime|supprimer|enleve|enlever|change|changer|edite|edit|fix|remove|replace|inpaint|preserve|keep|conserve|conserver)\b/;
  const generateWords = /\b(genere|generer|crée|cree|creer|create|generate|draw|dessine|nouvelle image|new image)\b/;
  const hasTarget = images.some((image) => normalizeRole(image.role) === "edit_target" || /target|cible|edit/.test(`${image.sourceType || ""} ${image.caption || ""}`.toLowerCase()));
  if (editWords.test(lower) && (hasTarget || images.length > 0 || !generateWords.test(lower))) return "edit";
  if (generateWords.test(lower)) return "generate";
  return hasTarget ? "edit" : "generate";
}

function classifyUseCase(text = "", intent = "generate") {
  const lower = text.toLowerCase();
  if (intent === "edit") {
    if (/\b(text|texte|tradu|localis|caption|word|mot|lettre)\b/.test(lower)) return "text-localization";
    if (/\b(face|visage|identity|identite|personne|portrait|body|pose)\b/.test(lower)) return "identity-preserve";
    if (/\b(transparent|cutout|detour|détour|background removal|fond transparent)\b/.test(lower)) return "background-extraction";
    if (/\b(light|lighting|lumiere|nuit|jour|weather|meteo|pluie|neige|season|saison)\b/.test(lower)) return "lighting-weather";
    if (/\b(style|reference style|meme style|same style)\b/.test(lower)) return "style-transfer";
    if (/\b(composite|fusion|insert|insere|merge|ajoute.*image)\b/.test(lower)) return "compositing";
    if (/\b(sketch|croquis|line art|dessin)\b/.test(lower)) return "sketch-to-render";
    return "precise-object-edit";
  }
  if (/\b(product|produit|packaging|mug|catalog|mockup)\b/.test(lower)) return "product-mockup";
  if (/\b(ui|interface|wireframe|app|dashboard|screen)\b/.test(lower)) return "ui-mockup";
  if (/\b(infographic|diagram|schema|schéma|graph|workflow)\b/.test(lower)) return "infographic-diagram";
  if (/\b(science|scientific|educational|learn|classe|cours)\b/.test(lower)) return "scientific-educational";
  if (/\b(ad|ads|marketing|campagne|pub|publicite|tagline)\b/.test(lower)) return "ads-marketing";
  if (/\b(slide|presentation|report|productivity|business)\b/.test(lower)) return "productivity-visual";
  if (/\b(logo|brand|marque|icon)\b/.test(lower)) return "logo-brand";
  if (/\b(comic|story|illustration|children|narrative)\b/.test(lower)) return "illustration-story";
  if (/\b(historical|history|historique|medieval|antique)\b/.test(lower)) return "historical-scene";
  if (/\b(photo|photoreal|realistic|portrait|camera)\b/.test(lower)) return "photorealistic-natural";
  return "stylized-concept";
}

function deriveAssetType(text = "", useCase = "") {
  const lower = text.toLowerCase();
  if (/\b(hero|landing|site|website)\b/.test(lower)) return "landing page hero";
  if (/\b(sprite|game|jeu)\b/.test(lower)) return "game asset";
  if (/\b(icon|logo)\b/.test(lower)) return "brand mark";
  if (/\b(ad|pub|campaign|campagne)\b/.test(lower)) return "campaign image";
  if (/\b(ui|interface|dashboard)\b/.test(lower)) return "interface mockup";
  if (editUseCases.includes(useCase)) return "edited image";
  if (generateUseCases.includes(useCase)) return "generated image";
  return "image asset";
}

function splitSentences(text = "") {
  return String(text || "")
    .split(/[\n.;!?]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function quotedText(text = "") {
  const found = [];
  const patterns = [/"([^"]+)"/g, /'([^']+)'/g, /«([^»]+)»/g, /“([^”]+)”/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) found.push(match[1].trim());
  }
  return uniqueStrings(found);
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values.map((item) => String(item || "").trim()).filter(Boolean)) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

function emptyConstraints() {
  return Object.fromEntries(constraintKeys.map((key) => [key, []]));
}

function extractConstraints(text, state, inputPackage) {
  const constraints = emptyConstraints();
  constraints.text_verbatim.push(...quotedText(text));
  for (const sentence of splitSentences(text)) {
    const lower = sentence.toLowerCase();
    if (/\b(conserver|preserve|keep|garder|figer|unchanged|identique|ne pas changer)\b/.test(lower)) constraints.must_keep.push(sentence);
    if (/\b(modifier|corriger|changer|remplacer|supprimer|enlever|ajouter|change|replace|remove|fix|add)\b/.test(lower)) constraints.must_change.push(sentence);
    if (/\b(eviter|éviter|avoid|sans|no |without|ne pas)\b/.test(lower)) constraints.must_avoid.push(sentence);
    if (/\b(style|look|palette|couleur|medium|photo|illustration|3d)\b/.test(lower)) constraints.style_constraints.push(sentence);
    if (/\b(composition|cadrage|framing|angle|perspective|background|fond|placement)\b/.test(lower)) constraints.composition_constraints.push(sentence);
    if (/\b(visage|face|identity|identite|personne|portrait|pose)\b/.test(lower)) constraints.identity_constraints.push(sentence);
    if (/\b(hero|site|website|app|print|poster|pub|ad|sprite|logo)\b/.test(lower)) constraints.output_use.push(sentence);
  }
  for (const item of state.layers?.freeze || []) constraints.must_keep.push(item.note || item.label || "Preserve marked frozen region.");
  for (const item of [...(state.layers?.correct || []), ...(state.layers?.error || [])]) constraints.must_change.push(item.note || item.label || "Apply the marked correction.");
  for (const image of inputPackage?.images || []) {
    if (image.role === "style_reference") constraints.style_constraints.push(image.userNote || image.caption || "Use the labelled style reference.");
    if (image.role === "edit_target") constraints.review_checks.push(`Review edit target sha256=${image.sha256 || ""}`);
  }
  constraints.review_checks.push("Verify frozen regions and explicit invariants before accepting the result.");
  return normalizeConstraints(constraints);
}

function normalizeConstraints(constraints = {}) {
  const out = emptyConstraints();
  for (const key of constraintKeys) out[key] = uniqueStrings(Array.isArray(constraints[key]) ? constraints[key] : splitConstraintText(constraints[key]));
  return out;
}

function splitConstraintText(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(/\n|;/).map((item) => item.trim()).filter(Boolean);
}

function mergeConstraints(base, override = {}) {
  const merged = emptyConstraints();
  const normalizedOverride = normalizeConstraints(override);
  for (const key of constraintKeys) merged[key] = uniqueStrings([...(base[key] || []), ...(normalizedOverride[key] || [])]);
  return merged;
}

function buildNormalizedPrompt({ originalPrompt, intent, useCase, assetType, inputPackage, constraints }) {
  const imageLines = imageRolePromptLines(inputPackage?.images || []);
  return [
    `Use case: ${useCase}`,
    `Asset type: ${assetType}`,
    `Primary request: ${originalPrompt || "(no text supplied)"}`,
    `Input images:`,
    imageLines,
    `Text (verbatim): ${constraints.text_verbatim.length ? constraints.text_verbatim.map((item) => `"${item}"`).join("; ") : "none"}`,
    `Constraints: ${[...constraints.must_keep, ...constraints.must_change].join("; ") || "none"}`,
    `Avoid: ${constraints.must_avoid.join("; ") || "none"}`,
    `Intent: ${intent}`
  ].join("\n");
}

function draftAmbiguities(draft, inputPackage) {
  const ambiguities = [];
  if (!draft.originalPrompt && !(inputPackage?.images || []).length) ambiguities.push("No prompt text or image input was provided.");
  if (draft.intent === "edit" && !(inputPackage?.images || []).some((image) => image.role === "edit_target")) {
    ambiguities.push("Edit request has no clear edit_target image.");
  }
  if ((inputPackage?.images || []).some((image) => !normalizeRole(image.role))) ambiguities.push("At least one image has no valid role.");
  if (draft.originalPrompt && draft.originalPrompt.length < 12) ambiguities.push("Prompt is very short; review the normalized request before generation.");
  return ambiguities;
}

function classifyImages(state, inputPackage, overrides = [], intent = "") {
  const overrideMap = new Map((overrides || []).map((item) => [String(item.imageId || item.id || ""), item]));
  const resolvedIntent = intent || latest(state.promptDrafts || [], (draft) => draft.inputPackageId === inputPackage.inputPackageId)?.intent || detectIntent(inputPackage.userText || "", inputPackage.images || []);
  inputPackage.images = (inputPackage.images || []).map((image, index, all) => {
    const override = overrideMap.get(image.imageId) || {};
    const role = normalizeRole(override.role) || normalizeRole(image.role) || proposeImageRole(image, index, all.length, resolvedIntent);
    return {
      ...image,
      role,
      caption: override.caption ?? image.caption ?? "",
      userNote: override.userNote ?? override.note ?? image.userNote ?? "",
      visibleInConversation: boolValue(override.visibleInConversation, image.visibleInConversation === true)
    };
  });
  state.imageRoles = {
    ...(state.imageRoles || {}),
    ...Object.fromEntries((inputPackage.images || []).map((image) => [image.imageId, image.role]))
  };
  const target = (inputPackage.images || []).find((image) => image.role === "edit_target" && image.path);
  if (target && !state.baseImagePath) {
    state.baseImagePath = target.path;
    state.imageInfo = target.imageInfo || state.imageInfo;
    state.artifactHashes.baseImage = target.sha256 || state.artifactHashes.baseImage || "";
  }
  return inputPackage;
}

function conversationInputsForClient(inputs) {
  return (inputs || []).map((input) => ({
    ...input,
    images: (input.images || []).map(withPreviewConversationImage)
  }));
}

function withPreviewConversationImage(image) {
  const item = { ...image };
  if (item.path) {
    try {
      const preview = dataUrlForFile(item.path);
      item.previewDataUrl = preview.dataUrl;
      if (preview.previewUnavailableReason) item.previewUnavailableReason = preview.previewUnavailableReason;
    } catch (error) {
      item.previewDataUrl = "";
      item.previewUnavailableReason = error?.message || String(error);
    }
  }
  return item;
}

function inputForClient(inputPackage) {
  return { ...inputPackage, images: (inputPackage.images || []).map(withPreviewConversationImage) };
}

function withPreviewArtifactCandidate(candidate) {
  const item = { ...candidate };
  if (item.artifactPath) {
    try {
      const preview = dataUrlForFile(item.artifactPath);
      item.previewDataUrl = preview.dataUrl;
      if (preview.previewUnavailableReason) item.previewUnavailableReason = preview.previewUnavailableReason;
    } catch (error) {
      item.previewDataUrl = "";
      item.previewUnavailableReason = error?.message || String(error);
    }
  }
  return item;
}

function artifactCandidatesForClient(candidates) {
  return (candidates || []).map(withPreviewArtifactCandidate);
}

function normalizedStateForClient(root, id) {
  const state = withPreview(loadState(root, id));
  state.references = referencesForClient(state.references || []);
  state.versions = versionsForClient(state.versions || []);
  state.conversationInputs = conversationInputsForClient(state.conversationInputs || []);
  state.artifactCandidates = artifactCandidatesForClient(state.artifactCandidates || []);
  return state;
}

function ingestConversationInputs(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  if (args.editorState) saveStateFromArgs(root, id, args);
  const state = loadState(root, id);
  const userText = String(args.userText || state.userRequest || "").trim();
  const providedImages = [...(Array.isArray(args.images) ? args.images : []), ...artifactImages(Array.isArray(args.artifacts) ? args.artifacts : [])];
  if (!providedImages.length && state.baseImagePath) {
    providedImages.push({ path: state.baseImagePath, role: detectIntent(userText, []) === "edit" ? "edit_target" : "reference", sourceType: "editor_target", caption: "Current editor target", visibleInConversation: false });
  }
  if (!providedImages.length) {
    for (const ref of (state.references || []).filter((item) => item && item.removed !== true && item.path)) {
      providedImages.push({ path: ref.path, role: "reference", sourceType: "editor_reference", caption: ref.note || "Editor reference", userNote: ref.note || "", visibleInConversation: false, weight: ref.weight || "medium" });
    }
  }
  const intent = detectIntent(userText, providedImages);
  const images = providedImages.map((image, index) => normalizeConversationImage(root, id, image, index, providedImages.length, intent));
  const inputPackage = {
    schemaVersion: 1,
    inputPackageId: uniqueId("input"),
    sessionId: id,
    createdAt: now(),
    userText,
    originalPrompt: userText,
    notes: args.notes || "",
    context: args.context || {},
    images,
    artifacts: Array.isArray(args.artifacts) ? args.artifacts.map((item) => ({ artifactId: item.artifactId || item.id || "", path: item.path || item.artifactPath || "" })) : []
  };
  inputPackage.sha256 = sha256Json({ ...inputPackage, sha256: "" });
  classifyImages(state, inputPackage, [], intent);
  state.conversationInputs = [...(state.conversationInputs || []), inputPackage].slice(-100);
  state.activeInputPackageId = inputPackage.inputPackageId;
  if (userText) state.userRequest = userText;
  state.artifactHashes = {
    ...(state.artifactHashes || {}),
    [inputPackage.inputPackageId]: inputPackage.sha256,
    ...Object.fromEntries(images.map((image) => [image.imageId, image.sha256]))
  };
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "request_ingested", { message: "Conversation inputs ingested.", data: { inputPackageId: inputPackage.inputPackageId, imageCount: images.length, sha256: inputPackage.sha256 } });
  return result({ inputPackage: inputForClient(inputPackage), state: normalizedStateForClient(root, id), event }, "Conversation inputs ingested.");
}

function classifyImageRolesTool(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = loadState(root, id);
  const inputPackage = findInputPackage(state, args.inputPackageId || "");
  classifyImages(state, inputPackage, Array.isArray(args.imageRoles) ? args.imageRoles : [], args.intent || "");
  inputPackage.roleSha256 = sha256Json((inputPackage.images || []).map((image) => ({ imageId: image.imageId, role: image.role, visibleInConversation: image.visibleInConversation, userNote: image.userNote })));
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "image_roles_classified", { message: "Image roles classified.", data: { inputPackageId: inputPackage.inputPackageId, roleSha256: inputPackage.roleSha256 } });
  return result({ inputPackage: inputForClient(inputPackage), roles: inputPackage.images.map((image) => ({ imageId: image.imageId, role: image.role })), state: normalizedStateForClient(root, id), event }, "Image roles classified.");
}

function normalizePromptRequest(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = loadState(root, id);
  const inputPackage = findInputPackage(state, args.inputPackageId || "");
  classifyImages(state, inputPackage, [], args.intent || "");
  const originalPrompt = String(args.userText || inputPackage.userText || state.userRequest || "").trim();
  const intent = detectIntent(originalPrompt, inputPackage.images || []);
  const useCase = classifyUseCase(originalPrompt, intent);
  const assetType = deriveAssetType(originalPrompt, useCase);
  const constraints = mergeConstraints(extractConstraints(originalPrompt, state, inputPackage), args.constraintsOverride || {});
  const draft = {
    draftId: uniqueId("draft"),
    inputPackageId: inputPackage.inputPackageId,
    createdAt: now(),
    originalPrompt,
    normalizedPrompt: "",
    detectedLanguage: detectLanguage(originalPrompt),
    intent,
    useCase,
    assetType,
    constraints,
    ambiguities: []
  };
  draft.normalizedPrompt = buildNormalizedPrompt({ originalPrompt, intent, useCase, assetType, inputPackage, constraints });
  draft.ambiguities = draftAmbiguities(draft, inputPackage);
  draft.sha256 = sha256Json({ ...draft, sha256: "" });
  const constraintSet = {
    constraintSetId: uniqueId("constraints"),
    draftId: draft.draftId,
    inputPackageId: inputPackage.inputPackageId,
    createdAt: now(),
    constraints,
    sha256: sha256Json(constraints)
  };
  state.promptDrafts = [...(state.promptDrafts || []), draft].slice(-100);
  state.constraintSets = [...(state.constraintSets || []), constraintSet].slice(-100);
  state.activeInputPackageId = inputPackage.inputPackageId;
  state.activePromptDraftId = draft.draftId;
  state.userRequest = originalPrompt || state.userRequest;
  state.artifactHashes = { ...(state.artifactHashes || {}), [draft.draftId]: draft.sha256, [constraintSet.constraintSetId]: constraintSet.sha256 };
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "request_normalized", { message: "Prompt request normalized.", data: { inputPackageId: inputPackage.inputPackageId, draftId: draft.draftId, intent, useCase } });
  return result({ draft, constraintSet, inputPackage: inputForClient(inputPackage), state: normalizedStateForClient(root, id), event }, "Prompt request normalized.");
}

function translatePromptRequest(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = loadState(root, id);
  const inputPackage = findInputPackage(state, args.inputPackageId || "");
  const draft = findPromptDraft(state, args.draftId || "", inputPackage.inputPackageId);
  const translation = {
    translationId: uniqueId("translation"),
    inputPackageId: inputPackage.inputPackageId,
    draftId: draft.draftId,
    createdAt: now(),
    sourceLanguage: draft.detectedLanguage || "unknown",
    targetLanguage: args.targetLanguage || "en",
    workingTranslation: String(args.workingTranslation || ""),
    textVerbatim: draft.constraints?.text_verbatim || [],
    translatorNote: args.translatorNote || "",
    providedBy: "codex-conversation",
    translationApiUsed: false
  };
  translation.needsTranslation = translation.sourceLanguage !== translation.targetLanguage && !translation.workingTranslation;
  translation.verbatimPreserved = true;
  translation.sha256 = sha256Json({ ...translation, sha256: "" });
  state.translations = [...(state.translations || []), translation].slice(-100);
  state.artifactHashes = { ...(state.artifactHashes || {}), [translation.translationId]: translation.sha256 };
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "request_translated", { message: "Codex-provided working translation stored.", data: { draftId: draft.draftId, translationId: translation.translationId, needsTranslation: translation.needsTranslation } });
  return result({ translation, state: normalizedStateForClient(root, id), event }, "Working translation stored.");
}

function validateImagegenRequest(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = loadState(root, id);
  const inputPackage = findInputPackage(state, args.inputPackageId || "");
  const draft = findPromptDraft(state, args.draftId || "", inputPackage.inputPackageId);
  const report = buildValidationReport(state, inputPackage, draft);
  state.requestValidationReports = [...(state.requestValidationReports || []), report].slice(-100);
  state.artifactHashes = { ...(state.artifactHashes || {}), [report.reportId]: report.sha256 };
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "request_validated", { message: report.executable ? "Image Gen request validated." : "Image Gen request has blocking issues.", data: { reportId: report.reportId, blockingErrors: report.blockingErrors.length, warnings: report.warnings.length } });
  return result({ report, executable: report.executable, state: normalizedStateForClient(root, id), event }, report.executable ? "Image Gen request validated." : "Image Gen request blocked by validation.");
}

function buildValidationReport(state, inputPackage, draft) {
  const blockingErrors = [];
  const warnings = [];
  const images = inputPackage.images || [];
  const invalidRoles = images.filter((image) => !normalizeRole(image.role));
  if (invalidRoles.length) blockingErrors.push(`Images without a valid role: ${invalidRoles.map((image) => image.imageId).join(", ")}`);
  const targets = images.filter((image) => image.role === "edit_target");
  if (draft.intent === "edit" && !targets.length && !state.baseImagePath) blockingErrors.push("Edit intent requires exactly one clear edit_target image or current editor target.");
  if (draft.intent === "edit" && targets.length > 1) blockingErrors.push("Edit intent has multiple edit_target images; choose one target.");
  for (const target of targets) {
    if (!target.path && !target.artifactId && target.visibleInConversation !== true) blockingErrors.push(`Edit target ${target.imageId} has no path, artifactId, or visible conversation image.`);
  }
  if (!draft.originalPrompt && !images.length) blockingErrors.push("Request has neither prompt text nor input images.");
  const keep = new Set((draft.constraints?.must_keep || []).map((item) => item.toLowerCase()));
  const change = new Set((draft.constraints?.must_change || []).map((item) => item.toLowerCase()));
  const avoid = new Set((draft.constraints?.must_avoid || []).map((item) => item.toLowerCase()));
  const conflicts = [...keep].filter((item) => change.has(item) || avoid.has(item));
  if (conflicts.length) blockingErrors.push(`Conflicting constraints: ${conflicts.join("; ")}`);
  for (const image of images.filter((item) => item.path && item.visibleInConversation !== true)) {
    warnings.push(`Local image ${image.imageId} is not marked visible in the conversation; final request must use view_image before image_gen.`);
  }
  if (draft.useCase === "text-localization" && !(draft.constraints?.text_verbatim || []).length) {
    warnings.push("Text-related request has no quoted verbatim text to preserve or render.");
  }
  for (const ambiguity of draft.ambiguities || []) warnings.push(ambiguity);
  const report = {
    reportId: uniqueId("validation"),
    inputPackageId: inputPackage.inputPackageId,
    draftId: draft.draftId,
    createdAt: now(),
    executable: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    checkedBoundary: {
      executor: "codex-built-in-image-gen",
      mcpGeneratesImages: false,
      externalNetworkRequired: false,
      directImageApiAllowed: false
    }
  };
  report.sha256 = sha256Json({ ...report, sha256: "" });
  return report;
}

function createImagegenRequestFromInputs(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  if (args.editorState) saveStateFromArgs(root, id, args);
  let state = loadState(root, id);
  const inputPackage = findInputPackage(state, args.inputPackageId || "");
  let draft;
  try {
    draft = findPromptDraft(state, args.draftId || "", inputPackage.inputPackageId);
  } catch {
    normalizePromptRequest({ workspaceRoot: root, sessionId: id, inputPackageId: inputPackage.inputPackageId });
    state = loadState(root, id);
    draft = findPromptDraft(state, "", inputPackage.inputPackageId);
  }
  const report = buildValidationReport(state, inputPackage, draft);
  if (!report.executable) {
    state.requestValidationReports = [...(state.requestValidationReports || []), report].slice(-100);
    state.updatedAt = now();
    writeJsonAtomic(statePath(root, id), state);
    throw new Error(`Image Gen request blocked: ${report.blockingErrors.join(" ")}`);
  }
  state.requestValidationReports = [...(state.requestValidationReports || []), report].slice(-100);
  state.activeInputPackageId = inputPackage.inputPackageId;
  state.activePromptDraftId = draft.draftId;
  state.userRequest = draft.originalPrompt || state.userRequest;
  const target = (inputPackage.images || []).find((image) => image.role === "edit_target" && image.path);
  if (target) {
    state.baseImagePath = target.path;
    state.imageInfo = target.imageInfo || state.imageInfo;
    state.artifactHashes.baseImage = target.sha256 || state.artifactHashes.baseImage || "";
  }
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  return createGenerationRequest({
    workspaceRoot: root,
    sessionId: id,
    baseImagePath: state.baseImagePath,
    userRequest: state.userRequest,
    editorState: state,
    expectedResultPath: args.expectedResultPath,
    source: "create_imagegen_request_from_inputs"
  }, {
    source: "create_imagegen_request_from_inputs",
    inputPackageId: inputPackage.inputPackageId,
    promptDraftId: draft.draftId,
    normalizedRequest: true
  });
}

function imageBounds(info, state = {}) {
  const width = Number(info?.width || state.imageInfo?.width || state.canvasWidth || 0);
  const height = Number(info?.height || state.imageInfo?.height || state.canvasHeight || 0);
  return width > 0 && height > 0 ? { x: 0, y: 0, width, height } : null;
}

function validateZoneObject(zone, info = null, protectedBounds = [], state = {}) {
  const blockingErrors = [];
  const warnings = [];
  const include = normalizeBoundsObject(zone?.include?.bounds || zone?.bounds || boundsForPoints(zone?.points || []));
  const image = imageBounds(info, state);
  if (!include || boundsArea(include) <= 0) blockingErrors.push("Zone include geometry is empty or invalid.");
  if (include && image) {
    const clipped = intersectBounds(include, image);
    if (!clipped) blockingErrors.push("Zone is completely outside the image.");
    else if (boundsArea(clipped) < boundsArea(include)) warnings.push("Zone extends outside the image bounds.");
    const coverage = boundsArea(include) / Math.max(1, boundsArea(image));
    if (coverage > 0.45) warnings.push("Zone covers more than 45% of the image; refine before generation.");
    if (coverage < 0.0005) warnings.push("Zone is very small; verify it is intentional.");
  }
  for (const sub of [...(zone.exclude || []), ...(zone.protect || [])]) {
    const subBounds = normalizeBoundsObject(sub.bounds);
    if (!subBounds || boundsArea(subBounds) <= 0) warnings.push(`${sub.subtype || "sub-zone"} geometry is empty and will be ignored.`);
    else if (include && !intersectBounds(include, subBounds)) warnings.push(`${sub.subtype || "sub-zone"} does not overlap the include zone.`);
  }
  if (["correct", "error"].includes(zone.layer) && include) {
    for (const protectedBox of protectedBounds) {
      if (intersectBounds(include, protectedBox)) {
        blockingErrors.push("Correction/include zone overlaps a frozen or protected region.");
        break;
      }
    }
  }
  const base = 100;
  const score = clamp(base - warnings.length * 12 - blockingErrors.length * 35 - (zone.exclude?.length ? 0 : 5) - (zone.protect?.length ? 0 : 5), 0, 100);
  return {
    blockingErrors: uniqueStrings(blockingErrors),
    warnings: uniqueStrings(warnings),
    precisionScore: Math.round(score)
  };
}

function protectedBoundsForState(state, excludeShapeId = "") {
  const boxes = [];
  for (const shape of state.layers.freeze || []) {
    if (shape.id !== excludeShapeId) boxes.push(normalizeBoundsObject(shape.include?.bounds || shape.bounds));
  }
  for (const layer of ["correct", "error", "reference"]) {
    for (const shape of state.layers[layer] || []) {
      if (shape.id === excludeShapeId) continue;
      for (const sub of shape.protect || []) boxes.push(normalizeBoundsObject(sub.bounds));
    }
  }
  return boxes.filter(Boolean);
}

function updateZonePrecisionFields(shape, state) {
  const validation = validateZoneObject(shape, state.imageInfo, protectedBoundsForState(state, shape.id), state);
  shape.precisionScore = validation.precisionScore;
  shape.warnings = validation.warnings;
  return validation;
}

function validateZonePrecision(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = args.editorState ? saveStateFromArgs(root, id, args) : loadState(root, id);
  const targets = [];
  if (args.shapeId) {
    const found = findZoneById(state, args.shapeId);
    if (!found) throw new Error(`Unknown zone: ${args.shapeId}`);
    targets.push(found.shape);
  } else {
    for (const layer of ["correct", "freeze", "error", "reference"]) targets.push(...(state.layers[layer] || []));
  }
  const reports = targets.map((shape) => {
    const validation = updateZonePrecisionFields(shape, state);
    return {
      reportId: uniqueId("precision"),
      shapeId: shape.id,
      layer: shape.layer,
      createdAt: now(),
      ...validation,
      status: validation.blockingErrors.length ? "blocked" : validation.warnings.length ? "warning" : "passed"
    };
  });
  for (const report of reports) report.sha256 = sha256Json({ ...report, sha256: "" });
  state.precisionReports = [...(state.precisionReports || []), ...reports].slice(-200);
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "zone_precision_validated", { message: "Zone precision validated.", data: { count: reports.length, blocked: reports.filter((item) => item.status === "blocked").length } });
  return result({ reports, state: normalizedStateForClient(root, id), event }, "Zone precision validated.");
}

function precisionReportsForState(state) {
  const reports = [];
  for (const layer of ["correct", "freeze", "error", "reference"]) {
    for (const shape of state.layers[layer] || []) {
      const validation = updateZonePrecisionFields(shape, state);
      reports.push({
        shapeId: shape.id,
        layer,
        ...validation,
        status: validation.blockingErrors.length ? "blocked" : validation.warnings.length ? "warning" : "passed"
      });
    }
  }
  return reports;
}

function refineZone(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = args.editorState ? saveStateFromArgs(root, id, args) : loadState(root, id);
  const found = findZoneById(state, args.shapeId);
  if (!found) throw new Error(`Unknown zone: ${args.shapeId}`);
  const shape = found.shape;
  const operation = args.operation;
  const amount = Number(args.amountPx ?? 2);
  if (!refineOperations.includes(operation)) throw new Error(`Unsupported refine operation: ${operation}`);
  if (operation === "contract" || operation === "dilate") {
    const signed = operation === "contract" ? -Math.abs(amount) : Math.abs(amount);
    const bounds = inflateBounds(shape.include.bounds, signed);
    shape.include.bounds = bounds;
    shape.include.points = pointsForBounds(bounds);
    shape.bounds = bounds;
    shape.points = pointsForBounds(bounds);
  } else if (operation === "simplify" || operation === "smooth") {
    const bounds = normalizeBoundsObject(shape.include.bounds || shape.bounds);
    shape.include.kind = "rectangle";
    shape.include.bounds = bounds;
    shape.include.points = pointsForBounds(bounds);
    shape.kind = "rectangle";
    shape.bounds = bounds;
    shape.points = pointsForBounds(bounds);
  } else if (operation === "subtract") {
    const source = args.sourceShapeId ? findZoneById(state, args.sourceShapeId)?.shape : null;
    const sourceBounds = normalizeBoundsObject(source?.include?.bounds || source?.bounds);
    if (!sourceBounds) throw new Error("subtract requires a valid sourceShapeId.");
    shape.exclude = [...(shape.exclude || []), normalizeSubZone({ kind: "rectangle", bounds: sourceBounds, note: source?.label || source?.note || "subtracted zone" }, "exclude", shape)];
  } else if (operation === "merge") {
    const source = args.sourceShapeId ? findZoneById(state, args.sourceShapeId)?.shape : null;
    const merged = boundsUnion([shape.include?.bounds || shape.bounds, source?.include?.bounds || source?.bounds]);
    if (!merged) throw new Error("merge requires a valid sourceShapeId.");
    shape.include.bounds = merged;
    shape.include.points = pointsForBounds(merged);
    shape.bounds = merged;
    shape.points = pointsForBounds(merged);
  } else if (operation === "duplicate_as_protect") {
    const protect = normalizeSubZone({ kind: shape.include.kind, bounds: shape.include.bounds, points: shape.include.points, note: shape.note || "protected duplicate" }, "protect", shape);
    shape.protect = [...(shape.protect || []), protect];
  }
  shape.geometryVersion = 2;
  updateZonePrecisionFields(shape, state);
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "zone_refined", { message: "Zone geometry refined.", data: { shapeId: shape.id, operation } });
  return result({ shape, state: normalizedStateForClient(root, id), event }, "Zone geometry refined.");
}

function setZoneGeometry(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = args.editorState ? saveStateFromArgs(root, id, args) : loadState(root, id);
  const found = findZoneById(state, args.shapeId);
  if (!found) throw new Error(`Unknown zone: ${args.shapeId}`);
  const shape = found.shape;
  const subtype = args.subtype;
  if (!zoneSubtypes.includes(subtype)) throw new Error(`Unsupported subtype: ${subtype}`);
  const subZone = normalizeSubZone({ kind: shape.kind, bounds: args.bounds, points: args.points, note: args.note || "" }, subtype, shape);
  if (!subZone) throw new Error("Zone geometry is empty or invalid.");
  if (subtype === "include") {
    shape.include = subZone;
    shape.bounds = subZone.bounds;
    shape.points = subZone.points;
    shape.kind = subZone.kind;
  } else {
    const list = Array.isArray(shape[subtype]) ? shape[subtype] : [];
    const index = args.subzoneId ? list.findIndex((item) => item.id === args.subzoneId) : -1;
    if (index >= 0) list[index] = { ...subZone, id: args.subzoneId };
    else list.push(subZone);
    shape[subtype] = list;
  }
  if (args.edgeMode) shape.edgeMode = edgeModes.includes(args.edgeMode) ? args.edgeMode : shape.edgeMode;
  if (args.safetyMarginPx !== undefined) shape.safetyMarginPx = clamp(Number(args.safetyMarginPx), 0, 512);
  if (args.featherPx !== undefined) shape.featherPx = clamp(Number(args.featherPx), 0, 512);
  shape.geometryVersion = 2;
  updateZonePrecisionFields(shape, state);
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "zone_geometry_set", { message: "Precise zone geometry saved.", data: { shapeId: shape.id, subtype } });
  return result({ shape, state: normalizedStateForClient(root, id), event }, "Precise zone geometry saved.");
}

function createPrecisionPreview(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = args.editorState ? saveStateFromArgs(root, id, args) : loadState(root, id);
  const previewId = uniqueId("precision");
  const previewsDir = ensureDir(path.join(sessionDir(root, id), "previews"));
  const svgPath = path.join(previewsDir, `${previewId}.svg`);
  const jsonPath = path.join(previewsDir, `${previewId}.json`);
  const selectedState = args.shapeId ? isolateShapeForPreview(state, args.shapeId) : state;
  writeFileSync(svgPath, overlaySvg(selectedState), "utf8");
  const data = {
    previewId,
    sessionId: id,
    createdAt: now(),
    shapeId: args.shapeId || "",
    precisionSummary: precisionSummary(selectedState),
    svgPath,
    svgSha256: sha256File(svgPath)
  };
  data.sha256 = sha256Json({ ...data, sha256: "" });
  writeJson(jsonPath, data);
  data.jsonPath = jsonPath;
  state.precisionPreviews = [...(state.precisionPreviews || []), data].slice(-100);
  state.artifactHashes = { ...(state.artifactHashes || {}), [previewId]: data.sha256, [`${previewId}:svg`]: data.svgSha256 };
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "precision_preview_created", { message: "Precision preview exported.", data: { previewId, svgSha256: data.svgSha256 } });
  return result({ preview: data, state: normalizedStateForClient(root, id), event }, "Precision preview exported.");
}

function isolateShapeForPreview(state, shapeId) {
  const clone = normalizeState(JSON.parse(JSON.stringify(state)));
  for (const layer of ["correct", "freeze", "error", "reference"]) {
    clone.layers[layer] = (clone.layers[layer] || []).filter((shape) => shape.id === shapeId);
  }
  return clone;
}

function presetStorePath(root) {
  return path.join(root, editorDirName, "presets.json");
}

function builtinPresets(kind = "") {
  const kinds = kind ? [kind] : presetKinds;
  return kinds.flatMap((presetKind) => (defaultPresetDefinitions[presetKind] || []).map((preset) => ({
    ...preset,
    kind: presetKind,
    builtIn: true,
    sha256: sha256Json({ kind: presetKind, presetId: preset.presetId, values: preset.values })
  })));
}

function readPresetStore(root) {
  const fallback = { schemaVersion: 1, presets: [] };
  const store = readJson(presetStorePath(root), fallback);
  store.presets = Array.isArray(store.presets) ? store.presets : [];
  return store;
}

function writePresetStore(root, store) {
  store.updatedAt = now();
  store.sha256 = sha256Json({ ...store, sha256: "" });
  writeJsonAtomic(presetStorePath(root), store);
  return store;
}

function allPresets(root, kind = "") {
  const local = readPresetStore(root).presets.filter((preset) => preset.deleted !== true && (!kind || preset.kind === kind));
  return [...builtinPresets(kind), ...local];
}

function findPreset(root, kind, presetId) {
  const preset = allPresets(root, kind).find((item) => item.kind === kind && item.presetId === presetId);
  if (!preset) throw new Error(`Unknown ${kind} preset: ${presetId}`);
  return preset;
}

function listZonePresets(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const kind = presetKinds.includes(args.kind) ? args.kind : "";
  const presets = allPresets(root, kind);
  const state = loadState(root, id);
  state.presets = presets;
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  return result({ presets, state: normalizedStateForClient(root, id) }, `${presets.length} preset(s) found.`);
}

function saveZonePreset(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const kind = args.kind;
  if (!presetKinds.includes(kind)) throw new Error(`Unsupported preset kind: ${kind}`);
  const presetId = safeId(args.presetId || args.label, "preset");
  const preset = {
    kind,
    presetId,
    label: args.label,
    values: args.values || {},
    builtIn: false,
    createdAt: now()
  };
  preset.sha256 = sha256Json({ ...preset, sha256: "" });
  const store = readPresetStore(root);
  store.presets = [...store.presets.filter((item) => !(item.kind === kind && item.presetId === presetId)), preset];
  writePresetStore(root, store);
  const state = loadState(root, id);
  state.presets = allPresets(root);
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "preset_saved", { message: "Local preset saved.", data: { kind, presetId, sha256: preset.sha256 } });
  return result({ preset, presets: allPresets(root, kind), state: normalizedStateForClient(root, id), event }, "Local preset saved.");
}

function applyZonePreset(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = args.editorState ? saveStateFromArgs(root, id, args) : loadState(root, id);
  const preset = findPreset(root, args.kind, args.presetId);
  if (preset.kind === "zone") {
    const found = findZoneById(state, args.shapeId || state.selectedShapeId);
    if (!found) throw new Error("Zone preset requires a valid shapeId or selectedShapeId.");
    Object.assign(found.shape, {
      edgeMode: preset.values.edgeMode || found.shape.edgeMode,
      safetyMarginPx: preset.values.safetyMarginPx ?? found.shape.safetyMarginPx,
      featherPx: preset.values.featherPx ?? found.shape.featherPx,
      priority: preset.values.priority || found.shape.priority,
      constraintType: preset.values.constraintType || found.shape.constraintType,
      presetId: preset.presetId
    });
    updateZonePrecisionFields(found.shape, state);
  } else if (preset.kind === "layer") {
    const layer = preset.values.layer;
    if (!state.layerSettings[layer]) throw new Error(`Layer preset references unknown layer: ${layer}`);
    state.layerSettings[layer] = {
      ...state.layerSettings[layer],
      visible: preset.values.visible !== false,
      locked: preset.values.locked === true,
      opacity: clamp(Number(preset.values.opacity ?? state.layerSettings[layer].opacity), 0.05, 1)
    };
  } else if (preset.kind === "prompt") {
    const draft = latest(state.promptDrafts || []);
    if (draft) draft.constraints = mergeConstraints(draft.constraints || {}, preset.values || {});
  } else if (preset.kind === "review") {
    state.reviewPreset = { presetId: preset.presetId, values: preset.values };
  }
  const applied = { appliedPresetId: uniqueId("applied"), kind: preset.kind, presetId: preset.presetId, shapeId: args.shapeId || state.selectedShapeId || "", createdAt: now(), sha256: preset.sha256 };
  state.appliedPresets = [...(state.appliedPresets || []), applied].slice(-100);
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "preset_applied", { message: "Preset applied.", data: applied });
  return result({ preset, applied, state: normalizedStateForClient(root, id), event }, "Preset applied.");
}

function deleteZonePreset(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  if (builtinPresets(args.kind).some((preset) => preset.presetId === args.presetId)) throw new Error("Built-in presets cannot be deleted.");
  const store = readPresetStore(root);
  const preset = store.presets.find((item) => item.kind === args.kind && item.presetId === args.presetId && item.deleted !== true);
  if (!preset) throw new Error(`Unknown local preset: ${args.presetId}`);
  preset.deleted = true;
  preset.deletedAt = now();
  writePresetStore(root, store);
  const state = loadState(root, id);
  state.presets = allPresets(root);
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "preset_deleted", { message: "Local preset deleted.", data: { kind: args.kind, presetId: args.presetId } });
  return result({ preset, presets: allPresets(root, args.kind), state: normalizedStateForClient(root, id), event }, "Local preset deleted.");
}

function saveStateFromArgs(root, id, args) {
  const current = loadState(root, id);
  const incoming = args.editorState ? normalizeState({ ...current, ...args.editorState, workspaceRoot: root, sessionId: id }) : current;
  delete incoming.previewImageDataUrl;
  delete incoming.baseImageDataUrl;
  if (args.baseImagePath) {
    const checked = assertImagePath(root, args.baseImagePath, "baseImagePath");
    incoming.baseImagePath = checked.path;
    incoming.imageInfo = checked.info;
    incoming.artifactHashes.baseImage = sha256File(checked.path);
  } else if (args.editorState?.previewImageDataUrl && !incoming.baseImagePath) {
    const saved = saveDataUrlImage(root, id, args.editorState.previewImageDataUrl, args.editorState.imageName || "imported-image");
    incoming.baseImagePath = saved.path;
    incoming.imageInfo = saved.info;
    incoming.artifactHashes.baseImage = saved.sha256;
  } else if (incoming.baseImagePath && existsSync(incoming.baseImagePath)) {
    incoming.imageInfo = imageInfo(incoming.baseImagePath);
    incoming.artifactHashes.baseImage = sha256File(incoming.baseImagePath);
  }
  if (args.userRequest) incoming.userRequest = args.userRequest;
  writeJson(statePath(root, id), incoming);
  return incoming;
}

function updateEditorState(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = saveStateFromArgs(root, id, args);
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "state_saved", { message: "Inline editor state saved.", data: { selectedShapeId: state.selectedShapeId || "" } });
  return result({ state: normalizedStateForClient(root, id), event }, "Editor state saved.");
}

function addReferenceImage(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = loadState(root, id);
  let saved;
  if (args.imageDataUrl) {
    saved = saveDataUrlImage(root, id, args.imageDataUrl, args.fileName || "reference-image");
  } else if (args.referenceImagePath) {
    const checked = assertImagePath(root, args.referenceImagePath, "referenceImagePath");
    const refsDir = ensureDir(path.join(sessionDir(root, id), "references"));
    const ext = path.extname(checked.path).toLowerCase() || ".png";
    const target = path.join(refsDir, `${uniqueId("ref-src")}${ext}`);
    copyFileSync(checked.path, target);
    saved = { path: target, info: imageInfo(target), sha256: sha256File(target) };
  } else {
    throw new Error("Either imageDataUrl or referenceImagePath is required.");
  }
  const reference = {
    referenceId: uniqueId("ref"),
    path: saved.path,
    imageInfo: saved.info,
    sha256: saved.sha256,
    note: args.note || "",
    weight: referenceWeights.includes(args.weight) ? args.weight : "medium",
    createdAt: now(),
    removed: false
  };
  state.references = [...(state.references || []), reference];
  state.artifactHashes = { ...(state.artifactHashes || {}), [reference.referenceId]: reference.sha256 };
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "reference_added", { message: "Reference image added.", data: { referenceId: reference.referenceId, weight: reference.weight, sha256: reference.sha256 } });
  return result({ reference: withPreviewReference(reference), references: referencesForClient(loadState(root, id).references), event }, "Reference image added.");
}

function removeReferenceImage(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = loadState(root, id);
  const reference = (state.references || []).find((item) => item.referenceId === args.referenceId);
  if (!reference) throw new Error(`Unknown reference: ${args.referenceId}`);
  reference.removed = true;
  reference.removedAt = now();
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "reference_removed", { message: "Reference image removed from active session.", data: { referenceId: args.referenceId } });
  return result({ reference, references: referencesForClient(loadState(root, id).references), event }, "Reference removed from active session.");
}

function getEditorState(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const clientState = normalizedStateForClient(root, id);
  return result({ state: clientState, storageDir: sessionDir(root, id), widget: widgetUri }, "Codex Image Editor state loaded.", { "openai/outputTemplate": widgetUri });
}

function recordHostCapabilities(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const capabilities = normalizeHostCapabilities({
    ...(args.capabilities || {}),
    reportedBy: args.reportedBy || args.capabilities?.reportedBy || "codex-host",
    reportedAt: now()
  });
  const hostBlockers = hostBlockersForCapabilities(capabilities);
  const state = loadState(root, id);
  state.hostCapabilities = capabilities;
  state.handoffs = (state.handoffs || []).map((handoff) => {
    if (terminalHandoffStatuses.includes(handoff.status)) return handoff;
    const updated = {
      ...handoff,
      hostCapabilities: capabilities,
      hostBlockers,
      updatedAt: now()
    };
    if (hostBlockers.length) {
      updated.status = "host_blocked";
    } else if (["host_blocked", "ready_for_handoff", "view_image_required"].includes(updated.status)) {
      updated.status = initialHandoffStatus(updated.requiredImages || [], []);
    }
    return normalizeHandoff(updated);
  });
  state.pendingGenerations = pendingFromHandoffs(state.handoffs || []);
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const eventType = hostBlockers.length ? "host_blocked" : "host_capabilities_recorded";
  const event = appendEvent(root, id, eventType, {
    message: hostBlockers.length ? "Codex host capability blocker recorded." : "Codex host capabilities recorded.",
    data: { capabilities, hostBlockers }
  });
  return result({ capabilities, hostBlockers, state: normalizedStateForClient(root, id), event }, "Host capabilities recorded.");
}

function latestGenerationPacket(state, root, id, contextId = "") {
  if (contextId) {
    return readContextPacket(root, id, contextId) || (state.generationRequests || []).find((packet) => packet.contextId === contextId) || null;
  }
  const latestPacket = latest(state.generationRequests || []);
  if (!latestPacket) return null;
  return readContextPacket(root, id, latestPacket.contextId) || latestPacket;
}

function createCodexHandoff(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  let state = loadState(root, id);
  if (args.hostCapabilities) {
    state.hostCapabilities = normalizeHostCapabilities({ ...(args.hostCapabilities || {}), reportedBy: args.hostCapabilities.reportedBy || "codex-host", reportedAt: now() });
    state.updatedAt = now();
    writeJsonAtomic(statePath(root, id), state);
  }
  state = loadState(root, id);
  const packet = latestGenerationPacket(state, root, id, args.contextId || "");
  if (!packet) throw new Error("No generated Image Gen request packet is available for handoff.");
  const existing = findHandoff(state, { contextId: packet.contextId });
  const prompt = packet.promptPath && existsSync(packet.promptPath) ? readFileSync(packet.promptPath, "utf8") : "";
  const handoff = buildCodexHandoff(root, id, packet, prompt, { handoffId: existing?.handoffId || packet.handoffId || "", hostCapabilities: state.hostCapabilities || {} });
  const persisted = persistHandoff(root, id, handoff, handoff.status === "host_blocked" ? "host_blocked" : "handoff_created", handoff.status === "host_blocked" ? "Codex Image Gen handoff blocked by host capability report." : "Codex Image Gen handoff created.");
  return result({ handoff: persisted.handoff, event: persisted.event, state: normalizedStateForClient(root, id) }, "Codex Image Gen handoff ready.");
}

function recordHandoffEvent(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  if (!handoffStatuses.includes(args.status)) throw new Error(`Unsupported handoff status: ${args.status}`);
  const state = loadState(root, id);
  const handoff = findHandoff(state, { handoffId: args.handoffId || "", contextId: args.contextId || "" });
  if (!handoff) throw new Error("Unknown handoff for status update.");
  const handoffEvent = {
    eventId: uniqueId("handoffevt"),
    handoffId: handoff.handoffId,
    contextId: handoff.contextId,
    status: args.status,
    createdAt: now(),
    message: args.message || "",
    data: args.data || {}
  };
  const updated = normalizeHandoff({
    ...handoff,
    status: args.status,
    hostBlockers: Array.isArray(args.data?.hostBlockers) ? args.data.hostBlockers.map(String) : handoff.hostBlockers || [],
    updatedAt: now(),
    events: [...(handoff.events || []), handoffEvent].slice(-100)
  });
  updateHandoffInState(state, updated);
  state.handoffEvents = [...(state.handoffEvents || []), handoffEvent].slice(-250);
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const eventType = args.status === "host_blocked" ? "host_blocked" : "handoff_event_recorded";
  const event = appendEvent(root, id, eventType, {
    contextId: updated.contextId,
    message: args.message || `Handoff status: ${args.status}`,
    data: { handoffId: updated.handoffId, status: updated.status, ...(args.data || {}) }
  });
  return result({ handoff: updated, handoffEvent, event, state: normalizedStateForClient(root, id) }, "Handoff event recorded.");
}

function registerArtifactCandidate(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  let state = loadState(root, id);
  const handoff = findHandoff(state, { handoffId: args.handoffId || "", contextId: args.contextId || "" });
  const contextId = String(args.contextId || handoff?.contextId || "");
  if (!contextId) throw new Error("contextId is required to register an artifact candidate.");
  if (!args.artifactPath && !args.artifactId) throw new Error("artifactPath or artifactId is required to register an artifact candidate.");
  let artifactPath = "";
  let image = null;
  let sha = "";
  if (args.artifactPath) {
    const checked = assertImagePath(root, args.artifactPath, "artifactPath");
    artifactPath = checked.path;
    image = checked.info;
    sha = sha256File(checked.path);
  } else {
    sha = sha256Json({ artifactId: args.artifactId || "", contextId, codexTurnId: args.codexTurnId || "", origin: args.origin || "" });
  }
  const candidate = normalizeArtifactCandidate({
    candidateId: uniqueId("cand"),
    contextId,
    handoffId: handoff?.handoffId || args.handoffId || "",
    artifactPath,
    artifactId: args.artifactId || "",
    codexTurnId: args.codexTurnId || "",
    origin: args.origin || "",
    sha256: sha,
    imageInfo: image,
    receivedAt: now(),
    status: "pending",
    notes: args.notes || ""
  });
  state.artifactCandidates = upsertByKey(state.artifactCandidates || [], "candidateId", candidate, 100);
  if (handoff) {
    const updatedHandoff = normalizeHandoff({
      ...handoff,
      status: "artifact_candidate_received",
      updatedAt: now(),
      events: [...(handoff.events || []), {
        eventId: uniqueId("handoffevt"),
        handoffId: handoff.handoffId,
        contextId,
        status: "artifact_candidate_received",
        createdAt: now(),
        message: "Artifact candidate received.",
        data: { candidateId: candidate.candidateId, sha256: candidate.sha256 }
      }].slice(-100)
    });
    updateHandoffInState(state, updatedHandoff);
  } else {
    state.pendingGenerations = pendingFromHandoffs(state.handoffs || []);
  }
  state.artifactHashes = {
    ...(state.artifactHashes || {}),
    [candidate.candidateId]: candidate.sha256
  };
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "artifact_candidate_received", {
    contextId,
    message: "Artifact candidate registered for review.",
    data: { candidateId: candidate.candidateId, origin: candidate.origin, sha256: candidate.sha256 }
  });
  return result({ candidate: withPreviewArtifactCandidate(candidate), pendingGenerations: pendingFromHandoffs(loadState(root, id).handoffs || []), state: normalizedStateForClient(root, id), event }, "Artifact candidate registered.");
}

function resolveArtifactCandidate(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  if (!["accept", "reject"].includes(args.decision)) throw new Error("decision must be accept or reject.");
  let state = loadState(root, id);
  const candidate = (state.artifactCandidates || []).find((item) => item.candidateId === args.candidateId);
  if (!candidate) throw new Error(`Unknown artifact candidate: ${args.candidateId}`);
  if (args.decision === "accept") {
    if (candidate.origin !== "codex-image-gen") throw new Error('Only origin "codex-image-gen" artifact candidates can be accepted.');
    if (!candidate.artifactPath) throw new Error("A local artifactPath is required before accepting a candidate.");
    const saved = saveGeneratedResult({
      workspaceRoot: root,
      sessionId: id,
      contextId: candidate.contextId,
      artifactPath: candidate.artifactPath,
      origin: candidate.origin,
      codexTurnId: candidate.codexTurnId,
      notes: args.reason || candidate.notes || "Accepted from artifact inbox."
    });
    const version = saved.structuredContent?.version || null;
    state = loadState(root, id);
    const accepted = (state.artifactCandidates || []).find((item) => item.candidateId === args.candidateId);
    if (accepted) {
      accepted.status = "registered";
      accepted.resolvedAt = now();
      accepted.versionId = version?.versionId || "";
      accepted.rejectionReason = "";
    }
    const handoff = findHandoff(state, { handoffId: candidate.handoffId || "", contextId: candidate.contextId });
    let updatedHandoff = null;
    if (handoff) {
      updatedHandoff = normalizeHandoff({
        ...handoff,
        status: "registered",
        updatedAt: now(),
        events: [...(handoff.events || []), {
          eventId: uniqueId("handoffevt"),
          handoffId: handoff.handoffId,
          contextId: candidate.contextId,
          status: "registered",
          createdAt: now(),
          message: "Artifact candidate accepted as version.",
          data: { candidateId: candidate.candidateId, versionId: version?.versionId || "" }
        }].slice(-100)
      });
      updateHandoffInState(state, updatedHandoff);
    } else {
      state.pendingGenerations = pendingFromHandoffs(state.handoffs || []);
    }
    state.updatedAt = now();
    writeJsonAtomic(statePath(root, id), state);
    const event = appendEvent(root, id, "artifact_candidate_resolved", {
      contextId: candidate.contextId,
      versionId: version?.versionId || "",
      message: "Artifact candidate accepted and registered as a local version.",
      data: { candidateId: candidate.candidateId, decision: "accept" }
    });
    return result({
      candidate: withPreviewArtifactCandidate(accepted || candidate),
      handoff: updatedHandoff,
      version,
      versions: saved.structuredContent?.versions || [],
      events: [...(saved.structuredContent?.events || []), event],
      pendingGenerations: pendingFromHandoffs(loadState(root, id).handoffs || []),
      state: normalizedStateForClient(root, id)
    }, "Artifact candidate accepted.");
  }
  candidate.status = "rejected";
  candidate.resolvedAt = now();
  candidate.rejectionReason = args.reason || "Rejected from artifact inbox.";
  const handoff = findHandoff(state, { handoffId: candidate.handoffId || "", contextId: candidate.contextId });
  let updatedHandoff = null;
  if (handoff && !terminalHandoffStatuses.includes(handoff.status)) {
    updatedHandoff = normalizeHandoff({
      ...handoff,
      status: "awaiting_artifact",
      updatedAt: now(),
      events: [...(handoff.events || []), {
        eventId: uniqueId("handoffevt"),
        handoffId: handoff.handoffId,
        contextId: candidate.contextId,
        status: "awaiting_artifact",
        createdAt: now(),
        message: candidate.rejectionReason,
        data: { candidateId: candidate.candidateId, decision: "reject" }
      }].slice(-100)
    });
    updateHandoffInState(state, updatedHandoff);
  } else {
    state.pendingGenerations = pendingFromHandoffs(state.handoffs || []);
  }
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, "artifact_candidate_resolved", {
    contextId: candidate.contextId,
    message: candidate.rejectionReason,
    data: { candidateId: candidate.candidateId, decision: "reject" }
  });
  return result({ candidate: withPreviewArtifactCandidate(candidate), handoff: updatedHandoff, pendingGenerations: pendingFromHandoffs(loadState(root, id).handoffs || []), state: normalizedStateForClient(root, id), event }, "Artifact candidate rejected.");
}

function listPendingGenerations(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = loadState(root, id);
  state.pendingGenerations = pendingFromHandoffs(state.handoffs || []);
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  return result({
    pendingGenerations: state.pendingGenerations,
    handoffs: state.handoffs || [],
    artifactCandidates: artifactCandidatesForClient(state.artifactCandidates || []),
    hostCapabilities: state.hostCapabilities || {}
  }, `${state.pendingGenerations.length} pending generation(s).`);
}

function createGenerationRequest(args, options = {}) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const state = saveStateFromArgs(root, id, args);
  const precisionReports = precisionReportsForState(state);
  const blockingPrecision = precisionReports.filter((report) => report.blockingErrors.length);
  if (blockingPrecision.length) {
    throw new Error(`Precision validation blocked export: ${blockingPrecision.map((report) => `${report.shapeId}: ${report.blockingErrors.join("; ")}`).join(" | ")}`);
  }
  const contextId = uniqueId(options.retry ? "retry" : "ctx");
  const dir = sessionDir(root, id);
  const contextsDir = ensureDir(path.join(dir, "contexts"));
  const overlaysDir = ensureDir(path.join(dir, "overlays"));
  const incomingDir = ensureDir(path.join(dir, "incoming"));
  const expected = args.expectedResultPath
    ? assertInside(root, args.expectedResultPath, "expectedResultPath")
    : path.join(incomingDir, `${contextId}-codex-image-gen.png`);
  const overlayPath = path.join(overlaysDir, `${contextId}.svg`);
  const contextPath = path.join(contextsDir, `${contextId}.json`);
  const promptPath = path.join(contextsDir, `${contextId}.prompt.md`);
  writeFileSync(overlayPath, overlaySvg(state), "utf8");
  const overlayHash = sha256File(overlayPath);
  const precisionPreviewPath = path.join(overlaysDir, `${contextId}.precision.json`);
  const precisionData = { contextId, createdAt: now(), precisionSummary: precisionSummary(state), precisionReports };
  precisionData.sha256 = sha256Json({ ...precisionData, sha256: "" });
  writeJson(precisionPreviewPath, precisionData);
  const precisionPreviewHash = sha256File(precisionPreviewPath);
  const baseHash = state.baseImagePath && existsSync(state.baseImagePath) ? sha256File(state.baseImagePath) : "";
  const preparedRequest = latestPreparedRequest(state, { inputPackageId: options.inputPackageId || "", draftId: options.promptDraftId || "" });
  const packet = {
    schemaVersion: 1,
    contextId,
    requestType: options.retry ? "retry" : "generation",
    sessionId: id,
    createdAt: now(),
    workspaceRoot: root,
    baseImagePath: state.baseImagePath,
    baseImageSha256: baseHash,
    imageInfo: state.imageInfo,
    userRequest: state.userRequest,
    inputPackageId: preparedRequest?.inputPackage?.inputPackageId || options.inputPackageId || "",
    promptDraftId: preparedRequest?.draft?.draftId || options.promptDraftId || "",
    normalizedRequest: preparedRequest?.draft ? {
      originalPrompt: preparedRequest.draft.originalPrompt || "",
      normalizedPrompt: preparedRequest.draft.normalizedPrompt || "",
      detectedLanguage: preparedRequest.draft.detectedLanguage || "",
      intent: preparedRequest.draft.intent || "",
      useCase: preparedRequest.draft.useCase || "",
      assetType: preparedRequest.draft.assetType || "",
      constraints: preparedRequest.draft.constraints || {},
      ambiguities: preparedRequest.draft.ambiguities || []
    } : null,
    workingTranslation: preparedRequest?.translation ? {
      translationId: preparedRequest.translation.translationId,
      targetLanguage: preparedRequest.translation.targetLanguage,
      workingTranslation: preparedRequest.translation.workingTranslation,
      textVerbatim: preparedRequest.translation.textVerbatim || [],
      translationApiUsed: false
    } : null,
    conversationImages: preparedRequest?.images || [],
    requestValidation: preparedRequest?.validation || null,
    precisionSummary: precisionData.precisionSummary,
    precisionReports,
    precisionPreviewPath,
    precisionPreviewSha256: precisionPreviewHash,
    appliedPresets: state.appliedPresets || [],
    layerSummary: layerSummary(state),
    annotations: state.annotations,
    references: (state.references || []).filter((ref) => ref.removed !== true),
    overlayPath,
    overlaySha256: overlayHash,
    expectedResultPath: expected,
    source: args.source || options.source || "",
    retryOfVersionId: options.retryOfVersionId || "",
    retryReason: options.retryReason || "",
    generationBoundary: {
      executor: "codex-built-in-image-gen",
      mcpGeneratesImages: false,
      apiFallbackAllowed: false,
      simulatedResultsAllowed: false
    }
  };
  writeJson(contextPath, packet);
  const prompt = buildPrompt(state, contextId, expected, overlayPath, contextPath, preparedRequest);
  writeFileSync(promptPath, prompt, "utf8");
  const promptHash = sha256File(promptPath);
  packet.handoffId = uniqueId("handoff");
  packet.promptPath = promptPath;
  packet.promptSha256 = promptHash;
  packet.contextPath = contextPath;
  packet.contextSha256 = sha256Json({ ...packet, contextSha256: "" });
  writeJson(contextPath, packet);
  const latestState = loadState(root, id);
  latestState.generationRequests = [...(latestState.generationRequests || []), packet].slice(-100);
  latestState.artifactHashes = {
    ...(latestState.artifactHashes || {}),
    [contextId]: packet.contextSha256,
    [`${contextId}:overlay`]: overlayHash,
    [`${contextId}:precision`]: precisionPreviewHash,
    [`${contextId}:prompt`]: promptHash
  };
  if (baseHash) latestState.artifactHashes.baseImage = baseHash;
  latestState.updatedAt = now();
  writeJsonAtomic(statePath(root, id), latestState);
  const event = appendEvent(root, id, "context_exported", { contextId, message: "Image Gen request exported.", data: { retry: options.retry === true, expectedResultPath: expected } });
  const handoffResult = persistHandoff(root, id, buildCodexHandoff(root, id, packet, prompt, { handoffId: packet.handoffId }), "handoff_created", "Codex Image Gen handoff created for exported request.");
  return result({ packet, prompt, promptPath, contextPath, overlayPath, expectedResultPath: expected, handoff: handoffResult.handoff, handoffEvent: handoffResult.event, event, state: normalizedStateForClient(root, id) }, "Image Gen request exported. Use the returned handoff prompt in Codex with built-in Image Gen.");
}

function exportImageContext(args) {
  return createGenerationRequest(args, { source: "export_image_context_compat" });
}

function readVersions(root, id) {
  const versionsPath = path.join(sessionDir(root, id), "versions.json");
  return readJson(versionsPath, { versions: [] });
}

function writeVersions(root, id, data) {
  writeJson(path.join(sessionDir(root, id), "versions.json"), data);
}

function withPreview(value) {
  const item = { ...value };
  const imagePath = item.resultPath || item.baseImagePath;
  if (imagePath) {
    try {
      if (!existsSync(imagePath)) throw new Error(`Image file is missing: ${imagePath}`);
      const preview = dataUrlForFile(imagePath);
      if (item.resultPath) item.previewDataUrl = preview.dataUrl;
      else item.baseImageDataUrl = preview.dataUrl;
      if (preview.previewUnavailableReason) item.previewUnavailableReason = preview.previewUnavailableReason;
    } catch (error) {
      item.previewDataUrl = "";
      item.baseImageDataUrl = "";
      item.previewUnavailableReason = error?.message || String(error);
    }
  }
  return item;
}

function withPreviewReference(value) {
  const item = { ...value };
  if (item.path) {
    try {
      const preview = dataUrlForFile(item.path);
      item.previewDataUrl = preview.dataUrl;
      if (preview.previewUnavailableReason) item.previewUnavailableReason = preview.previewUnavailableReason;
    } catch (error) {
      item.previewDataUrl = "";
      item.previewUnavailableReason = error?.message || String(error);
    }
  }
  return item;
}

function referencesForClient(references) {
  return (references || []).map((reference) => withPreviewReference(reference));
}

function versionsForClient(versions) {
  return versions.map((version) => withPreview(version));
}

function readContextPacket(root, id, contextId) {
  if (!contextId) return null;
  const contextPath = path.join(sessionDir(root, id), "contexts", `${safeId(contextId)}.json`);
  return readJson(contextPath, null);
}

function freezeBoundsFromPacket(packet) {
  const freeze = (packet?.layerSummary || []).find((entry) => entry.layer === "freeze");
  return (freeze?.items || []).map((item) => item.bounds).filter((bounds) => bounds && Number.isFinite(Number(bounds.width)) && Number.isFinite(Number(bounds.height)));
}

function invariantCheck(root, id, version, contextId) {
  const packet = readContextPacket(root, id, contextId);
  const baseImagePath = packet?.baseImagePath;
  const freezeBounds = freezeBoundsFromPacket(packet);
  if (!baseImagePath || !existsSync(baseImagePath)) {
    return { status: "not_checked", reason: "Base image context is unavailable." };
  }
  if (!freezeBounds.length) {
    return { status: "not_applicable", reason: "No frozen regions were marked." };
  }
  let baseInfo;
  let resultInfo;
  try {
    baseInfo = imageInfo(baseImagePath);
    resultInfo = imageInfo(version.resultPath);
  } catch (error) {
    return { status: "not_checked", reason: error?.message || String(error) };
  }
  if (baseInfo.type !== "png" || resultInfo.type !== "png") {
    return { status: "not_checked", reason: "Frozen-region pixel comparison currently supports PNG sources only." };
  }
  let base;
  let generated;
  try {
    base = decodePngRgba(readFileSync(baseImagePath));
    generated = decodePngRgba(readFileSync(version.resultPath));
  } catch (error) {
    return { status: "not_checked", reason: error?.message || String(error) };
  }
  if (base.width !== generated.width || base.height !== generated.height) {
    return {
      status: "drift_detected",
      reason: `Generated image dimensions ${generated.width}x${generated.height} differ from base ${base.width}x${base.height}.`,
      changedRatio: 1,
      sampledPixels: 0,
      changedPixels: 0
    };
  }
  const comparison = compareFrozenRegions(base, generated, freezeBounds);
  const status = comparison.changedPixels === 0 ? "passed" : "drift_detected";
  return {
    status,
    reason: status === "passed" ? "Frozen-region pixels match the source PNG." : "Frozen-region pixels differ from the source PNG.",
    ...comparison,
    followUpPrompt: status === "passed" ? "" : "Ask Codex/Image Gen for a narrower retry that preserves the frozen regions exactly and only edits the marked correction/error zones."
  };
}

function findVersion(root, id, versionId) {
  const versions = readVersions(root, id);
  const version = versions.versions.find((item) => item.versionId === versionId);
  if (!version) throw new Error(`Unknown version: ${versionId}`);
  return { versions, version };
}

function compareVersion(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const { versions, version } = findVersion(root, id, args.versionId);
  version.invariantCheck = invariantCheck(root, id, version, args.contextId || version.contextId || "");
  version.reviewedAt = now();
  if (version.invariantCheck.status === "drift_detected" && version.status !== "committed" && version.status !== "rejected") {
    version.status = "needs_retry";
  } else if (version.invariantCheck.status === "passed" && version.status === "ready_with_drift_warning") {
    version.status = "ready_for_review";
  }
  writeVersions(root, id, versions);
  const state = loadState(root, id);
  const report = {
    reportId: uniqueId("review"),
    versionId: version.versionId,
    contextId: args.contextId || version.contextId || "",
    createdAt: now(),
    invariantCheck: version.invariantCheck,
    status: version.status
  };
  state.reviewReports = [...(state.reviewReports || []), report].slice(-100);
  state.versions = versions.versions;
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const eventType = version.invariantCheck.status === "drift_detected" ? "drift_detected" : "review_ready";
  const event = appendEvent(root, id, eventType, { contextId: report.contextId, versionId: version.versionId, message: report.invariantCheck.reason || "Version compared.", data: report.invariantCheck });
  return result({ version: withPreview(version), report, event }, "Version comparison complete.");
}

function createRetryRequest(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const { version } = findVersion(root, id, args.versionId);
  const state = loadState(root, id);
  const reason = args.reason || version.rejectionReason || version.invariantCheck?.reason || "The previous result needs a narrower retry.";
  const retryRequest = args.userRequest || [
    state.userRequest || "Apply the requested edit.",
    "",
    `Retry reason: ${reason}`,
    version.invariantCheck?.followUpPrompt || "Preserve frozen regions exactly and only edit marked correction/error zones."
  ].filter(Boolean).join("\n");
  const result = createGenerationRequest({
    workspaceRoot: root,
    sessionId: id,
    baseImagePath: state.baseImagePath,
    userRequest: retryRequest,
    editorState: { ...state, userRequest: retryRequest },
    expectedResultPath: args.expectedResultPath
  }, { retry: true, retryOfVersionId: version.versionId, retryReason: reason, source: "create_retry_request" });
  const event = appendEvent(root, id, "retry_created", { contextId: result.structuredContent?.packet?.contextId || "", versionId: version.versionId, message: reason, data: { retryOfVersionId: version.versionId } });
  result.structuredContent.event = event;
  return result;
}

function compareFrozenRegions(base, generated, freezeBounds) {
  const clipped = freezeBounds.map((bounds) => ({
    x0: Math.max(0, Math.floor(Number(bounds.x))),
    y0: Math.max(0, Math.floor(Number(bounds.y))),
    x1: Math.min(base.width, Math.ceil(Number(bounds.x) + Number(bounds.width))),
    y1: Math.min(base.height, Math.ceil(Number(bounds.y) + Number(bounds.height)))
  })).filter((box) => box.x1 > box.x0 && box.y1 > box.y0);
  const totalPixels = clipped.reduce((sum, box) => sum + (box.x1 - box.x0) * (box.y1 - box.y0), 0);
  if (!totalPixels) return { changedRatio: 0, sampledPixels: 0, changedPixels: 0, boxesChecked: 0 };
  const stride = Math.max(1, Math.ceil(Math.sqrt(totalPixels / invariantSampleLimit)));
  let sampledPixels = 0;
  let changedPixels = 0;
  let maxDelta = 0;
  for (const box of clipped) {
    for (let y = box.y0; y < box.y1; y += stride) {
      for (let x = box.x0; x < box.x1; x += stride) {
        const offset = (y * base.width + x) * 4;
        const delta = Math.max(
          Math.abs(base.data[offset] - generated.data[offset]),
          Math.abs(base.data[offset + 1] - generated.data[offset + 1]),
          Math.abs(base.data[offset + 2] - generated.data[offset + 2]),
          Math.abs(base.data[offset + 3] - generated.data[offset + 3])
        );
        maxDelta = Math.max(maxDelta, delta);
        if (delta > 8) changedPixels += 1;
        sampledPixels += 1;
      }
    }
  }
  return {
    changedRatio: sampledPixels ? Number((changedPixels / sampledPixels).toFixed(6)) : 0,
    sampledPixels,
    changedPixels,
    maxDelta,
    boxesChecked: clipped.length
  };
}

function decodePngRgba(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Invalid PNG signature.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let palette = null;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new Error("Unsupported PNG compression, filter, or interlace method.");
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}; expected 8.`);
  const channels = channelsForColorType(colorType);
  const bpp = channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const raw = Buffer.alloc(height * stride);
  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[input++];
    const rowStart = y * stride;
    const previousRowStart = rowStart - stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? raw[rowStart + x - bpp] : 0;
      const up = y > 0 ? raw[previousRowStart + x] : 0;
      const upLeft = y > 0 && x >= bpp ? raw[previousRowStart + x - bpp] : 0;
      const current = inflated[input++];
      raw[rowStart + x] = unfilterByte(filter, current, left, up, upLeft);
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, o = 0; i < raw.length; i += channels, o += 4) {
    if (colorType === 0) {
      rgba[o] = raw[i];
      rgba[o + 1] = raw[i];
      rgba[o + 2] = raw[i];
      rgba[o + 3] = 255;
    } else if (colorType === 2) {
      rgba[o] = raw[i];
      rgba[o + 1] = raw[i + 1];
      rgba[o + 2] = raw[i + 2];
      rgba[o + 3] = 255;
    } else if (colorType === 3) {
      if (!palette) throw new Error("Indexed PNG is missing a palette.");
      const index = raw[i] * 3;
      rgba[o] = palette[index] || 0;
      rgba[o + 1] = palette[index + 1] || 0;
      rgba[o + 2] = palette[index + 2] || 0;
      rgba[o + 3] = 255;
    } else if (colorType === 4) {
      rgba[o] = raw[i];
      rgba[o + 1] = raw[i];
      rgba[o + 2] = raw[i];
      rgba[o + 3] = raw[i + 1];
    } else if (colorType === 6) {
      rgba[o] = raw[i];
      rgba[o + 1] = raw[i + 1];
      rgba[o + 2] = raw[i + 2];
      rgba[o + 3] = raw[i + 3];
    }
  }
  return { width, height, data: rgba };
}

function channelsForColorType(colorType) {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 3) return 1;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`Unsupported PNG color type ${colorType}.`);
}

function unfilterByte(filter, current, left, up, upLeft) {
  if (filter === 0) return current;
  if (filter === 1) return (current + left) & 0xff;
  if (filter === 2) return (current + up) & 0xff;
  if (filter === 3) return (current + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (current + paeth(left, up, upLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter ${filter}.`);
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function saveGeneratedResult(args) {
  if (args.origin !== "codex-image-gen") {
    throw new Error('origin must be exactly "codex-image-gen"; refusing non-Codex Image Gen artifact.');
  }
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const checked = assertImagePath(root, args.artifactPath, "artifactPath");
  const versionId = uniqueId("ver");
  const versionDir = ensureDir(path.join(sessionDir(root, id), "versions", versionId));
  const ext = path.extname(checked.path).toLowerCase() || ".png";
  const resultPath = path.join(versionDir, `result${ext}`);
  copyFileSync(checked.path, resultPath);
  const sourceSha256 = sha256File(checked.path);
  const resultSha256 = sha256File(resultPath);
  const version = {
    versionId,
    sessionId: id,
    contextId: args.contextId || "",
    origin: args.origin,
    codexTurnId: args.codexTurnId || "",
    sourceArtifactPath: checked.path,
    sourceSha256,
    resultPath,
    resultSha256,
    imageInfo: checked.info,
    status: "ready_for_review",
    notes: args.notes || "",
    createdAt: now(),
    committedAt: "",
    rejectedAt: ""
  };
  version.invariantCheck = invariantCheck(root, id, version, args.contextId || "");
  if (version.invariantCheck.status === "drift_detected") version.status = "needs_retry";
  const versions = readVersions(root, id);
  versions.versions.push(version);
  writeVersions(root, id, versions);
  const state = loadState(root, id);
  state.versions = versions.versions;
  state.activeVersionId = versionId;
  state.artifactHashes = {
    ...(state.artifactHashes || {}),
    [versionId]: resultSha256,
    [`${versionId}:source`]: sourceSha256
  };
  const handoff = findHandoff(state, { contextId: version.contextId });
  if (handoff) {
    updateHandoffInState(state, normalizeHandoff({
      ...handoff,
      status: "registered",
      updatedAt: now(),
      events: [...(handoff.events || []), {
        eventId: uniqueId("handoffevt"),
        handoffId: handoff.handoffId,
        contextId: version.contextId,
        status: "registered",
        createdAt: now(),
        message: "Codex Image Gen artifact registered as local version.",
        data: { versionId, resultSha256 }
      }].slice(-100)
    }));
  } else {
    state.pendingGenerations = pendingFromHandoffs(state.handoffs || []);
  }
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const received = appendEvent(root, id, "artifact_received", { contextId: version.contextId, versionId, message: "Codex Image Gen artifact registered.", data: { resultSha256 } });
  const reviewEventType = version.invariantCheck.status === "drift_detected" ? "drift_detected" : "review_ready";
  const review = appendEvent(root, id, reviewEventType, { contextId: version.contextId, versionId, message: version.invariantCheck.reason || "Version ready for review.", data: version.invariantCheck });
  return result({ version: withPreview(version), versions: versionsForClient(versions.versions), events: [received, review] }, "Codex Image Gen result saved as a local version.");
}

function listVersions(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const versions = readVersions(root, id);
  return result({ sessionId: id, versions: versionsForClient(versions.versions) }, `${versions.versions.length} version(s) found.`);
}

function syncHandoffForGenerationEvent(root, id, args) {
  const statusByEvent = {
    waiting_for_codex_image_gen: "awaiting_artifact",
    artifact_received: "artifact_candidate_received",
    review_ready: "registered",
    drift_detected: "registered"
  };
  const status = statusByEvent[args.eventType];
  if (!status || (!args.contextId && !args.versionId)) return null;
  const state = loadState(root, id);
  const handoff = findHandoff(state, { contextId: args.contextId || "" });
  if (!handoff || terminalHandoffStatuses.includes(handoff.status)) return handoff || null;
  const handoffEvent = {
    eventId: uniqueId("handoffevt"),
    handoffId: handoff.handoffId,
    contextId: handoff.contextId,
    status,
    createdAt: now(),
    message: args.message || `Generation event: ${args.eventType}`,
    data: { eventType: args.eventType, versionId: args.versionId || "", ...(args.data || {}) }
  };
  const updated = normalizeHandoff({
    ...handoff,
    status,
    updatedAt: now(),
    events: [...(handoff.events || []), handoffEvent].slice(-100)
  });
  updateHandoffInState(state, updated);
  state.handoffEvents = [...(state.handoffEvents || []), handoffEvent].slice(-250);
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  return updated;
}

function recordGenerationEvent(args) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const event = appendEvent(root, id, args.eventType, {
    contextId: args.contextId || "",
    versionId: args.versionId || "",
    message: args.message || "",
    data: args.data || {}
  });
  const handoff = syncHandoffForGenerationEvent(root, id, args);
  return result({ event, handoff, state: normalizedStateForClient(root, id) }, "Generation event recorded.");
}

function pluginLogoDataUrl() {
  const logoPath = path.join(pluginRoot, "assets", "logo.png");
  if (!existsSync(logoPath)) return "";
  const data = readFileSync(logoPath);
  return `data:image/png;base64,${data.toString("base64")}`;
}

function updateVersionStatus(args, status) {
  const root = workspaceRoot(args);
  const id = sessionId(args);
  const versions = readVersions(root, id);
  const version = versions.versions.find((item) => item.versionId === args.versionId);
  if (!version) throw new Error(`Unknown version: ${args.versionId}`);
  if (status === "committed") {
    version.status = "committed";
    version.committedAt = now();
    if (args.exportPath) {
      const exportPath = assertInside(root, args.exportPath, "exportPath");
      ensureDir(path.dirname(exportPath));
      copyFileSync(version.resultPath, exportPath);
      version.exportPath = exportPath;
    }
  } else {
    version.status = "rejected";
    version.rejectedAt = now();
    version.rejectionReason = args.reason || "Rejected by reviewer.";
  }
  writeVersions(root, id, versions);
  const state = loadState(root, id);
  state.versions = versions.versions;
  state.activeVersionId = version.versionId;
  state.updatedAt = now();
  writeJsonAtomic(statePath(root, id), state);
  const event = appendEvent(root, id, status === "committed" ? "version_committed" : "version_rejected", { contextId: version.contextId || "", versionId: version.versionId, message: status === "committed" ? "Version committed." : version.rejectionReason, data: { status } });
  return result({ version: withPreview(version), versions: versionsForClient(versions.versions), event }, `Version ${version.versionId} ${status}.`);
}

function widgetHtml() {
  return readFileSync(path.join(pluginRoot, "mcp", "image-editor-widget.html"), "utf8")
    .replace("__PLUGIN_LOGO_DATA_URL__", pluginLogoDataUrl());
}

function result(data, text, meta = {}) {
  return {
    structuredContent: data,
    content: [{ type: "text", text }],
    ...(Object.keys(meta).length ? { _meta: meta } : {})
  };
}

function respond(id, value) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result: value })}\n`);
}

function fail(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}

async function handle(message) {
  const { id, method, params } = message;
  try {
    if (method === "initialize") {
      return respond(id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "codex-image-editor", version: manifest.version || "0.1.0" },
        instructions: "Conversation-native Codex Image Editor. This MCP server renders inline editor state and result versions in the Codex discussion; image generation must use Codex built-in Image Gen."
      });
    }
    if (method === "notifications/initialized") return;
    if (method === "tools/list") return respond(id, { tools });
    if (method === "resources/list") {
      return respond(id, {
        resources: [{ uri: widgetUri, name: "codex-image-editor", title: "Codex Image Editor", mimeType: "text/html;profile=mcp-app" }]
      });
    }
    if (method === "resources/read") {
      if (params?.uri !== widgetUri) throw new Error(`Unknown resource: ${params?.uri}`);
      return respond(id, { contents: [{ uri: widgetUri, mimeType: "text/html;profile=mcp-app", text: widgetHtml() }] });
    }
    if (method !== "tools/call") return fail(id, -32601, `Unknown method: ${method}`);
    const name = params?.name;
    const args = params?.arguments || {};
    if (name === "update_editor_state") return respond(id, updateEditorState(args));
    if (name === "add_reference_image") return respond(id, addReferenceImage(args));
    if (name === "remove_reference_image") return respond(id, removeReferenceImage(args));
    if (name === "ingest_conversation_inputs") return respond(id, ingestConversationInputs(args));
    if (name === "classify_image_roles") return respond(id, classifyImageRolesTool(args));
    if (name === "normalize_prompt_request") return respond(id, normalizePromptRequest(args));
    if (name === "translate_prompt_request") return respond(id, translatePromptRequest(args));
    if (name === "validate_imagegen_request") return respond(id, validateImagegenRequest(args));
    if (name === "create_imagegen_request_from_inputs") return respond(id, createImagegenRequestFromInputs(args));
    if (name === "validate_zone_precision") return respond(id, validateZonePrecision(args));
    if (name === "refine_zone") return respond(id, refineZone(args));
    if (name === "set_zone_geometry") return respond(id, setZoneGeometry(args));
    if (name === "create_precision_preview") return respond(id, createPrecisionPreview(args));
    if (name === "list_zone_presets") return respond(id, listZonePresets(args));
    if (name === "save_zone_preset") return respond(id, saveZonePreset(args));
    if (name === "apply_zone_preset") return respond(id, applyZonePreset(args));
    if (name === "delete_zone_preset") return respond(id, deleteZonePreset(args));
    if (name === "record_host_capabilities") return respond(id, recordHostCapabilities(args));
    if (name === "create_codex_handoff") return respond(id, createCodexHandoff(args));
    if (name === "record_handoff_event") return respond(id, recordHandoffEvent(args));
    if (name === "register_artifact_candidate") return respond(id, registerArtifactCandidate(args));
    if (name === "resolve_artifact_candidate") return respond(id, resolveArtifactCandidate(args));
    if (name === "list_pending_generations") return respond(id, listPendingGenerations(args));
    if (name === "create_generation_request") return respond(id, createGenerationRequest(args));
    if (name === "get_editor_state") return respond(id, getEditorState(args));
    if (name === "export_image_context") return respond(id, exportImageContext(args));
    if (name === "save_generated_result") return respond(id, saveGeneratedResult(args));
    if (name === "list_versions") return respond(id, listVersions(args));
    if (name === "record_generation_event") return respond(id, recordGenerationEvent(args));
    if (name === "compare_version") return respond(id, compareVersion(args));
    if (name === "create_retry_request") return respond(id, createRetryRequest(args));
    if (name === "commit_version") return respond(id, updateVersionStatus(args, "committed"));
    if (name === "reject_version") return respond(id, updateVersionStatus(args, "rejected"));
    return fail(id, -32602, `Unknown tool: ${name}`);
  } catch (error) {
    return fail(id, -32000, error?.stack || String(error));
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch (error) {
      fail(null, -32700, error?.message || String(error));
    }
  }
});

process.on("uncaughtException", (error) => {
  fail(null, -32000, error?.stack || String(error));
});
