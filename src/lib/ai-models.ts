/**
 * Single source of truth for every model the pipeline uses.
 * Change a model here and the whole pipeline follows.
 */

/** Story, panel-breakdown and narration-script writing (Gemini via OpenAI-compatible API). */
export const TEXT_MODEL = "gemini-3.6-flash";

/** Image generation through the Lovable AI Gateway (supports reference-image conditioning). */
export const IMAGE_MODEL = "google/gemini-3.1-flash-image";

/** Narration voice synthesis through the Lovable AI Gateway. */
export const TTS_MODEL = "openai/gpt-4o-mini-tts";

/** Creative sampling for prose; high enough for voice, low enough to stay on-brief. */
export const STORY_TEMPERATURE = 0.95;
/** Structural work (panel breakdowns) must stay disciplined. */
export const STRUCTURE_TEMPERATURE = 0.7;
