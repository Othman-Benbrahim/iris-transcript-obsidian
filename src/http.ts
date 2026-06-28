import { requestUrl } from "obsidian";
import type { FetchParams } from "youtube-transcript-plus";

/**
 * Fonction fetch compatible avec youtube-transcript-plus (videoFetch /
 * playerFetch / transcriptFetch), mais qui passe par requestUrl() d'Obsidian.
 *
 * Pourquoi : dans le renderer Electron d'Obsidian, l'origine est
 * `app://obsidian.md`. Un fetch() standard vers YouTube est bloqué par CORS.
 * requestUrl() émet la requête côté Node et contourne CORS. On enveloppe sa
 * réponse dans un objet Response standard, attendu par la librairie.
 */
export async function obsidianFetch(params: FetchParams): Promise<Response> {
  const headers: Record<string, string> = { ...(params.headers ?? {}) };
  if (params.userAgent) headers["User-Agent"] = params.userAgent;
  if (params.lang) headers["Accept-Language"] = params.lang;

  const res = await requestUrl({
    url: params.url,
    method: params.method ?? "GET",
    headers,
    body: params.body,
    throw: false, // ne pas lever sur 4xx/5xx : la librairie lit le status
  });

  return new Response(res.text, {
    status: res.status,
    headers: res.headers,
  });
}
