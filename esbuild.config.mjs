import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "module";

const banner = `/* IRIS-Transcript — bundle généré par esbuild. Ne pas éditer ce fichier directement : modifier les sources dans src/. */`;

const prod = process.argv[2] === "production";

// Built-ins Node (versions nues ET préfixées node:), marqués externes.
const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

/**
 * youtube-transcript-plus importe node:fs/promises et node:path uniquement pour
 * sa classe FsCache (cache disque), que nous n'utilisons pas (cache en mémoire
 * par défaut). On résout ces imports vers un module vide : le code n'est jamais
 * exécuté, et le bundle reste portable.
 */
const stubNodeBuiltins = {
  name: "stub-unused-node-builtins",
  setup(build) {
    build.onResolve({ filter: /^node:(fs|fs\/promises|path)$/ }, (args) => ({
      path: args.path,
      namespace: "stub-empty",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub-empty" }, () => ({
      contents: "export default {};",
      loader: "js",
    }));
  },
};

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  plugins: [stubNodeBuiltins],
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...nodeBuiltins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
