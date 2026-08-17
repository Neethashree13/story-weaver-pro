import { gatewayTtsProvider } from "./gateway.server";
import { lovableTtsProvider } from "./lovable.server";
import type { SynthesisRequest, SynthesisResult, TtsProvider } from "./types";

/**
 * Provider registry. The expressive gateway voice is the default; the
 * translate-based voice stays as an offline-safe fallback.
 */
const PROVIDERS: Record<string, TtsProvider> = {
  [gatewayTtsProvider.id]: gatewayTtsProvider,
  [lovableTtsProvider.id]: lovableTtsProvider,
};

export function getTtsProvider(id?: string): TtsProvider {
  const key = (id ?? process.env["TTS_PROVIDER"] ?? gatewayTtsProvider.id).toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) throw new Error(`Unknown TTS provider "${key}".`);
  return provider;
}

/** Tries the expressive voice first and degrades to the fallback provider. */
export async function synthesizeWithFallback(
  request: SynthesisRequest,
): Promise<SynthesisResult> {
  const primary = getTtsProvider();
  try {
    return await primary.synthesize(request);
  } catch (error) {
    if (primary.id === lovableTtsProvider.id) throw error;
    console.warn(
      "[tts] primary voice failed, falling back:",
      error instanceof Error ? error.message : error,
    );
    const { stripSsml } = await import("../ssml");
    return lovableTtsProvider.synthesize({
      ...request,
      text: stripSsml(request.text),
      voice: undefined,
    });
  }
}

export type { SynthesisRequest, SynthesisResult, TtsProvider } from "./types";
