# Fiche technique Marketplace

## Image Genial Codex Picture Editor

- **Version** : `0.2.0-beta`
- **Catégorie** : Productivity
- **Type** : plugin Codex local-first, conversation-native
- **Éditeur** : charli-dev420
- **Licence** : source-available, tous droits réservés
- **Dépôt** : [charli-dev420/image-genial-codex-picture-editor](https://github.com/charli-dev420/image-genial-codex-picture-editor)

## Texte prêt à publier

**Description courte** : Marquez des retouches d’image directement dans la conversation Codex.

**Mots-clés** : `codex`, `imagegen`, `image-editor`, `mcp`, `local-first`

**Description longue** : Image Genial Codex Picture Editor affiche un éditeur inline dans une discussion Codex. Il aide à définir les corrections, régions protégées, références et contraintes, puis remet une demande précise au flux Image Gen natif. Les candidats d’artefacts et les décisions de revue restent associés au workflow local. Le plugin ne requiert aucune clé API et n’appelle aucun service de génération tiers.

## Proposition de valeur

Préparer, cadrer et réviser des demandes de retouche d’image sans quitter une conversation Codex. Le plugin conserve le contexte d’édition et prépare un handoff exploitable par le flux Image Gen natif de Codex.

Il ne génère pas lui-même d’image, ne dépend d’aucune clé API et ne détourne pas la demande vers un service tiers.

## Capacités vérifiées dans le bundle

- Widget MCP intégré à la conversation Codex.
- Sélection, pinceau, lasso, polygone, rectangle, ellipse, gomme, déplacement et zoom.
- Calques de correction, protection, erreur et référence.
- Zones `include`, `exclude` et `protect` avec marge, feathering, grille, snap et validation.
- Request Builder pour les consignes, rôles d’images, contraintes et export `$imagegen`.
- Handoff natif par `ui/message`.
- Artifact Bridge avec contrôle d’origine, candidats, acceptation, refus et versions.
- Revue avant/après et préparation de relance.

## Architecture et confidentialité

| Élément | Implémentation |
| --- | --- |
| Serveur local | `node ./mcp/server.mjs` via `.mcp.json` |
| Interface | widget HTML MCP dans la conversation |
| Génération | Image Gen natif de Codex après handoff |
| Réseau et clés | aucune Images API directe, clé API, BYOK ou génération externe |
| État | contexte, handoffs, diagnostics et versions conservés localement par le flux MCP |
| Runtime | Node `>=22 <25` |

## Installation locale

Le chemin pris en charge passe par le marketplace personnel Codex : préflight, synchronisation du bundle, puis installation ou activation depuis l’application desktop.

```powershell
npm run preflight:local-deploy
.\scripts\deploy-local.ps1 -Apply -InstallPlugin
```

Si la CLI locale ne propose pas `codex plugin add`, l’activation finale reste une action du gestionnaire de plugins Codex desktop.

## État de validation au 26 juillet 2026

| Contrôle | Résultat |
| --- | --- |
| `npm run privacy:check` | passant : aucun secret ou chemin personnel détecté dans 37 fichiers |
| `npm run test` | passant : frontières de sécurité, widget, préflight de test et smoke MCP |
| `npm run check` | passant : syntaxe de `mcp/server.mjs` |
| Manifeste plugin | passant avec le validateur officiel du plugin |
| Médias publics | MP4 décodé intégralement ; PNG sans profil incorporé ; revue visuelle après recadrage |
| Parcours desktop enregistré | rendu inline, sélection, demande, envoi et suivi visibles |
| Artifact Bridge sur un artefact hôte réel | gate manuel restant avant certification production |

**Statut public** : `MVP beta, localement validé ; acceptation d’un artefact hôte réel à confirmer`.

## Preuves

[Démo vidéo publique de 27 secondes](media/codex-image-editor-demo-courte.mp4)

![Parcours public nettoyé](../assets/codex-image-editor-proof.png)

Les preuves publiques excluent le nom de compte, les projets, les chemins locaux et les terminaux visibles dans l’enregistrement source.
