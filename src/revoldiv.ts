import { requestUrl } from "obsidian";
import { IrisSettings } from "./settings";
import { TranscriptSegment } from "./note";

/**
 * ⚠️ NON VÉRIFIÉ — La page d'API de Revoldiv est une SPA rendue côté client ;
 * son contrat exact (chemin, noms de headers, forme de la réponse) n'a pas pu
 * être lu automatiquement. Cette implémentation suit le contrat décrit dans la
 * spec v2 (§3.2). Tout ce qui pourrait devoir être ajusté est regroupé ici :
 */
const REVOLDIV = {
  /** Chemin de l'endpoint de transcription, relatif au domaine revoldiv.com. */
  endpoint: "https://revoldiv.com/api/v1/transcribe",
  /** Champs du corps JSON envoyé. */
  buildBody: (youtubeUrl: string, language: string): string =>
    JSON.stringify({ url: youtubeUrl, language }),
};

export interface RevoldivOutcome {
  segments: TranscriptSegment[];
  /** Langue effective (best effort : on renvoie celle demandée). */
  language: string;
}

export class RevoldivError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevoldivError";
  }
}

/**
 * Transcrit une URL YouTube via l'API Revoldiv (fallback quand YouTube n'a pas
 * de sous-titres). Passe par requestUrl() (contournement CORS).
 */
export async function fetchRevoldivTranscript(
  youtubeUrl: string,
  settings: IrisSettings,
): Promise<RevoldivOutcome> {
  if (!settings.revoldivApiKey) {
    throw new RevoldivError("Clé API Revoldiv absente.");
  }
  const language = settings.languages[0] ?? "fr";

  const res = await requestUrl({
    url: REVOLDIV.endpoint,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.revoldivApiKey,
      "x-primary-owner-id": settings.revoldivOwnerId,
    },
    body: REVOLDIV.buildBody(youtubeUrl, language),
    throw: false,
  });

  if (res.status === 401) {
    throw new RevoldivError("Clé API Revoldiv invalide. Vérifie les paramètres.");
  }
  if (res.status === 429) {
    throw new RevoldivError("Limite de taux Revoldiv atteinte. Réessaie plus tard.");
  }
  if (res.status < 200 || res.status >= 300) {
    throw new RevoldivError(`Revoldiv a renvoyé une erreur (HTTP ${res.status}).`);
  }

  let json: unknown;
  try {
    json = res.json;
  } catch {
    throw new RevoldivError("Réponse Revoldiv illisible (JSON attendu).");
  }

  const segments = parseRevoldivSegments(json);
  if (segments.length === 0) {
    throw new RevoldivError(
      "Réponse Revoldiv reçue mais aucune transcription n'a pu être extraite. " +
        "Le format de réponse diffère peut-être de la spec.",
    );
  }
  return { segments, language };
}

/**
 * Extrait des segments depuis une réponse Revoldiv, en tolérant plusieurs
 * formes possibles (la forme exacte n'est pas documentée publiquement) :
 *  - { segments: [{ text, start|offset, duration }] }
 *  - { snippets: [...] }  (même forme)
 *  - { transcript: "texte" } ou { text: "texte" }  -> un seul segment
 */
function parseRevoldivSegments(json: unknown): TranscriptSegment[] {
  if (typeof json !== "object" || json === null) return [];
  const obj = json as Record<string, unknown>;

  const arr = (obj.segments ?? obj.snippets) as unknown;
  if (Array.isArray(arr)) {
    return arr
      .map((raw): TranscriptSegment | null => {
        if (typeof raw !== "object" || raw === null) return null;
        const r = raw as Record<string, unknown>;
        const text = typeof r.text === "string" ? r.text : "";
        if (!text) return null;
        const offset = toNumber(r.offset ?? r.start) ?? 0;
        const duration = toNumber(r.duration) ?? 0;
        return { text, offset, duration };
      })
      .filter((s): s is TranscriptSegment => s !== null);
  }

  const plain = obj.transcript ?? obj.text;
  if (typeof plain === "string" && plain.trim().length > 0) {
    return [{ text: plain.trim(), offset: 0, duration: 0 }];
  }
  return [];
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}
