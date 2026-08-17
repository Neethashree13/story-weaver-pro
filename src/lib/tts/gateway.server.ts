import { TTS_MODEL } from "../ai-models";
import { stripSsml } from "../ssml";
import type { SynthesisRequest, SynthesisResult, TtsProvider } from "./types";

/**
 * Expressive narration through the Lovable AI Gateway.
 * Unlike the old translate-based voice this one accepts performance
 * instructions, so narration is acted rather than read.
 */
export const gatewayTtsProvider: TtsProvider = {
  id: "gateway",
  defaultVoice: "ballad",

  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("LOVABLE_API_KEY is not configured.");

    const voice = request.voice?.trim() || gatewayTtsProvider.defaultVoice;
    // The model performs plain text with instructions; SSML markup is used for
    // pacing authoring and stripped to spoken words here.
    const input = request.text.trim().startsWith("<speak") ? stripSsml(request.text) : request.text.trim();
    if (!input) throw new Error("Cannot synthesize empty narration.");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice,
        input,
        response_format: "mp3",
        ...(request.instructions ? { instructions: request.instructions } : {}),
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (response.status === 429) throw new Error("Voice service is rate limited. Try again shortly.");
      if (response.status === 402) throw new Error("AI credits are exhausted. Add credits to keep narrating.");
      throw new Error(`Narration failed (${response.status}): ${text.slice(0, 200)}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error("Voice service returned empty audio.");

    // ~24 kbps mono mp3 from this model.
    const durationMs = Math.max(1_000, Math.round((bytes.byteLength / 3_000) * 1_000));
    return { bytes, format: "mp3", voice, provider: gatewayTtsProvider.id, durationMs };
  },
};
