# Image Genial Codex Picture Editor

**v0.2.1-beta — MVP beta**

> Préparer et réviser des demandes de retouche précises, directement dans une conversation Codex.

Image Genial Codex Picture Editor transforme une demande de retouche en une page unique : sélectionner ou peindre une zone si nécessaire, choisir un preset, décrire le changement, puis remettre la demande structurée à Codex. L’éditeur fonctionne avec tout type d’image et garde les fonctions secondaires dans un menu compact.

## Pourquoi ce projet

Une retouche d’image devient vite ambiguë : une région doit changer, une autre doit rester intacte, une référence doit être respectée et le résultat doit pouvoir être revu. Le plugin ajoute une étape d’édition structurée dans le fil Codex avant l’appel à Image Gen.

Le plugin est conversation-native : l’image, les contraintes, le handoff et la revue restent associés à la conversation. Il prépare le contexte pour Codex ; il ne remplace jamais le moteur Image Gen natif.

## Parcours principal

1. **Image** — travailler sur l’image entière ou sélectionner une zone avec le rectangle, le pinceau, le lasso, le polygone ou l’ellipse.
2. **Direction** — choisir si utile un preset de style, de fond ou d’effet, puis décrire librement la retouche.
3. **Envoi** — remettre la demande exacte à la conversation Codex par le handoff Image Gen natif.
4. **Revue** — enregistrer uniquement un artefact dont l’origine est `codex-image-gen`, puis l’accepter, le refuser ou préparer une relance plus étroite.

Le lien **Conversation Codex** reste disponible pour les compléments sans dupliquer l’action principale ni quitter la page.

## Capacités

- Canvas d’annotation avec sélection, pinceau, lasso, polygone, rectangle, ellipse, gomme, déplacement et zoom.
- Presets de styles, arrière-plans, détails, éclairage, nettoyage et étalonnage transmis dans la demande native.
- Calques de correction, protection, erreur et référence.
- Zones `include`, `exclude` et `protect` avec validation, marge de sécurité, feathering, grille et snap.
- Request Builder pour les consignes, rôles d’images, contraintes et export `$imagegen`.
- Handoff natif par MCP Apps `ui/message`.
- Artifact Bridge pour l’origine, les candidats, l’acceptation, le refus et les versions.
- Revue avant/après, diagnostic des zones protégées et préparation d’une relance.

## Frontière Image Gen native

- Aucun appel direct à une Images API.
- Aucune clé API, BYOK, CLI de secours, API d’image externe ou backend cloud.
- Aucun résultat de génération ou état de progression simulé en production.
- Le serveur MCP conserve l’état local, valide la demande, prépare le handoff et versionne les artefacts réels.
- La génération est exécutée uniquement par Codex via le chemin natif `image_gen` / `$imagegen`.

## Aperçu local

Prérequis : Git, Python et Node `>=22 <25`.

```powershell
npm run test
npm run harness:widget -- --port 4318 --image "C:\path\to\image.png" --request "Améliorer uniquement les détails sélectionnés"
```

Ouvrir `http://127.0.0.1:4318/`. Le harness vérifie l’expérience du widget et le contrat `ui/message` ; il ne simule pas un artefact Image Gen.

## Installation par le marketplace personnel

Lancer le préflight en lecture seule :

```powershell
npm run preflight:local-deploy
```

Une fois la révision publiée sur `origin/main`, déployer la révision commitée :

```powershell
.\scripts\deploy-local.ps1 -Apply -InstallPlugin
```

Le script synchronise le bundle, valide le plugin, ajoute un cachebuster local, met à jour atomiquement l’entrée du marketplace personnel et écrit un rapport dans `%USERPROFILE%\.agents\plugins\reports\`.

Voir [Déploiement local](docs/LOCAL_DEPLOYMENT.md) pour le gate desktop complet.

## Validation

```powershell
npm run privacy:check
npm run test
npm run check
npm run preflight:local-deploy
python <chemin-plugin-creator>\scripts\validate_plugin.py .
```

Au 27 juillet 2026, `npm run privacy:check`, `npm run test`, `npm run check` et le validateur officiel du manifeste sont passants. Les contrôles automatisés couvrent :

- les secrets et chemins personnels dans les textes comme dans les données binaires ;
- l’interdiction des API d’image directes et du réseau externe ;
- la syntaxe du widget, le contrat d’interaction et les ressources MCP Apps ;
- l’hydratation initiale, les zones, la persistance et le handoff natif ;
- l’origine des artefacts, la revue, le refus et la relance ;
- le manifeste et le préflight du déploiement local.

La passe browser locale confirme la page unique, l’ouverture et la fermeture du menu d’outils, l’application d’un preset et l’émission d’un seul message natif. Elle ne suffit pas à certifier l’enregistrement, puis l’acceptation d’un artefact réel par l’Artifact Bridge. Ce dernier passage reste le gate hôte avant toute revendication « production certifiée ».

Voir la [checklist de release](docs/PUBLIC_RELEASE.md), la [fiche marketplace](docs/MARKETPLACE.md) et la [revue design](design-qa.md).

## Confidentialité

Le paquet `0.2.1-beta` ne contient aucune capture ni vidéo de démonstration. Les seuls PNG livrés sont les ressources graphiques fonctionnelles du plugin. L’état runtime est conservé dans `.codex-image-editor/` dans le workspace sélectionné et reste ignoré par Git.

Ne publiez pas les images sources privées, prompts, artefacts générés ou états de workspace. Voir la [politique de sécurité](SECURITY.md).

## Structure

```text
.codex-plugin/plugin.json        manifeste et page marketplace
.mcp.json                        déclaration du serveur MCP
assets/                          marque et surfaces graphiques du plugin
mcp/server.mjs                   état, validation et handoff local
mcp/image-editor-widget.html     interface d’édition sur une page
scripts/                         contrats, confidentialité, smoke et déploiement
skills/image-editor/SKILL.md     workflow d’édition Codex native
```

## Licence

Le dépôt est public et source-available, mais n’est pas distribué sous une licence open source. Voir [LICENSE](LICENSE).
