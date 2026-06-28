import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript-plus";
import type { TranscriptConfig } from "youtube-transcript-plus";
import { obsidianFetch } from "./http";
import { TranscriptSegment } from "./note";

export interface YoutubeTranscriptOutcome {
  segments: TranscriptSegment[];
  title: string;
  durationSeconds: number | null;
  language: string;
}

/** Indique qu'aucun sous-titre n'est disponible pour la vidéo. */
export class NoSubtitlesError extends Error {
  constructor(public readonly videoId: string) {
    super("Aucun sous-titre disponible pour cette vidéo.");
    this.name = "NoSubtitlesError";
  }
}

/** Erreur non récupérable (limite de taux, vidéo indisponible…) : pas de fallback utile. */
export class TranscriptFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptFatalError";
  }
}

/**
 * Récupère la transcription YouTube via youtube-transcript-plus, en routant
 * toutes les requêtes par requestUrl() (contournement CORS).
 *
 * Essaie chaque langue configurée dans l'ordre, puis la piste par défaut.
 * - aucun sous-titre / désactivés          -> NoSubtitlesError
 * - limite de taux / vidéo indisponible    -> TranscriptFatalError
 */
export async function fetchYoutubeTranscript(
  videoId: string,
  languages: string[],
): Promise<YoutubeTranscriptOutcome> {
  const baseConfig: TranscriptConfig = {
    videoDetails: true,
    videoFetch: obsidianFetch,
    playerFetch: obsidianFetch,
    transcriptFetch: obsidianFetch,
    retries: 2,
    retryDelay: 1000,
  };

  // Langues à tenter : celles configurées, puis « piste par défaut » (undefined).
  const attempts: (string | undefined)[] = [...languages, undefined];
  let lastLanguageError: YoutubeTranscriptNotAvailableLanguageError | null = null;

  for (const lang of attempts) {
    try {
      const config: TranscriptConfig & { videoDetails: true } = lang
        ? { ...baseConfig, lang, videoDetails: true }
        : { ...baseConfig, videoDetails: true };

      const result = await YoutubeTranscript.fetchTranscript(videoId, config);

      const segments: TranscriptSegment[] = result.segments.map((s) => ({
        text: s.text,
        offset: s.offset,
        duration: s.duration,
      }));

      const resolvedLang =
        result.segments[0]?.lang ?? lang ?? languages[0] ?? "und";

      return {
        segments,
        title: result.videoDetails.title || `Vidéo ${videoId}`,
        durationSeconds: result.videoDetails.lengthSeconds || null,
        language: resolvedLang,
      };
    } catch (e) {
      if (e instanceof YoutubeTranscriptNotAvailableLanguageError) {
        lastLanguageError = e;
        continue; // langue indisponible : on tente la suivante
      }
      if (
        e instanceof YoutubeTranscriptDisabledError ||
        e instanceof YoutubeTranscriptNotAvailableError
      ) {
        throw new NoSubtitlesError(videoId);
      }
      if (e instanceof YoutubeTranscriptTooManyRequestError) {
        throw new TranscriptFatalError(
          "YouTube limite les requêtes (rate limit). Réessaie dans quelques minutes.",
        );
      }
      if (e instanceof YoutubeTranscriptVideoUnavailableError) {
        throw new TranscriptFatalError("Cette vidéo est indisponible ou privée.");
      }
      throw new TranscriptFatalError(
        e instanceof Error ? e.message : "Échec de la transcription YouTube.",
      );
    }
  }

  // Toutes les langues configurées ont échoué pour cause d'indisponibilité de langue.
  if (lastLanguageError) {
    throw new NoSubtitlesError(videoId);
  }
  throw new NoSubtitlesError(videoId);
}
