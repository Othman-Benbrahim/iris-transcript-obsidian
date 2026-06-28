/**
 * Extrait l'identifiant d'une vidéo YouTube depuis une URL.
 * Gère watch?v=, youtu.be/, embed/, shorts/, et un ID brut de 11 caractères.
 * Retourne null si rien n'est reconnu.
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

/** Formate un nombre de secondes en HH:MM:SS. */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Rend une chaîne utilisable comme nom de fichier dans un vault Obsidian. */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned || "transcription";
}

/** Date du jour au format YYYY-MM-DD. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Normalise les espaces et recolle la ponctuation collée par les sous-titres. */
export function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/([(«"])\s+/g, "$1")
    .trim();
}

/** Renvoie les `maxWords` premiers mots d'un texte, avec une ellipse si tronqué. */
export function excerpt(text: string, maxWords: number): string {
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ") + "…";
}
