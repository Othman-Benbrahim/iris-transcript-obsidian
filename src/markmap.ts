import { MarkdownRenderChild, Plugin } from "obsidian";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";

/** Transformer partagé (sans plugins : on n'a besoin que des titres et listes). */
const transformer = new Transformer([]);

/**
 * Rend un bloc Markdown en mindmap Markmap interactive à l'intérieur d'une note.
 * Gère le cycle de vie : la mindmap est détruite quand le bloc est retiré du DOM.
 */
export class MarkmapRenderChild extends MarkdownRenderChild {
  private mm: Markmap | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly source: string,
    private readonly height: number,
  ) {
    super(containerEl);
  }

  onload(): void {
    try {
      const wrapper = this.containerEl.createDiv({ cls: "iris-markmap-container" });
      wrapper.style.setProperty("--iris-mm-height", `${this.height}px`);
      const svg = wrapper.createSvg("svg", { cls: "iris-markmap-svg" });

      const { root } = transformer.transform(this.source);
      this.mm = Markmap.create(svg, undefined, root);

      // Le SVG vient d'être inséré : on ajuste une fois ses dimensions connues.
      window.setTimeout(() => {
        void this.mm?.fit();
      }, 0);
    } catch (e) {
      console.error("IRIS-Transcript (markmap):", e);
      this.containerEl.createEl("pre", {
        text: this.source,
        cls: "iris-markmap-fallback",
      });
    }
  }

  onunload(): void {
    this.mm?.destroy();
    this.mm = null;
  }
}

/**
 * Enregistre le processeur de bloc de code `iris-mindmap`. Toute note contenant
 *
 *     ```iris-mindmap
 *     # Titre
 *     ## Chapitre
 *     - point
 *     ```
 *
 * affiche alors une mindmap interactive — sans plugin tiers.
 */
export function registerMarkmap(
  plugin: Plugin & { settings: { mindmapHeight: number } },
): void {
  plugin.registerMarkdownCodeBlockProcessor("iris-mindmap", (source, el, ctx) => {
    const child = new MarkmapRenderChild(
      el,
      source.trim(),
      plugin.settings.mindmapHeight,
    );
    ctx.addChild(child);
  });
}
