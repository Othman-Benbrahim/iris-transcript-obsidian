import { requestUrl } from "obsidian";
import { IrisSettings } from "./settings";
import { TranscriptSegment } from "./note";
import { excerpt, normalizeText } from "./util";

/** Modèle utilisé si l'utilisateur n'en a pas spécifié (l'API OpenAI exige un `model`). */
const DEFAULT_LLM_MODEL = "gpt-4o";

/** Au-delà, on tronque la transcription envoyée au LLM (~100K tokens ≈ 400K caractères). */
const MAX_LLM_CHARS = 400_000;

/** Délai max d'attente de la réponse LLM (spec §4.2). */
const LLM_TIMEOUT_MS = 30_000;

export interface LlmStructure {
  mindmap: string;
  summary: string;
}

export interface LlmCallResult {
  structure: LlmStructure | null;
  /** Renseigné si l'appel a échoué (pour une notice utilisateur). */
  error: string | null;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Mode dégradé : segmentation par pauses (sans LLM)
// ---------------------------------------------------------------------------

/**
 * Construit une mindmap Markdown à partir des pauses entre snippets (spec §3.3).
 * Les nœuds sont libellés par un extrait du **contenu** (pas par l'horodatage),
 * pour rester lisibles. Approximatif mais immédiat et gratuit — un vrai
 * découpage thématique nécessite le mode LLM.
 */
export function structureByPauses(
  segments: TranscriptSegment[],
  chapterPauseThreshold: number,
  sectionPauseThreshold: number,
): string {
  if (segments.length === 0) return "_Transcription vide._";

  const chapters: string[][] = [];
  let chapterSections: string[] = [];
  let sectionBuf: string[] = [];

  const flushSection = (): void => {
    if (sectionBuf.length > 0) {
      chapterSections.push(normalizeText(sectionBuf.join(" ")));
      sectionBuf = [];
    }
  };
  const flushChapter = (): void => {
    flushSection();
    if (chapterSections.length > 0) {
      chapters.push(chapterSections);
      chapterSections = [];
    }
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = segments[i - 1];
    if (prev) {
      const gap = seg.offset - (prev.offset + prev.duration);
      if (gap > chapterPauseThreshold) {
        flushChapter();
      } else if (gap > sectionPauseThreshold) {
        flushSection();
      }
    }
    sectionBuf.push(seg.text.trim());
  }
  flushChapter();

  const lines: string[] = [];
  chapters.forEach((sections, idx) => {
    const title = sections[0] ? excerpt(sections[0], 7) : `Partie ${idx + 1}`;
    lines.push(`### ${idx + 1}. ${title}`);
    for (const sec of sections) {
      lines.push(`- ${excerpt(sec, 12)}`);
    }
  });

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Mode LLM : Fantasy Cloud (endpoint OpenAI-compatible /chat/completions)
// ---------------------------------------------------------------------------

function buildPrompt(transcriptText: string): string {
  return `Tu reçois la transcription brute d'une vidéo YouTube (issue des sous-titres,
sans ponctuation fiable ni indication de locuteur).

OBJECTIF : produire une mindmap RICHE et HIÉRARCHISÉE qui donne envie de lire la
vidéo d'un coup d'œil, puis un résumé.

Règles pour la mindmap :
- Découpe par THÈMES et IDÉES, jamais par ordre chronologique.
- 4 à 7 branches principales (niveau ###), titres courts et parlants.
- Sous chaque branche, des sous-points en liste (-), et quand c'est pertinent,
  un 2e niveau de sous-points indentés (détail concret, exemple, chiffre, nom,
  définition). Vise 2 à 3 niveaux de profondeur.
- Libellés COURTS (3 à 8 mots) : une idée par nœud, pas de phrases entières.
- Capture les arguments, notions clés, exemples et conclusions — pas du remplissage.
- S'il s'agit d'un dialogue/interview, organise par sujet et indique l'intervenant
  quand c'est identifiable.

Réponds EXACTEMENT dans ce format, sans rien ajouter avant ou après :

## MINDMAP
### [Thème 1]
- [idée clé]
  - [détail / exemple]
  - [détail / exemple]
- [idée clé]
### [Thème 2]
- [idée clé]
  - [détail / exemple]

## RESUME
[résumé de 250 à 350 mots, en français, qui capture la thèse centrale et les arguments clés]

Transcription :
---
${transcriptText}
---`;
}

/**
 * Appelle Fantasy Cloud pour produire mindmap + résumé en un seul appel.
 * Ne lève jamais : retourne { structure: null, error } en cas d'échec, afin que
 * l'appelant retombe proprement sur le mode dégradé par pauses.
 */
export async function callLlm(
  transcriptText: string,
  settings: IrisSettings,
): Promise<LlmCallResult> {
  if (!settings.fantasyCloudApiKey) {
    return { structure: null, error: "Clé Fantasy Cloud absente.", truncated: false };
  }

  const truncated = transcriptText.length > MAX_LLM_CHARS;
  const text = truncated ? transcriptText.slice(0, MAX_LLM_CHARS) : transcriptText;

  const base = settings.fantasyCloudUrl.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const model = settings.fantasyCloudModel.trim() || DEFAULT_LLM_MODEL;

  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: buildPrompt(text) }],
    temperature: 0.3,
    stream: false,
  });

  try {
    const res = await withTimeout(
      requestUrl({
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.fantasyCloudApiKey}`,
        },
        body,
        throw: false,
      }),
      LLM_TIMEOUT_MS,
    );

    if (res.status === 401) {
      return { structure: null, error: "Clé Fantasy Cloud invalide.", truncated };
    }
    if (res.status < 200 || res.status >= 300) {
      return {
        structure: null,
        error: `Fantasy Cloud a renvoyé une erreur (HTTP ${res.status}).`,
        truncated,
      };
    }

    const content = extractContent(res.json);
    if (!content) {
      return { structure: null, error: "Réponse Fantasy Cloud vide.", truncated };
    }

    const structure = parseLlmSections(content);
    if (!structure) {
      return {
        structure: null,
        error: "Réponse Fantasy Cloud non conforme (sections MINDMAP/RESUME absentes).",
        truncated,
      };
    }
    return { structure, error: null, truncated };
  } catch (e) {
    if (e instanceof TimeoutError) {
      return { structure: null, error: "Délai Fantasy Cloud dépassé (30 s).", truncated };
    }
    return {
      structure: null,
      error: e instanceof Error ? e.message : "Échec de l'appel Fantasy Cloud.",
      truncated,
    };
  }
}

/** Extrait le texte de complétion d'une réponse au format OpenAI. */
function extractContent(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const obj = json as Record<string, unknown>;
  const choices = obj.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  const content = message?.content;
  return typeof content === "string" && content.trim().length > 0
    ? content.trim()
    : null;
}

/** Sépare la réponse LLM en sections `## MINDMAP` et `## RESUME`. */
export function parseLlmSections(content: string): LlmStructure | null {
  const mindmapMatch = content.match(/##\s*MINDMAP\s*\n([\s\S]*?)(?=\n##\s*RESUME\b|$)/i);
  const resumeMatch = content.match(/##\s*RESUME\s*\n([\s\S]*?)$/i);

  const mindmap = mindmapMatch?.[1]?.trim() ?? "";
  const summary = resumeMatch?.[1]?.trim() ?? "";

  if (!mindmap && !summary) return null;
  return {
    mindmap: mindmap || "_Mindmap non fournie par le modèle._",
    summary: summary || "_Résumé non fourni par le modèle._",
  };
}

// ---------------------------------------------------------------------------
// Petit utilitaire de timeout (requestUrl n'expose pas d'AbortSignal)
// ---------------------------------------------------------------------------

class TimeoutError extends Error {
  constructor() {
    super("timeout");
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    );
  });
}
