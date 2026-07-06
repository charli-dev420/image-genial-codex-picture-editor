import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const html = readFileSync(path.join(root, "mcp", "image-editor-widget.html"), "utf8");

const required = [
  "data-tool=\"select\"",
  "data-tool=\"rectangle\"",
  "data-tool=\"ellipse\"",
  "data-tool=\"precision\"",
  "class=\"brand-logo\"",
  "__PLUGIN_LOGO_DATA_URL__",
  "id=\"zoneList\"",
  "id=\"referenceFile\"",
  "id=\"createRequest\"",
  "id=\"compareVersion\"",
  "id=\"retryVersion\"",
  "id=\"reviewSlider\"",
  "id=\"promptPanel\"",
  "id=\"promptOriginalTab\"",
  "id=\"promptNormalizedTab\"",
  "id=\"promptFinalTab\"",
  "id=\"imageRoleTable\"",
  "id=\"constraintsEditor\"",
  "id=\"finalImagegenRequest\"",
  "id=\"buildRequest\"",
  "id=\"useFinalRequest\"",
  "id=\"precisionPanel\"",
  "id=\"precisionModeToggle\"",
  "id=\"precisionX\"",
  "id=\"precisionY\"",
  "id=\"precisionW\"",
  "id=\"precisionH\"",
  "id=\"precisionSubtype\"",
  "id=\"edgeMode\"",
  "id=\"safetyMarginPx\"",
  "id=\"featherPx\"",
  "id=\"snapGrid\"",
  "id=\"setGeometry\"",
  "id=\"refineSubtract\"",
  "id=\"duplicateProtect\"",
  "id=\"presetKind\"",
  "id=\"presetSelect\"",
  "id=\"artifactBridgePanel\"",
  "id=\"hostCapabilities\"",
  "id=\"recordHostCapabilities\"",
  "id=\"createCodexHandoff\"",
  "id=\"recordNativeImageGenRequested\"",
  "id=\"pendingGenerations\"",
  "id=\"candidateId\"",
  "id=\"candidateContextId\"",
  "id=\"registerArtifactCandidate\"",
  "id=\"acceptArtifactCandidate\"",
  "id=\"rejectArtifactCandidate\"",
  "id=\"artifactCandidateList\"",
  "update_editor_state",
  "add_reference_image",
  "ingest_conversation_inputs",
  "classify_image_roles",
  "normalize_prompt_request",
  "translate_prompt_request",
  "validate_imagegen_request",
  "create_imagegen_request_from_inputs",
  "validate_zone_precision",
  "refine_zone",
  "set_zone_geometry",
  "create_precision_preview",
  "list_zone_presets",
  "save_zone_preset",
  "apply_zone_preset",
  "delete_zone_preset",
  "record_host_capabilities",
  "create_codex_handoff",
  "record_handoff_event",
  "register_artifact_candidate",
  "resolve_artifact_candidate",
  "list_pending_generations",
  "create_generation_request",
  "compare_version",
  "create_retry_request",
  "window.openai.callTool"
];

const banned = [
  "fetch(",
  "WebSocket",
  "XMLHttpRequest",
  "<iframe",
  "window.location",
  "document.location",
  "openai.images.generate",
  "openai.images.edit",
  "OPENAI_API_KEY",
  "api.openai.com/v1/images"
];

for (const token of required) {
  if (!html.includes(token)) {
    console.error(`Widget contract missing token: ${token}`);
    process.exitCode = 1;
  }
}

for (const token of banned) {
  if (html.includes(token)) {
    console.error(`Widget contract banned token found: ${token}`);
    process.exitCode = 1;
  }
}

if (!process.exitCode) console.log("Widget contract passed.");
