/**
 * SSML support for narration.
 *
 * The narration script uses two authored pause markers:
 *   - a blank line  -> long dramatic pause
 *   - an ellipsis … -> short breath
 * These are converted into real <break> tags so the voice performs the pacing
 * instead of reading punctuation. Providers that cannot parse SSML get the
 * plain-text version through `stripSsml`.
 */

export type NarrationPacing = {
  /** Pause after a paragraph, in ms. */
  paragraphBreakMs: number;
  /** Pause on an ellipsis, in ms. */
  beatBreakMs: number;
  /** Overall speaking rate, e.g. "92%". */
  rate: string;
  /** Pitch shift, e.g. "-2st". */
  pitch: string;
};

export const PACING_PRESETS: Record<string, NarrationPacing> = {
  "sci-fi": { paragraphBreakMs: 750, beatBreakMs: 380, rate: "95%", pitch: "-1st" },
  horror: { paragraphBreakMs: 1100, beatBreakMs: 520, rate: "86%", pitch: "-2st" },
  action: { paragraphBreakMs: 450, beatBreakMs: 220, rate: "108%", pitch: "+1st" },
  fantasy: { paragraphBreakMs: 900, beatBreakMs: 450, rate: "92%", pitch: "-1st" },
  drama: { paragraphBreakMs: 800, beatBreakMs: 400, rate: "94%", pitch: "0st" },
};

export function pacingFor(style: string): NarrationPacing {
  return PACING_PRESETS[style] ?? PACING_PRESETS["drama"]!;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wraps a narration script in SSML.
 * `NAME: line` dialogue is emphasised so spoken lines lift out of narration.
 */
export function buildNarrationSsml(script: string, style: string): string {
  const pacing = pacingFor(style);
  const paragraphs = script
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const body = paragraphs
    .map((paragraph) => {
      const lines = paragraph
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const speaker = line.match(/^([A-Z][A-Z _'-]{1,24}):\s*(.+)$/);
          const spoken = speaker ? speaker[2]! : line;
          // An authored ellipsis becomes a real breath.
          const withBreaks = escapeXml(spoken).replace(
            /\s*(?:…|\.\.\.)\s*/g,
            `<break time="${pacing.beatBreakMs}ms"/> `,
          );
          return speaker
            ? `<s><emphasis level="moderate">${withBreaks}</emphasis></s>`
            : `<s>${withBreaks}</s>`;
        })
        .join(" ");
      return `<p>${lines}</p>`;
    })
    .join(`<break time="${pacing.paragraphBreakMs}ms"/>`);

  return [
    '<speak version="1.0" xml:lang="en-US">',
    `<prosody rate="${pacing.rate}" pitch="${pacing.pitch}">`,
    body,
    "</prosody>",
    "</speak>",
  ].join("");
}

/** Plain-text fallback for providers without SSML support. */
export function stripSsml(ssml: string): string {
  return ssml
    .replace(/<break[^>]*\/>/g, " … ")
    .replace(/<\/p>/g, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Voice-acting direction handed to providers that accept natural-language steering. */
export const STYLE_INSTRUCTIONS: Record<string, string> = {
  "sci-fi":
    "Narrate like a cinematic sci-fi trailer storyteller: cool, awed, analytical. Let scale and dread land in the silence. Never rush.",
  horror:
    "Narrate like a campfire horror storyteller: hushed, unsteady, close to the microphone. Slow down before every reveal, then say it plainly.",
  action:
    "Narrate with driving momentum and percussive energy. Punch the verbs, hold one hard beat before the payoff.",
  fantasy:
    "Narrate like an oral legend: mythic, lyrical, rolling cadence, weighty pauses, an air of prophecy.",
  drama:
    "Narrate intimately and warmly, like reading to one person. Restrained emotion, honest pauses, no theatrics, never robotic.",
};

export function instructionsFor(style: string) {
  return `${STYLE_INSTRUCTIONS[style] ?? STYLE_INSTRUCTIONS["drama"]!} Perform the text as a motion-comic narrator: shift tone with the emotion of each line, breathe naturally, and give dialogue lines a distinct character colour from the narration.`;
}
