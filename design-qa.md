# Design QA — Codex Image Editor MVP beta

## Visual source and evidence

- Source of truth: the user-selected DAWWWCORE mockup supplied in the task. It was used for visual comparison and is intentionally not committed.
- Implementation capture: `docs/media/codex-image-editor-mvp-beta.png`.
- Workflow demo: `docs/media/codex-image-editor-flow.gif`.
- Density normalization: the reference and implementation were compared at equal width without upscaling the implementation.
- Tested state: `daw-core-banner.png`, one selected correction zone named “Détails du sujet”, high priority, and the request “Améliorer les détails sans modifier le texte”.

## Fidelity review

- Typography: condensed industrial hierarchy, uppercase step labels, and readable command text match the selected direction.
- Spacing and composition: header, three-step rail, large blueprint canvas, floating toolbar, and command deck preserve the reference structure.
- Color and surfaces: near-black/navy workspace, copper hierarchy, cyan selection feedback, thin technical borders, and restrained glow are consistent.
- Imagery: the authentic DAWWWCORE unicorn artwork is sharp, uncropped, and visually dominant.
- Copy: generic subject language deliberately replaces logo-specific wording so the editor works with any image.

## Interaction review

- Zone creation works with the real canvas gesture and returns automatically to selection.
- Zone name, type, priority, and request persist after editing.
- Demande exposes the primary request first and keeps references/precision in optional disclosures.
- Lancer Image Gen sends exactly one `ui/message` handoff and transitions to Envoi.
- Envoi stays quiet until a real artifact is returned.
- Conversation Codex remains available as a disclosure instead of duplicating the main action.

## Comparison history

1. Initial comparison found missing automatic image hydration, a collapsed short-height canvas, literal icon escapes, and a zone-picker overlay. These were fixed.
2. The second comparison found tool ordering/selection ambiguity and an overly tall narrow layout. Fluent icon mapping, tool order, automatic selection, and responsive clamps were corrected.
3. Final comparison found no actionable P0, P1, or P2 visual issue. Accepted P3 differences are the authentic DAWWWCORE mark and a slightly more compact command deck.

## Privacy and quality gates

- Repository media excludes host chrome and absolute local paths.
- Generated media contains no embedded image metadata.
- Browser console errors and warnings: none in the final flow.
- Core states verified: Zone, Demande, Envoi, conversation disclosure, native handoff.

final result: passed
