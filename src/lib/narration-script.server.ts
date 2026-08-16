/**
 * Phase 3 — Emotional narration scripting.
 *
 * Rewrites the flat scene narration into a performed, paced script *before*
 * it reaches the TTS provider. The existing TTS pipeline is untouched: this
 * module only changes the text that is handed to it.
 *
 * Server-only: it may call the AI provider. It always returns usable text,
 * falling back to a deterministic rewrite when AI is unavailable.
 */

export const NARRATION_STYLES = ["sci-fi", "horror", "action", "fantasy", "drama"] as const;
export type NarrationStyle = (typeof NARRATION_STYLES)[number];

type StyleDirection = {
  /** Voice direction handed to the model. */
  direction: string;
  /** Words that earn a dramatic beat in the offline fallback. */
  beatWords: string[];
};

const STYLE_DIRECTIONS: Record<NarrationStyle, StyleDirection> = {
  "sci-fi": {
    direction:
      "Cold, awed, analytical. Clipped declaratives. Let scale and dread land in the silence between lines.",
    beatWords: ["machine", "signal", "system", "future", "core", "void", "data", "reactor"],
  },
  horror: {
    direction:
      "Hushed and unsteady. Short breaths. Withhold the reveal until the last possible beat, then say it plainly.",
    beatWords: ["dark", "blood", "silence", "shadow", "scream", "door", "cold", "alone"],
  },
  action: {
    direction:
      "Driving and percussive. Verb-first fragments. Momentum over description, with one hard stop before the payoff.",
    beatWords: ["run", "hit", "blast", "now", "fast", "burst", "strike", "down"],
  },
  fantasy: {
    direction:
      "Mythic and lyrical, like an oral legend. Rolling cadence, weighty pauses, an air of prophecy.",
    beatWords: ["ancient", "kingdom", "magic", "prophecy", "blade", "throne", "sworn", "fate"],
  },
  drama: {
    direction: "Intimate and grounded. Restrained emotion, honest pauses, no theatrics.",
    beatWords: ["never", "always", "again", "gone", "hope", "truth"],
  },
};

/** Maps free-form project genres onto a supported narration style. */
export function resolveNarrationStyle(genre: string | null | undefined): NarrationStyle {
  const value = (genre ?? "").toLowerCase();
  if (/sci|space|cyber|tech|mecha|future/.test(value)) return "sci-fi";
  if (/horror|thriller|creep|dark|ghost|zombie/.test(value)) return "horror";
  if (/action|adventure|hero|battle|super/.test(value)) return "action";
  if (/fantasy|myth|magic|fairy|epic/.test(value)) return "fantasy";
  return "drama";
}

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]*/g) ?? [text]).map((part) => part.trim()).filter(Boolean);
}

/**
 * Deterministic rewrite used when AI is unavailable or returns nothing usable.
 * Breaks long sentences into beats and inserts ellipsis pauses at dramatic
 * words, without inventing or dropping any meaning.
 */
export function shapeNarrationOffline(text: string, style: NarrationStyle): string {
  const { beatWords } = STYLE_DIRECTIONS[style];
  const lines: string[] = [];

  for (const sentence of splitSentences(text)) {
    const words = sentence.split(/\s+/);
    if (words.length <= 10) {
      lines.push(sentence);
      continue;
    }
    // Break at the last natural clause boundary so meaning stays intact.
    const commaIndex = sentence.lastIndexOf(",", Math.floor(sentence.length * 0.7));
    if (commaIndex > 12) {
      lines.push(`${sentence.slice(0, commaIndex).trim()}…`);
      lines.push(sentence.slice(commaIndex + 1).trim());
    } else {
      lines.push(sentence);
    }
  }

  return lines
    .map((line) => {
      const lower = line.toLowerCase();
      const hit = beatWords.some((word) => lower.includes(word));
      // A leading beat before a loaded line reads as suspense in TTS.
      return hit && !line.startsWith("…") ? `… ${line}` : line;
    })
    .join("\n\n")
    .trim();
}

/** Strips model chatter, fences and stage directions the TTS should not read. */
function cleanModelScript(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:\w+)?/i, "")
    .replace(/```$/, "")
    .replace(/^\s*(script|narration)\s*:\s*/i, "")
    .replace(/\[[^\]]*\]/g, "") // [pause], [beat], stage directions
    .replace(/\(([^)]*pause[^)]*)\)/gi, "…")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type NarrationScriptInput = {
  text: string;
  style: NarrationStyle;
  sceneTitle?: string | null;
  dialogue?: string | null;
};

/**
 * Returns a performance-ready narration script.
 * Never throws: any AI failure degrades to the offline shaping.
 */
export async function writeNarrationScript(input: NarrationScriptInput): Promise<{
  script: string;
  style: NarrationStyle;
  source: "ai" | "offline";
}> {
  const source = input.text.trim();
  if (!source) return { script: "", style: input.style, source: "offline" };

  const key = process.env["GEMINI_API_KEY"];
  if (!key) return { script: shapeNarrationOffline(source, input.style), style: input.style, source: "offline" };

  try {
    const { createGeminiProvider } = await import("./ai-gateway.server");
    const { streamText } = await import("ai");
    const gateway = createGeminiProvider(key);
    const direction = STYLE_DIRECTIONS[input.style].direction;

    const result = streamText({
      model: gateway("gemini-3.5-flash"),
      system: [
        "You are a voice-over director for cinematic motion comics.",
        "You rewrite flat narration into a performed script for a single narrator.",
        "Rules:",
        "- Preserve every fact, name and beat of the original. Never invent plot.",
        "- Never add or change events, characters or outcomes.",
        "- Reshape pacing only: short lines, deliberate fragments, suspense before reveals.",
        "- Use a blank line for a long pause and an ellipsis (…) for a short breath.",
        "- No stage directions, no brackets, no labels, no commentary — only spoken words.",
        "- Keep it within roughly 1.3x the original word count.",
      ].join("\n"),
      prompt: [
        input.sceneTitle ? `Scene: ${input.sceneTitle}` : "",
        `Style: ${input.style}`,
        `Voice direction: ${direction}`,
        input.dialogue ? `Character dialogue in this scene: ${input.dialogue}` : "",
        "",
        "Original narration:",
        source,
        "",
        "Rewrite it as the narrator will speak it. Output only the script.",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    const script = cleanModelScript(await result.text);
    // Guard against empty, truncated or runaway rewrites.
    const originalWords = source.split(/\s+/).length;
    const scriptWords = script.split(/\s+/).filter(Boolean).length;
    if (!script || scriptWords < Math.max(3, originalWords * 0.5) || scriptWords > originalWords * 2.5) {
      return { script: shapeNarrationOffline(source, input.style), style: input.style, source: "offline" };
    }
    return { script, style: input.style, source: "ai" };
  } catch (error) {
    console.warn("[narration] script rewrite failed, using offline shaping", error);
    return { script: shapeNarrationOffline(source, input.style), style: input.style, source: "offline" };
  }
}
