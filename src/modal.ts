import { App, Modal, Notice, Setting } from "obsidian";

export class TranscribeModal extends Modal {
  private url = "";
  private readonly onSubmit: (url: string) => void;

  constructor(app: App, onSubmit: (url: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "🎙️ Transcrire une vidéo YouTube" });

    new Setting(contentEl)
      .setName("URL YouTube")
      .setDesc("Colle l'adresse de la vidéo (youtube.com/watch?v=… ou youtu.be/…).")
      .addText((t) => {
        t.setPlaceholder("https://www.youtube.com/watch?v=…").onChange(
          (v) => (this.url = v),
        );
        t.inputEl.addClass("iris-url-input");
        t.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.submit();
          }
        });
        window.setTimeout(() => t.inputEl.focus(), 0);
      });

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("Transcrire")
        .setCta()
        .onClick(() => this.submit()),
    );
  }

  private submit(): void {
    const url = this.url.trim();
    if (!url) {
      new Notice("Colle d'abord une URL YouTube.");
      return;
    }
    this.close();
    this.onSubmit(url);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
