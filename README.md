# IRIS-Transcript

Plugin Obsidian qui transforme une URL YouTube en note Markdown : **transcription → mindmap → résumé**.

- Transcription via les sous-titres YouTube (gratuit, sans clé API), avec fallback Revoldiv.
- Mindmap **interactive intégrée** (zoom, déplacement, nœuds repliables), rendue par le plugin lui-même — aucun plugin tiers requis.
- Résumé optionnel via un LLM (Fantasy Cloud).
- Métadonnées en frontmatter, indexables par Dataview.

> **État du projet** — Sprint 1, **Jours 1 à 4** terminés, plus la **mindmap interactive intégrée** (rendue par le plugin, sans plugin tiers). Reste le Jour 5 (finitions, README/GIF, jeu de tests sur 20 vidéos).

## Résumé et mindmap par LLM (recommandé, fonctionne avec des API gratuites)

Sans LLM, le plugin reste utile : la transcription est recomposée en **paragraphes lisibles** (réglable dans les paramètres : paragraphes / aucun / par ligne), et la mindmap est découpée par pauses. Mais une mindmap réellement **structurée par thèmes** — et la distinction « qui dit quoi » — nécessite une étape LLM : les sous-titres YouTube ne contiennent ni structure ni locuteur.

Le champ « URL API Fantasy Cloud » accepte **n'importe quel endpoint compatible OpenAI** (`/chat/completions`). On peut donc brancher un fournisseur **gratuit** au lieu de Fantasy Cloud :

| Fournisseur | URL de base à mettre dans les paramètres | Exemple de modèle |
|---|---|---|
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Google AI Studio | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| OpenRouter | `https://openrouter.ai/api/v1` | un modèle suffixé `:free` |

Crée une clé gratuite chez l'un d'eux (sans carte bancaire pour Groq / Google AI Studio / OpenRouter), colle-la dans « Clé API Fantasy Cloud », mets l'URL de base et le modèle correspondants. Les quotas gratuits suffisent largement pour transcrire des vidéos à l'unité.

## Notes techniques importantes

**CORS.** Les appels réseau passent par `requestUrl()` de l'API Obsidian, **pas** par `fetch()`. Dans le renderer Electron d'Obsidian (origine `app://obsidian.md`), un `fetch()` direct vers YouTube est bloqué par CORS. `requestUrl()` contourne cette restriction. Le shim correspondant est dans `src/http.ts` et s'injecte dans `youtube-transcript-plus` via ses hooks `videoFetch` / `playerFetch` / `transcriptFetch`.

**Fantasy Cloud.** Base URL réelle : `https://fantasyai.cloud/api/v1`, endpoint `/chat/completions` (format OpenAI, header `Authorization: Bearer`). Si aucun modèle n'est précisé dans les paramètres, `gpt-4o` est utilisé par défaut (l'API OpenAI exige un champ `model`).

**Mindmap interactive.** La mindmap est intégrée directement : `markmap-lib` + `markmap-view` sont bundlés, et un processeur de bloc de code rend les blocs ` ```iris-mindmap ` en SVG interactif (`src/markmap.ts`). Aucune dépendance à un plugin tiers. La langue de bloc dédiée (`iris-mindmap`) évite tout conflit si le plugin communautaire Markmap est aussi installé. Hauteur réglable dans les paramètres.

**Revoldiv — à vérifier.** La page d'API de Revoldiv est une SPA dont le contrat exact n'a pas pu être lu automatiquement. `src/revoldiv.ts` suit le contrat de la spec (`POST /api/v1/transcribe`, headers `x-api-key` + `x-primary-owner-id`, corps `{ url, language }`) et tolère plusieurs formes de réponse. Le chemin, les headers et la forme attendue sont isolés en haut du fichier — à confirmer contre le tableau de bord Revoldiv si le fallback échoue.

## Installation (manuelle, en attendant le marketplace)

1. Copier `manifest.json`, `main.js` et `styles.css` dans
   `<vault>/.obsidian/plugins/iris-transcript/`.
2. Dans Obsidian : *Paramètres → Plugins tiers → Recharger les plugins*, puis activer **IRIS-Transcript**.
3. La mindmap s'affiche automatiquement dans la note, en mode lecture comme en live preview (le plugin rend lui-même les blocs ` ```iris-mindmap `).

## Utilisation

1. `Ctrl/Cmd + P` → **IRIS : Transcrire une vidéo YouTube**.
2. Coller l'URL, valider (`Entrée` ou le bouton).
3. La note est créée dans le dossier de sortie et ouverte automatiquement.

## Paramètres (Paramètres → IRIS-Transcript)

| Paramètre | Défaut | Rôle |
|---|---|---|
| Langues de transcription | `fr, en` | Ordre de priorité des sous-titres |
| Dossier de sortie | `IRIS-Transcript` | Emplacement des notes |
| Clé API Revoldiv / Owner ID | vide | Fallback quand YouTube n'a pas de sous-titres |
| Clé / URL / Modèle Fantasy Cloud | vide / `https://api.fantasyai.cloud` | Résumé + mindmap LLM |
| Seuil pause chapitre / section | `10` / `5` (s) | Mindmap en mode dégradé (sans LLM) |

## Développement

```bash
npm install        # installe les dépendances
npm run dev        # build en watch (recompile à chaque modif)
npm run build      # type-check + build de production
npm run typecheck  # vérification de types seule
```

Le bundle `main.js` est généré par esbuild à partir de `src/main.ts`.

## Crédits

Ce plugin embarque des bibliothèques tierces, sous licence MIT (sauf mention) :

- [`youtube-transcript-plus`](https://github.com/ericmmartin/youtube-transcript-plus) — récupération des sous-titres YouTube.
- [`markmap-lib`](https://github.com/markmap/markmap) et [`markmap-view`](https://github.com/markmap/markmap) — transformation et rendu de la mindmap.
- [`d3`](https://github.com/d3/d3) (ISC) — moteur de visualisation utilisé par Markmap.

## Licence

MIT.
