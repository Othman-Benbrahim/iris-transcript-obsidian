import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, IrisSettings, IrisSettingTab } from "./settings";
import { TranscribeModal } from "./modal";
import { extractVideoId, sanitizeFilename } from "./util";
import { assembleNote, NoteData, TranscriptSegment } from "./note";
import {
  fetchYoutubeTranscript,
  NoSubtitlesError,
  TranscriptFatalError,
} from "./transcript";
import { callLlm, structureByPauses } from "./structure";
import { registerMarkmap } from "./markmap";

interface TranscriptionResult {
  segments: TranscriptSegment[];
  title: string;
  durationSeconds: number | null;
  language: string;
}

export default class IrisTranscriptPlugin extends Plugin {
  settings!: IrisSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "transcribe-youtube-video",
      name: "Transcrire une vidéo YouTube",
      callback: () => {
        new TranscribeModal(this.app, (url) => {
          void this.handleUrl(url);
        }).open();
      },
    });

    this.addSettingTab(new IrisSettingTab(this.app, this));

    // Rendu interactif des blocs ```iris-mindmap (sans plugin tiers).
    registerMarkmap(this, () => this.settings.mindmapHeight);
  }

  /** Pipeline complet : transcription -> structuration -> note (spec §4.1). */
  private async handleUrl(url: string): Promise<void> {
    const videoId = extractVideoId(url);
    if (!videoId) {
      new Notice("URL YouTube invalide.");
      return;
    }

    // --- Étape 1 : transcription ---
    let t: TranscriptionResult;
    try {
      t = await this.transcribe(videoId);
    } catch (e) {
      this.notifyTranscriptionError(e);
      return;
    }

    // --- Étape 2 : structuration (mindmap + résumé) ---
    new Notice("IRIS : structuration en cours…");
    const { mindmap, summary, llmMindmap, llmSummary } =
      await this.structure(t.segments);

    // --- Étape 3 : note ---
    const data: NoteData = {
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: t.title,
      durationSeconds: t.durationSeconds,
      language: t.language,
      segments: t.segments,
      mindmap,
      summary,
      llmMindmap,
      llmSummary,
      transcriptTimestamps: this.settings.transcriptTimestamps,
    };

    try {
      const file = await this.createNote(data);
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice("Note créée ✅");
    } catch (e) {
      console.error("IRIS-Transcript:", e);
      new Notice("Erreur lors de la création de la note (voir la console).");
    }
  }

  /** Transcription via les sous-titres YouTube. */
  private async transcribe(videoId: string): Promise<TranscriptionResult> {
    new Notice("IRIS : récupération des sous-titres YouTube…");
    return fetchYoutubeTranscript(videoId, this.settings.languages);
  }

  /** Structuration : LLM si Fantasy Cloud est configuré, sinon pauses. */
  private async structure(segments: TranscriptSegment[]): Promise<{
    mindmap: string;
    summary: string | null;
    llmMindmap: boolean;
    llmSummary: boolean;
  }> {
    const pauseMindmap = (): string =>
      structureByPauses(
        segments,
        this.settings.chapterPauseThreshold,
        this.settings.sectionPauseThreshold,
      );

    if (!this.settings.fantasyCloudApiKey) {
      return { mindmap: pauseMindmap(), summary: null, llmMindmap: false, llmSummary: false };
    }

    const transcriptText = segments.map((s) => s.text).join(" ");
    const result = await callLlm(transcriptText, this.settings);

    if (result.truncated) {
      new Notice(
        "Transcription très longue : le résumé LLM ne couvre que le début.",
      );
    }

    if (result.structure) {
      return {
        mindmap: result.structure.mindmap,
        summary: result.structure.summary,
        llmMindmap: true,
        llmSummary: true,
      };
    }

    // Échec LLM : on retombe sur le mode dégradé.
    new Notice(`Résumé LLM indisponible (${result.error}). Mindmap par pauses.`);
    return { mindmap: pauseMindmap(), summary: null, llmMindmap: false, llmSummary: false };
  }

  private notifyTranscriptionError(e: unknown): void {
    if (e instanceof NoSubtitlesError) {
      new Notice(
        "Aucun sous-titre disponible pour cette vidéo. " +
          "La transcription nécessite des sous-titres YouTube (manuels ou auto-générés).",
      );
      return;
    }
    if (e instanceof TranscriptFatalError) {
      new Notice(e.message);
      return;
    }
    console.error("IRIS-Transcript:", e);
    new Notice("Échec de la transcription (voir la console).");
  }

  /** Crée la note dans le dossier de sortie, sans écraser une note existante. */
  private async createNote(data: NoteData): Promise<TFile> {
    const folder = normalizePath(this.settings.outputFolder.replace(/\/+$/, ""));
    if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder).catch(() => {
        /* le dossier existe peut-être déjà : on ignore */
      });
    }

    const base = sanitizeFilename(data.title);
    let path = normalizePath(folder ? `${folder}/${base}.md` : `${base}.md`);
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(
        folder ? `${folder}/${base} (${i}).md` : `${base} (${i}).md`,
      );
      i++;
    }

    return this.app.vault.create(path, assembleNote(data));
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<IrisSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
