import { formatTimestamp, normalizeText, today } from "./util";

/** Granularité des horodatages dans la transcription rendue. */
export type TimestampMode = "none" | "paragraph" | "line";

export interface TranscriptSegment {
  text: string;
  /** Début du segment en secondes depuis le début de la vidéo. */
  offset: number;
  /** Durée du segment en secondes. */
  duration: number;
}

export interface NoteData {
  videoId: string;
  videoUrl: string;
  title: string;
  durationSeconds: number | null;
  language: string;
  segments: TranscriptSegment[];
  /** Contenu Markdown de la mindmap (les titres ### et listes), sans l'en-tête de section. */
  mindmap: string;
  /** Texte du résumé, ou null si non généré. */
  summary: string | null;
  llmMindmap: boolean;
  llmSummary: boolean;
  transcriptTimestamps: TimestampMode;
}

interface Paragraph {
  startOffset: number;
  text: string;
}

/**
 * Recompose les bribes de sous-titres en paragraphes lisibles. Les sous-titres
 * YouTube arrivent en fragments de ~2 s ; affichés tels quels, on obtient un mur
 * de lignes horodatées illisible. On les regroupe en paragraphes (fin de phrase,
 * pause longue, ou taille max) — c'est le même contenu, simplement remis en forme.
 */
function buildParagraphs(segments: TranscriptSegment[]): Paragraph[] {
  const paras: Paragraph[] = [];
  if (segments.length === 0) return paras;

  let buf: string[] = [];
  let startOffset = segments[0].offset;
  let words = 0;

  const flush = (): void => {
    if (buf.length === 0) return;
    paras.push({ startOffset, text: normalizeText(buf.join(" ")) });
    buf = [];
    words = 0;
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = segments[i - 1];
    const gap = prev ? seg.offset - (prev.offset + prev.duration) : 0;
    const last = buf[buf.length - 1] ?? "";
    const endsSentence = /[.!?…][")»]?$/.test(last.trim());

    if (buf.length > 0 && (gap > 3 || (words >= 55 && endsSentence) || words >= 110)) {
      flush();
      startOffset = seg.offset;
    }
    if (buf.length === 0) startOffset = seg.offset;

    const t = seg.text.trim();
    if (t) {
      buf.push(t);
      words += t.split(/\s+/).length;
    }
  }
  flush();
  return paras;
}

/** Rend la transcription en fonction du mode d'horodatage choisi. */
export function renderTranscript(
  segments: TranscriptSegment[],
  mode: TimestampMode,
): string {
  if (segments.length === 0) return "> _Transcription vide._";

  if (mode === "line") {
    return segments
      .map((s) => `> ${formatTimestamp(s.offset)} - ${s.text.trim()}`)
      .join("\n");
  }

  const paras = buildParagraphs(segments);
  return paras
    .map((p) => {
      const prefix =
        mode === "paragraph" ? `**[${formatTimestamp(p.startOffset)}]** ` : "";
      return `> ${prefix}${p.text}`;
    })
    .join("\n>\n");
}

/** Échappe une valeur de frontmatter YAML en chaîne entre guillemets. */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

/** Construit le contenu Markdown complet de la note (spec §3.5). */
export function assembleNote(data: NoteData): string {
  const duration =
    data.durationSeconds !== null ? formatTimestamp(data.durationSeconds) : "";

  const frontmatter = [
    "---",
    `video_id: ${data.videoId}`,
    `video_title: ${yamlString(data.title)}`,
    `video_url: ${data.videoUrl}`,
    `video_duration: ${yamlString(duration)}`,
    `transcription_date: ${today()}`,
    `transcription_language: ${data.language}`,
    `transcription_source: youtube`,
    `has_llm_mindmap: ${data.llmMindmap}`,
    `has_llm_summary: ${data.llmSummary}`,
    "---",
    "",
  ].join("\n");

  const titleBlock = `# 🎙️ ${data.title}\n`;

  const summaryBlock =
    data.summary !== null ? `\n## 📝 Résumé\n${data.summary.trim()}\n` : "";

  const fence = "```";
  const mindmapBlock =
    `\n## 🧠 Mindmap\n\n` +
    `${fence}iris-mindmap\n# ${data.title}\n${data.mindmap.trim()}\n${fence}\n`;

  const transcriptBlock =
    `\n## 📜 Transcription\n\n> [!TRANSCRIPT]- Transcription complète\n` +
    `${renderTranscript(data.segments, data.transcriptTimestamps)}\n`;

  const footer =
    `\n---\n*Généré par IRIS-Transcript • ${today()} • ` +
    `[Voir sur YouTube](${data.videoUrl})*\n`;

  return (
    frontmatter +
    titleBlock +
    summaryBlock +
    mindmapBlock +
    transcriptBlock +
    footer
  );
}
