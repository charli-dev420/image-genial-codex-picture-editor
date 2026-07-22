import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const server = path.join(root, "mcp", "server.mjs");
const tmp = mkdtempSync(path.join(os.tmpdir(), "codex-image-editor-"));
const basePng = path.join(tmp, "target.png");
const driftPng = path.join(tmp, "target-drift.png");
const precisionPng = path.join(tmp, "precision-target.png");
const basePngBuffer = makePng(2, 2, [
  [255, 0, 0, 255], [255, 0, 0, 255],
  [255, 0, 0, 255], [255, 0, 0, 255]
]);
const driftPngBuffer = makePng(2, 2, [
  [0, 0, 255, 255], [255, 0, 0, 255],
  [255, 0, 0, 255], [255, 0, 0, 255]
]);
writeFileSync(basePng, basePngBuffer);
writeFileSync(driftPng, driftPngBuffer);
writeFileSync(precisionPng, makePng(20, 20, Array.from({ length: 400 }, () => [200, 200, 200, 255])));
const pngDataUrl = `data:image/png;base64,${basePngBuffer.toString("base64")}`;

const child = spawn(process.execPath, [server], { cwd: root, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
const responses = new Map();
let buffer = "";
let nextId = 1;

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id) responses.set(msg.id, msg);
  }
});

child.stderr.on("data", (chunk) => process.stderr.write(chunk));

function send(method, params = undefined) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return wait(id);
}

function notify(method, params = undefined) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

function wait(id) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (responses.has(id)) {
        clearInterval(timer);
        const msg = responses.get(id);
        responses.delete(id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (Date.now() - started > 5000) {
        clearInterval(timer);
        reject(new Error(`timeout waiting for response ${id}`));
      }
    }, 20);
  });
}

try {
  const init = await send("initialize", { clientInfo: { name: "smoke", version: "0.2.0" } });
  if (init.serverInfo?.name !== "codex-image-editor") throw new Error("wrong server name");
  notify("notifications/initialized");

  const listed = await send("tools/list");
  const toolNames = listed.tools.map((tool) => tool.name);
  for (const required of [
    "get_editor_state",
    "update_editor_state",
    "add_reference_image",
    "remove_reference_image",
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
    "export_image_context",
    "save_generated_result",
    "list_versions",
    "record_generation_event",
    "compare_version",
    "create_retry_request",
    "commit_version",
    "reject_version"
  ]) {
    if (!toolNames.includes(required)) throw new Error(`missing tool ${required}`);
  }

  const renderTool = listed.tools.find((tool) => tool.name === "get_editor_state");
  const widgetUri = renderTool?._meta?.ui?.resourceUri;
  if (!widgetUri || widgetUri !== renderTool?._meta?.["openai/outputTemplate"]) throw new Error("render tool resource metadata mismatch");
  if (!widgetUri.endsWith("/editor-v2.html")) throw new Error("widget resource URI is not versioned");
  if (!renderTool.inputSchema?.required?.includes("workspaceRoot")) throw new Error("render tool workspaceRoot must be required");
  if (!renderTool.inputSchema?.properties?.baseImagePath || !renderTool.inputSchema?.properties?.userRequest) {
    throw new Error("render tool must accept an initial image and request");
  }

  const resources = await send("resources/list");
  const widgetResource = resources.resources?.find((resource) => resource.uri === widgetUri);
  if (!widgetResource || widgetResource.mimeType !== "text/html;profile=mcp-app") throw new Error("widget resource missing from resources/list");
  const resourceRead = await send("resources/read", { uri: widgetUri });
  const widgetContent = resourceRead.contents?.[0];
  if (!widgetContent?.text?.includes('id="conversationForm"') || !widgetContent.text.includes("ui/initialize") || !widgetContent.text.includes("launchNativeImageGen")) {
    throw new Error("widget resource does not contain the conversation/native Image Gen bridge");
  }
  if (!widgetContent?._meta?.["openai/widgetDescription"] || !Array.isArray(widgetContent?._meta?.ui?.csp?.connectDomains) || widgetContent._meta.ui.csp.connectDomains.length) {
    throw new Error("widget resource metadata or network CSP is invalid");
  }

  const state = await send("tools/call", {
    name: "get_editor_state",
    arguments: { workspaceRoot: tmp, sessionId: "smoke", baseImagePath: basePng, userRequest: "Improve the selected subject details." }
  });
  if (!state.structuredContent?.state) throw new Error("missing state");
  if (state.structuredContent.state.baseImagePath !== basePng || !state.structuredContent.state.baseImageDataUrl?.startsWith("data:image/png;base64,")) {
    throw new Error("initial image was not loaded into the editor state");
  }
  if (state.structuredContent.state.userRequest !== "Improve the selected subject details.") throw new Error("initial request was not loaded");
  if (state?._meta?.ui?.resourceUri !== widgetUri || state?._meta?.["openai/outputTemplate"] !== widgetUri) throw new Error("render result resource metadata mismatch");

  const editorState = {
    selectedShapeId: "freeze-box",
    layerSettings: {
      correct: { visible: true, locked: false, opacity: 1 },
      freeze: { visible: true, locked: false, opacity: 1 },
      error: { visible: true, locked: false, opacity: 1 },
      reference: { visible: true, locked: false, opacity: 1 }
    },
    layers: {
      correct: [{ id: "correct-box", kind: "rectangle", label: "brighten", note: "make this brighter", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], bounds: { x: 1, y: 1, width: 1, height: 1 }, priority: "medium", constraintType: "correct", visible: true }],
      freeze: [{ id: "freeze-box", kind: "rectangle", label: "locked pixel", note: "preserve this pixel", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], bounds: { x: 0, y: 0, width: 1, height: 1 }, priority: "high", constraintType: "freeze", visible: true }],
      error: [],
      reference: []
    }
  };

  const updated = await send("tools/call", {
    name: "update_editor_state",
    arguments: { workspaceRoot: tmp, sessionId: "smoke", baseImagePath: basePng, userRequest: "Change the marked region only.", editorState }
  });
  if (updated.structuredContent?.event?.eventType !== "state_saved") throw new Error("state_saved event missing");

  const precisionState = {
    selectedShapeId: "precision-box",
    layerSettings: editorState.layerSettings,
    layers: {
      correct: [
        { id: "precision-box", kind: "rectangle", label: "artifact", note: "remove small artifact", points: [{ x: 2, y: 2 }, { x: 10, y: 10 }], bounds: { x: 2, y: 2, width: 8, height: 8 }, priority: "medium", constraintType: "correct", visible: true }
      ],
      freeze: [{ id: "precision-freeze", kind: "rectangle", label: "protected corner", note: "do not change", points: [{ x: 15, y: 15 }, { x: 18, y: 18 }], bounds: { x: 15, y: 15, width: 3, height: 3 }, priority: "high", constraintType: "freeze", visible: true }],
      error: [],
      reference: [{ id: "subtract-box", kind: "rectangle", label: "covered element", note: "exclude this element", points: [{ x: 4, y: 4 }, { x: 6, y: 6 }], bounds: { x: 4, y: 4, width: 2, height: 2 }, priority: "medium", constraintType: "reference", visible: true }]
    }
  };
  const precisionUpdated = await send("tools/call", {
    name: "update_editor_state",
    arguments: { workspaceRoot: tmp, sessionId: "precision", baseImagePath: precisionPng, userRequest: "Remove the artifact only.", editorState: precisionState }
  });
  const converted = precisionUpdated.structuredContent?.state?.layers?.correct?.[0];
  if (converted?.geometryVersion !== 2 || !converted.include) throw new Error("legacy zone was not converted to composed geometry");

  const precisionValid = await send("tools/call", { name: "validate_zone_precision", arguments: { workspaceRoot: tmp, sessionId: "precision", shapeId: "precision-box" } });
  if (precisionValid.structuredContent?.reports?.[0]?.status === "blocked") throw new Error("valid precision zone was blocked");

  const dilated = await send("tools/call", { name: "refine_zone", arguments: { workspaceRoot: tmp, sessionId: "precision", shapeId: "precision-box", operation: "dilate", amountPx: 1 } });
  if (dilated.structuredContent?.shape?.include?.bounds?.width !== 10) throw new Error("dilate did not expand include bounds");

  const subtracted = await send("tools/call", { name: "refine_zone", arguments: { workspaceRoot: tmp, sessionId: "precision", shapeId: "precision-box", operation: "subtract", sourceShapeId: "subtract-box" } });
  if (!subtracted.structuredContent?.shape?.exclude?.length) throw new Error("subtract did not create exclude sub-zone");

  const protectedCopy = await send("tools/call", { name: "refine_zone", arguments: { workspaceRoot: tmp, sessionId: "precision", shapeId: "precision-box", operation: "duplicate_as_protect" } });
  if (!protectedCopy.structuredContent?.shape?.protect?.length) throw new Error("protect copy did not create protect sub-zone");

  const setGeometry = await send("tools/call", {
    name: "set_zone_geometry",
    arguments: { workspaceRoot: tmp, sessionId: "precision", shapeId: "precision-box", subtype: "include", bounds: { x: 3, y: 3, width: 6, height: 6 }, edgeMode: "hard", safetyMarginPx: 2, featherPx: 1 }
  });
  if (setGeometry.structuredContent?.shape?.edgeMode !== "hard" || setGeometry.structuredContent.shape.safetyMarginPx !== 2) throw new Error("set_zone_geometry did not persist precision settings");

  const preview = await send("tools/call", { name: "create_precision_preview", arguments: { workspaceRoot: tmp, sessionId: "precision", shapeId: "precision-box" } });
  if (!preview.structuredContent?.preview?.svgSha256 || !existsSync(preview.structuredContent.preview.svgPath)) throw new Error("precision preview missing");

  const presets = await send("tools/call", { name: "list_zone_presets", arguments: { workspaceRoot: tmp, sessionId: "precision", kind: "zone" } });
  if (!presets.structuredContent?.presets?.some((preset) => preset.presetId === "object_removal_precise")) throw new Error("built-in zone presets missing");

  const savedPreset = await send("tools/call", { name: "save_zone_preset", arguments: { workspaceRoot: tmp, sessionId: "precision", kind: "zone", label: "local precise edge", values: { edgeMode: "hard", safetyMarginPx: 3, featherPx: 0 } } });
  const localPresetId = savedPreset.structuredContent?.preset?.presetId;
  if (!localPresetId || !savedPreset.structuredContent.preset.sha256) throw new Error("local preset save failed");

  const appliedPreset = await send("tools/call", { name: "apply_zone_preset", arguments: { workspaceRoot: tmp, sessionId: "precision", kind: "zone", presetId: "object_removal_precise", shapeId: "precision-box" } });
  if (appliedPreset.structuredContent?.state?.layers?.correct?.[0]?.presetId !== "object_removal_precise") throw new Error("preset was not applied to zone");

  const deletedPreset = await send("tools/call", { name: "delete_zone_preset", arguments: { workspaceRoot: tmp, sessionId: "precision", kind: "zone", presetId: localPresetId } });
  if (deletedPreset.structuredContent?.presets?.some((preset) => preset.presetId === localPresetId)) throw new Error("local preset was not deleted");

  const blockedPrecision = await send("tools/call", {
    name: "set_zone_geometry",
    arguments: { workspaceRoot: tmp, sessionId: "precision", shapeId: "precision-box", subtype: "include", bounds: { x: 14, y: 14, width: 5, height: 5 } }
  });
  if (!blockedPrecision.structuredContent?.shape?.warnings) throw new Error("precision shape response missing warnings");
  const blockedReport = await send("tools/call", { name: "validate_zone_precision", arguments: { workspaceRoot: tmp, sessionId: "precision", shapeId: "precision-box" } });
  if (!blockedReport.structuredContent?.reports?.[0]?.blockingErrors?.some((item) => item.includes("frozen"))) throw new Error("freeze/protect overlap should block precision export");
  await send("tools/call", {
    name: "set_zone_geometry",
    arguments: { workspaceRoot: tmp, sessionId: "precision", shapeId: "precision-box", subtype: "include", bounds: { x: 3, y: 3, width: 6, height: 6 } }
  });

  const precisionExport = await send("tools/call", {
    name: "create_generation_request",
    arguments: { workspaceRoot: tmp, sessionId: "precision", baseImagePath: precisionPng, userRequest: "Remove the artifact and preserve protected areas." }
  });
  const precisionPrompt = precisionExport.structuredContent?.prompt || "";
  if (!precisionPrompt.includes("include:") || !precisionPrompt.includes("exclude:") || !precisionPrompt.includes("protect:")) throw new Error("precision prompt missing include/exclude/protect");
  if (!precisionExport.structuredContent?.packet?.precisionPreviewSha256) throw new Error("precision packet missing preview hash");

  const refA = await send("tools/call", { name: "add_reference_image", arguments: { workspaceRoot: tmp, sessionId: "smoke", imageDataUrl: pngDataUrl, fileName: "ref-a.png", note: "style reference", weight: "high" } });
  const refB = await send("tools/call", { name: "add_reference_image", arguments: { workspaceRoot: tmp, sessionId: "smoke", imageDataUrl: pngDataUrl, fileName: "ref-b.png", note: "composition reference", weight: "low" } });
  const refId = refA.structuredContent?.reference?.referenceId;
  if (!refId || !refB.structuredContent?.reference?.sha256) throw new Error("reference import failed");
  const removed = await send("tools/call", { name: "remove_reference_image", arguments: { workspaceRoot: tmp, sessionId: "smoke", referenceId: refId } });
  if (!removed.structuredContent?.event || removed.structuredContent.reference.removed !== true) throw new Error("reference removal failed");

  const ingested = await send("tools/call", {
    name: "ingest_conversation_inputs",
    arguments: {
      workspaceRoot: tmp,
      sessionId: "smoke",
      userText: 'Corrige uniquement la zone marquee, conserve le texte "Bonjour" et evite tout watermark.',
      images: [
        { imageDataUrl: pngDataUrl, fileName: "target-input.png", role: "edit_target", caption: "image cible", visibleInConversation: false },
        { imageDataUrl: pngDataUrl, fileName: "style-ref.png", role: "reference", caption: "reference couleur", visibleInConversation: false }
      ],
      notes: "smoke request builder",
      editorState
    }
  });
  const inputPackageId = ingested.structuredContent?.inputPackage?.inputPackageId;
  const ingestedImages = ingested.structuredContent?.inputPackage?.images || [];
  if (!inputPackageId || ingestedImages.length !== 2) throw new Error("conversation input ingestion failed");
  if (!ingestedImages.every((image) => image.sha256)) throw new Error("ingested images missing hashes");

  const classified = await send("tools/call", {
    name: "classify_image_roles",
    arguments: {
      workspaceRoot: tmp,
      sessionId: "smoke",
      inputPackageId,
      imageRoles: [
        { imageId: ingestedImages[0].imageId, role: "edit_target", visibleInConversation: false },
        { imageId: ingestedImages[1].imageId, role: "reference", visibleInConversation: false }
      ]
    }
  });
  const roles = classified.structuredContent?.roles || [];
  if (roles[0]?.role !== "edit_target" || roles[1]?.role !== "reference") throw new Error("image role classification failed");

  const normalized = await send("tools/call", {
    name: "normalize_prompt_request",
    arguments: {
      workspaceRoot: tmp,
      sessionId: "smoke",
      inputPackageId,
      constraintsOverride: {
        must_keep: ["preserve the locked pixel"],
        must_change: ["brighten only the marked correction box"],
        must_avoid: ["watermark"]
      }
    }
  });
  const draft = normalized.structuredContent?.draft;
  if (draft?.intent !== "edit") throw new Error("expected edit intent");
  if (draft.detectedLanguage !== "fr") throw new Error("expected French language detection");
  if (!draft.constraints?.text_verbatim?.includes("Bonjour")) throw new Error("verbatim text was not extracted");
  if (!draft.constraints?.must_keep?.length || !draft.constraints?.must_change?.length || !draft.constraints?.must_avoid?.length) throw new Error("constraints were not extracted");

  const translated = await send("tools/call", {
    name: "translate_prompt_request",
    arguments: {
      workspaceRoot: tmp,
      sessionId: "smoke",
      inputPackageId,
      draftId: draft.draftId,
      targetLanguage: "en",
      workingTranslation: 'Fix only the marked area, preserve the exact in-image text "Bonjour", and avoid any watermark.'
    }
  });
  if (!translated.structuredContent?.translation?.textVerbatim?.includes("Bonjour")) throw new Error("translation did not preserve verbatim metadata");
  if (translated.structuredContent.translation.translationApiUsed !== false) throw new Error("translation should be conversation-provided only");

  const valid = await send("tools/call", { name: "validate_imagegen_request", arguments: { workspaceRoot: tmp, sessionId: "smoke", inputPackageId, draftId: draft.draftId } });
  if (valid.structuredContent?.executable !== true) throw new Error("valid request should be executable");
  if (!valid.structuredContent.report.warnings.some((warning) => warning.includes("view_image"))) throw new Error("local image warning should require view_image");

  const fromInputs = await send("tools/call", {
    name: "create_imagegen_request_from_inputs",
    arguments: { workspaceRoot: tmp, sessionId: "smoke", inputPackageId, draftId: draft.draftId, editorState }
  });
  const finalPrompt = fromInputs.structuredContent?.prompt || "";
  if (!finalPrompt.includes("view_image")) throw new Error("final request missing view_image instruction");
  if (!finalPrompt.includes("role=edit_target") || !finalPrompt.includes("role=reference")) throw new Error("final request missing image roles");
  if (!finalPrompt.includes("must_keep") || !finalPrompt.includes("must_change") || !finalPrompt.includes("must_avoid")) throw new Error("final request missing constraints");
  if (fromInputs.structuredContent?.packet?.inputPackageId !== inputPackageId) throw new Error("final packet missing input package linkage");

  const blockedIngest = await send("tools/call", {
    name: "ingest_conversation_inputs",
    arguments: { workspaceRoot: tmp, sessionId: "blocked", userText: "Corrige la couleur de cette image.", images: [] }
  });
  const blockedNormalized = await send("tools/call", {
    name: "normalize_prompt_request",
    arguments: { workspaceRoot: tmp, sessionId: "blocked", inputPackageId: blockedIngest.structuredContent.inputPackage.inputPackageId }
  });
  const blockedValidation = await send("tools/call", {
    name: "validate_imagegen_request",
    arguments: { workspaceRoot: tmp, sessionId: "blocked", inputPackageId: blockedIngest.structuredContent.inputPackage.inputPackageId, draftId: blockedNormalized.structuredContent.draft.draftId }
  });
  if (blockedValidation.structuredContent?.executable !== false) throw new Error("edit without target should be blocked");
  let blockedExport = false;
  try {
    await send("tools/call", {
      name: "create_imagegen_request_from_inputs",
      arguments: { workspaceRoot: tmp, sessionId: "blocked", inputPackageId: blockedIngest.structuredContent.inputPackage.inputPackageId, draftId: blockedNormalized.structuredContent.draft.draftId }
    });
  } catch {
    blockedExport = true;
  }
  if (!blockedExport) throw new Error("blocked edit without target was exported");

  const generated = await send("tools/call", {
    name: "create_generation_request",
    arguments: {
      workspaceRoot: tmp,
      sessionId: "smoke",
      baseImagePath: basePng,
      userRequest: "Change only the correction box; preserve frozen areas.",
      editorState
    }
  });
  if (!generated.structuredContent?.prompt?.includes("$imagegen")) throw new Error("prompt missing $imagegen");
  if (!generated.structuredContent.packet.references?.length) throw new Error("active references missing from packet");
  if (!generated.structuredContent.packet.overlaySha256) throw new Error("overlay hash missing");
  const handoff = generated.structuredContent?.handoff;
  if (!handoff?.handoffId || handoff.contextId !== generated.structuredContent.packet.contextId) throw new Error("generation request missing handoff");
  if (!handoff.imageGenPrompt.includes("$imagegen") || !handoff.viewImageInstructions?.length) throw new Error("handoff missing prompt or view_image instructions");

  const hostBlocked = await send("tools/call", {
    name: "record_host_capabilities",
    arguments: {
      workspaceRoot: tmp,
      sessionId: "smoke",
      capabilities: { inlineMcpWidget: true, callToolBridge: true, canCallNativeImageGen: true, artifactBridge: false, workspaceArtifactSave: false }
    }
  });
  if (!hostBlocked.structuredContent?.hostBlockers?.length) throw new Error("missing host blocker when artifact bridge and workspace save are unavailable");

  const hostReady = await send("tools/call", {
    name: "record_host_capabilities",
    arguments: {
      workspaceRoot: tmp,
      sessionId: "smoke",
      capabilities: { inlineMcpWidget: true, callToolBridge: true, visibleConversationImages: true, artifactBridge: true, workspaceArtifactSave: true, canAttachLocalImages: true, canCallNativeImageGen: true }
    }
  });
  if (hostReady.structuredContent?.hostBlockers?.length) throw new Error("host blockers should clear when capabilities are available");

  const handoffEvent = await send("tools/call", {
    name: "record_handoff_event",
    arguments: { workspaceRoot: tmp, sessionId: "smoke", handoffId: handoff.handoffId, status: "codex_imagegen_requested", message: "Native Image Gen requested in smoke." }
  });
  if (handoffEvent.structuredContent?.handoff?.status !== "codex_imagegen_requested") throw new Error("handoff status was not updated");

  const pending = await send("tools/call", { name: "list_pending_generations", arguments: { workspaceRoot: tmp, sessionId: "smoke" } });
  if (!pending.structuredContent?.pendingGenerations?.some((item) => item.contextId === generated.structuredContent.packet.contextId)) throw new Error("pending generation missing exported context");

  const compat = await send("tools/call", {
    name: "export_image_context",
    arguments: { workspaceRoot: tmp, sessionId: "compat-smoke", userRequest: "Use imported image as target.", editorState: { imageName: "imported.png", previewImageDataUrl: pngDataUrl, layers: { correct: [], freeze: [], error: [], reference: [] } } }
  });
  const importedPath = compat.structuredContent?.packet?.baseImagePath;
  if (!importedPath || !existsSync(importedPath)) throw new Error("compat imported image was not persisted");

  const waitEvent = await send("tools/call", { name: "record_generation_event", arguments: { workspaceRoot: tmp, sessionId: "smoke", eventType: "waiting_for_codex_image_gen", contextId: generated.structuredContent.packet.contextId, message: "Waiting for built-in Image Gen." } });
  if (waitEvent.structuredContent?.event?.eventType !== "waiting_for_codex_image_gen") throw new Error("waiting event missing");

  let rejectedOrigin = false;
  try {
    await send("tools/call", { name: "save_generated_result", arguments: { workspaceRoot: tmp, sessionId: "smoke", artifactPath: basePng, origin: "external", contextId: generated.structuredContent.packet.contextId } });
  } catch {
    rejectedOrigin = true;
  }
  if (!rejectedOrigin) throw new Error("non-Codex artifact origin was accepted");

  const externalCandidate = await send("tools/call", {
    name: "register_artifact_candidate",
    arguments: { workspaceRoot: tmp, sessionId: "smoke", contextId: generated.structuredContent.packet.contextId, artifactPath: basePng, origin: "external", codexTurnId: "turn-external" }
  });
  const externalCandidateId = externalCandidate.structuredContent?.candidate?.candidateId;
  if (!externalCandidateId) throw new Error("external artifact candidate missing id");
  let rejectedCandidateOrigin = false;
  try {
    await send("tools/call", { name: "resolve_artifact_candidate", arguments: { workspaceRoot: tmp, sessionId: "smoke", candidateId: externalCandidateId, decision: "accept", reason: "Should fail." } });
  } catch {
    rejectedCandidateOrigin = true;
  }
  if (!rejectedCandidateOrigin) throw new Error("external artifact candidate was accepted");
  const rejectedCandidate = await send("tools/call", { name: "resolve_artifact_candidate", arguments: { workspaceRoot: tmp, sessionId: "smoke", candidateId: externalCandidateId, decision: "reject", reason: "Origin is not Codex Image Gen." } });
  if (rejectedCandidate.structuredContent?.candidate?.status !== "rejected") throw new Error("external artifact candidate was not rejected");

  const codexCandidate = await send("tools/call", {
    name: "register_artifact_candidate",
    arguments: { workspaceRoot: tmp, sessionId: "smoke", contextId: generated.structuredContent.packet.contextId, artifactPath: basePng, origin: "codex-image-gen", codexTurnId: "turn-codex" }
  });
  const codexCandidateId = codexCandidate.structuredContent?.candidate?.candidateId;
  if (!codexCandidateId || codexCandidate.structuredContent.candidate.status !== "pending") throw new Error("Codex artifact candidate not registered");
  const acceptedCandidate = await send("tools/call", { name: "resolve_artifact_candidate", arguments: { workspaceRoot: tmp, sessionId: "smoke", candidateId: codexCandidateId, decision: "accept", reason: "Accept smoke artifact." } });
  if (acceptedCandidate.structuredContent?.candidate?.status !== "registered" || !acceptedCandidate.structuredContent?.version?.versionId) throw new Error("Codex artifact candidate was not accepted as a version");

  const savedClean = await send("tools/call", { name: "save_generated_result", arguments: { workspaceRoot: tmp, sessionId: "smoke", artifactPath: basePng, origin: "codex-image-gen", contextId: generated.structuredContent.packet.contextId } });
  const cleanVersionId = savedClean.structuredContent?.version?.versionId;
  if (!cleanVersionId) throw new Error("missing clean version");
  if (savedClean.structuredContent.version.invariantCheck?.status !== "passed") throw new Error("expected frozen PNG invariant check to pass");

  const savedDrift = await send("tools/call", { name: "save_generated_result", arguments: { workspaceRoot: tmp, sessionId: "smoke", artifactPath: driftPng, origin: "codex-image-gen", contextId: generated.structuredContent.packet.contextId } });
  const driftVersionId = savedDrift.structuredContent?.version?.versionId;
  if (!driftVersionId) throw new Error("missing drift version");
  if (savedDrift.structuredContent.version.invariantCheck?.status !== "drift_detected") throw new Error("expected frozen PNG drift detection");
  if (savedDrift.structuredContent.version.status !== "needs_retry") throw new Error("drift version should need retry");

  const compared = await send("tools/call", { name: "compare_version", arguments: { workspaceRoot: tmp, sessionId: "smoke", versionId: driftVersionId } });
  if (compared.structuredContent?.report?.invariantCheck?.status !== "drift_detected") throw new Error("compare_version did not report drift");

  const retry = await send("tools/call", { name: "create_retry_request", arguments: { workspaceRoot: tmp, sessionId: "smoke", versionId: driftVersionId, reason: "Frozen pixel changed." } });
  if (!retry.structuredContent?.prompt?.includes("Retry reason")) throw new Error("retry prompt missing reason");

  const listedVersions = await send("tools/call", { name: "list_versions", arguments: { workspaceRoot: tmp, sessionId: "smoke" } });
  if (!listedVersions.structuredContent?.versions?.[0]?.previewDataUrl) throw new Error("list_versions missing preview data URL");

  const committed = await send("tools/call", { name: "commit_version", arguments: { workspaceRoot: tmp, sessionId: "smoke", versionId: cleanVersionId } });
  if (committed.structuredContent?.version?.status !== "committed") throw new Error("version not committed");

  const rejected = await send("tools/call", { name: "reject_version", arguments: { workspaceRoot: tmp, sessionId: "smoke", versionId: driftVersionId, reason: "Drift confirmed." } });
  if (rejected.structuredContent?.version?.status !== "rejected") throw new Error("version not rejected");

  console.log("MCP smoke passed.");
} finally {
  child.kill();
}

function makePng(width, height, rgbaPixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let rawOffset = 0;
  let pixelOffset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[rawOffset++] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = rgbaPixels[pixelOffset++] || [0, 0, 0, 255];
      raw[rawOffset++] = pixel[0];
      raw[rawOffset++] = pixel[1];
      raw[rawOffset++] = pixel[2];
      raw[rawOffset++] = pixel[3];
    }
  }
  const chunks = [
    makeChunk("IHDR", Buffer.from([
      (width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255,
      (height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255,
      8, 6, 0, 0, 0
    ])),
    makeChunk("IDAT", deflateSync(raw)),
    makeChunk("IEND", Buffer.alloc(0))
  ];
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), ...chunks]);
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
