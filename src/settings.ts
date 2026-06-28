import { App, PluginSettingTab, Setting } from "obsidian";
import type IrisTranscriptPlugin from "./main";
import type { TimestampMode } from "./note";

export interface IrisSettings {
  languages: string[];
  revoldivApiKey: string;
  revoldivOwnerId: string;
  fantasyCloudApiKey: string;
  fantasyCloudUrl: string;
  fantasyCloudModel: string;
  outputFolder: string;
  chapterPauseThreshold: number;
  sectionPauseThreshold: number;
  mindmapHeight: number;
  transcriptTimestamps: TimestampMode;
}

export const DEFAULT_SETTINGS: IrisSettings = {
  languages: ["fr", "en"],
  revoldivApiKey: "",
  revoldivOwnerId: "",
  fantasyCloudApiKey: "",
  fantasyCloudUrl: "https://fantasyai.cloud/api/v1",
  fantasyCloudModel: "",
  outputFolder: "IRIS-Transcript",
  chapterPauseThreshold: 10,
  sectionPauseThreshold: 5,
  mindmapHeight: 400,
  transcriptTimestamps: "paragraph",
};

export class IrisSettingTab extends PluginSettingTab {
  plugin: IrisTranscriptPlugin;

  constructor(app: App, plugin: IrisTranscriptPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Langues de transcription")
      .setDesc(
        "Ordre de priorité pour les sous-titres YouTube (codes séparés par des virgules, ex. : fr, en).",
      )
      .addText((t) =>
        t
          .setPlaceholder("fr, en")
          .setValue(this.plugin.settings.languages.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.languages = v
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Dossier de sortie")
      .setDesc("Où créer les notes dans le vault.")
      .addText((t) =>
        t
          .setPlaceholder("IRIS-Transcript")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (v) => {
            this.plugin.settings.outputFolder = v.trim() || "IRIS-Transcript";
            await this.plugin.saveSettings();
          }),
      );

    // --- Revoldiv (fallback) ---
    new Setting(containerEl).setName("Revoldiv (fallback)").setHeading();

    new Setting(containerEl)
      .setName("Clé API Revoldiv")
      .setDesc("Utilisée quand la vidéo YouTube n'a aucun sous-titre.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("sk-...")
          .setValue(this.plugin.settings.revoldivApiKey)
          .onChange(async (v) => {
            this.plugin.settings.revoldivApiKey = v.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Owner ID Revoldiv")
      .setDesc("Identifiant requis par l'API Revoldiv.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.revoldivOwnerId)
          .onChange(async (v) => {
            this.plugin.settings.revoldivOwnerId = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    // --- Fantasy Cloud (résumé + mindmap LLM) ---
    new Setting(containerEl)
      .setName("Fantasy Cloud (résumé + mindmap LLM)")
      .setHeading();

    new Setting(containerEl)
      .setName("Clé API Fantasy Cloud")
      .setDesc("Active le résumé et la mindmap structurée par LLM.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("...")
          .setValue(this.plugin.settings.fantasyCloudApiKey)
          .onChange(async (v) => {
            this.plugin.settings.fantasyCloudApiKey = v.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("URL API Fantasy Cloud")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.fantasyCloudUrl)
          .onChange(async (v) => {
            this.plugin.settings.fantasyCloudUrl =
              v.trim() || "https://fantasyai.cloud/api/v1";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Modèle Fantasy Cloud")
      .addText((t) =>
        t
          .setPlaceholder("(défaut du service)")
          .setValue(this.plugin.settings.fantasyCloudModel)
          .onChange(async (v) => {
            this.plugin.settings.fantasyCloudModel = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    // --- Mindmap sans LLM (segmentation par pauses) ---
    new Setting(containerEl)
      .setName("Mindmap sans LLM (segmentation par pauses)")
      .setHeading();

    new Setting(containerEl)
      .setName("Seuil pause chapitre (s)")
      .setDesc("Une pause plus longue ouvre un nouveau chapitre.")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.chapterPauseThreshold))
          .onChange(async (v) => {
            const n = Number(v);
            if (!Number.isNaN(n) && n > 0) {
              this.plugin.settings.chapterPauseThreshold = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Seuil pause section (s)")
      .setDesc("Une pause plus longue ouvre une nouvelle section.")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.sectionPauseThreshold))
          .onChange(async (v) => {
            const n = Number(v);
            if (!Number.isNaN(n) && n > 0) {
              this.plugin.settings.sectionPauseThreshold = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    // --- Mindmap interactive ---
    new Setting(containerEl).setName("Mindmap interactive").setHeading();

    new Setting(containerEl)
      .setName("Hauteur de la mindmap (px)")
      .setDesc("Hauteur du panneau Markmap rendu dans la note.")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.mindmapHeight))
          .onChange(async (v) => {
            const n = Number(v);
            if (!Number.isNaN(n) && n >= 100) {
              this.plugin.settings.mindmapHeight = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    // --- Transcription ---
    new Setting(containerEl).setName("Transcription").setHeading();

    new Setting(containerEl)
      .setName("Horodatage de la transcription")
      .setDesc(
        "« Paragraphes » regroupe les sous-titres en texte lisible avec un horodatage par paragraphe. " +
          "« Aucun » donne du texte pur. « Par ligne » conserve une ligne horodatée par sous-titre (ancien comportement).",
      )
      .addDropdown((d) =>
        d
          .addOption("paragraph", "Paragraphes (recommandé)")
          .addOption("none", "Aucun (texte pur)")
          .addOption("line", "Par ligne (horodaté)")
          .setValue(this.plugin.settings.transcriptTimestamps)
          .onChange(async (v) => {
            this.plugin.settings.transcriptTimestamps = v as TimestampMode;
            await this.plugin.saveSettings();
          }),
      );
  }
}
