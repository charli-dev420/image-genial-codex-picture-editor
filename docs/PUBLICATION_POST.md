# Publication — Image Genial Codex Picture Editor

Je présente **Image Genial Codex Picture Editor**, un plugin Codex conçu pour préparer une retouche d’image précise sans quitter la conversation.

Le parcours tient en quatre temps : sélectionner l’image, baliser la région, formaliser la demande, puis laisser Codex poursuivre avec son flux Image Gen natif. Le plugin ne remplace pas Image Gen et n’appelle aucun backend d’image externe : il organise le contexte, les contraintes et la revue.

Ce que le plugin apporte :

- un éditeur intégré à la conversation ;
- des zones de correction, d’exclusion et de protection ;
- des calques de correction, protection, erreur et référence ;
- une demande Image Gen structurée ;
- le suivi des handoffs, candidats, versions et décisions de revue.

[Voir la release v0.2.0-beta](https://github.com/charli-dev420/image-genial-codex-picture-editor/releases/tag/v0.2.0-beta) et [la démo courte](media/codex-image-editor-demo-courte.mp4).

Le bundle est validé localement par les contrôles de confidentialité, de frontière réseau, du widget, du MCP et du manifeste. La certification production reste conditionnée à l’enregistrement puis l’acceptation d’un vrai artefact retourné par l’hôte Codex dans l’Artifact Bridge.

![Parcours du plugin dans Codex](../assets/codex-image-editor-proof.png)

Le projet est publié en source-available, tous droits réservés. Son activation doit rester dans le flux natif Codex/Image Gen, sans clé API ni service de génération tiers.

#Codex #ImageGen #MCP #AI #ImageEditing #DeveloperTools
