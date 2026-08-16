/**
 * Phase 8 — Sound design.
 *
 * Builds the genre-appropriate background music bed and ambience layer that sit
 * *under* the narration in the final mix. Everything is synthesised by FFmpeg
 * from `lavfi` sources, so the app ships no audio assets and the layers stretch
 * to any video length without looping seams.
 *
 * This module is pure: it only returns FFmpeg input args and a filtergraph.
 * The renderer owns process execution.
 */

export const AUDIO_GENRES = ["sci-fi", "horror", "action", "fantasy", "drama"] as const;
export type AudioGenre = (typeof AUDIO_GENRES)[number];

/** Maps a free-form project genre onto a supported score. Mirrors the narration styles. */
export function resolveAudioGenre(genre: string | null | undefined): AudioGenre {
  const value = (genre ?? "").toLowerCase();
  if (/sci|space|cyber|tech|mecha|future/.test(value)) return "sci-fi";
  if (/horror|thriller|creep|dark|ghost|zombie/.test(value)) return "horror";
  if (/action|adventure|hero|battle|super/.test(value)) return "action";
  if (/fantasy|myth|magic|fairy|epic/.test(value)) return "fantasy";
  return "drama";
}

type MusicRecipe = {
  label: string;
  /** Chord/drone partials, in Hz. Kept low so they never mask speech. */
  tones: number[];
  /** Slow pulse rate (Hz) and depth — the "heartbeat" of the cue. */
  pulseHz: number;
  pulseDepth: number;
  /** Tone shaping. */
  lowpassHz: number;
  highpassHz: number;
};

type AmbienceRecipe = {
  label: string;
  /** Noise colour: brown = rumble, pink = air, white = hiss. */
  color: "brown" | "pink" | "white";
  lowpassHz: number;
  highpassHz: number;
  /** Slow swell so the ambience breathes instead of sitting flat. */
  swellHz: number;
  swellDepth: number;
};

const MUSIC: Record<AudioGenre, MusicRecipe> = {
  // Cold synth drone, minor 5th + octave shimmer.
  "sci-fi": { label: "cold synth drone", tones: [82.41, 123.47, 164.81, 246.94], pulseHz: 0.5, pulseDepth: 0.5, lowpassHz: 1400, highpassHz: 45 },
  // Dissonant tritone bed, very slow breathing pulse.
  horror: { label: "dissonant dread bed", tones: [55, 77.78, 110, 233.08], pulseHz: 0.22, pulseDepth: 0.75, lowpassHz: 900, highpassHz: 30 },
  // Driving low ostinato with a fast pulse.
  action: { label: "driving percussive bed", tones: [65.41, 98, 130.81, 196], pulseHz: 2.4, pulseDepth: 0.65, lowpassHz: 1800, highpassHz: 55 },
  // Warm open-fifth choir-ish swell.
  fantasy: { label: "mythic strings swell", tones: [98, 146.83, 196, 293.66], pulseHz: 0.35, pulseDepth: 0.45, lowpassHz: 2200, highpassHz: 60 },
  // Sparse, restrained piano-like pad.
  drama: { label: "restrained piano pad", tones: [110, 164.81, 220, 329.63], pulseHz: 0.4, pulseDepth: 0.35, lowpassHz: 1600, highpassHz: 70 },
};

const AMBIENCE: Record<AudioGenre, AmbienceRecipe> = {
  "sci-fi": { label: "ship hull hum", color: "brown", lowpassHz: 520, highpassHz: 60, swellHz: 0.13, swellDepth: 0.4 },
  horror: { label: "cold room air", color: "pink", lowpassHz: 3200, highpassHz: 300, swellHz: 0.09, swellDepth: 0.7 },
  action: { label: "city rumble", color: "brown", lowpassHz: 700, highpassHz: 40, swellHz: 0.5, swellDepth: 0.35 },
  fantasy: { label: "open wind", color: "pink", lowpassHz: 1800, highpassHz: 180, swellHz: 0.11, swellDepth: 0.6 },
  drama: { label: "quiet room tone", color: "pink", lowpassHz: 1200, highpassHz: 120, swellHz: 0.08, swellDepth: 0.3 },
};

export type AudioMixSettings = {
  /** Layer toggles. Narration is never optional — it is the primary audio. */
  music: boolean;
  ambience: boolean;
  /** Linear gains. 1 = unchanged. */
  narrationVolume: number;
  musicVolume: number;
  ambienceVolume: number;
  /** 0 = no ducking, 1 = music all but disappears under speech. */
  duckAmount: number;
};

export const DEFAULT_AUDIO_MIX: AudioMixSettings = {
  music: true,
  ambience: true,
  narrationVolume: 1,
  musicVolume: 0.22,
  ambienceVolume: 0.12,
  duckAmount: 0.75,
};

/** FFmpeg's `tremolo` rejects rates below 0.1 Hz. */
const safeTremolo = (hz: number) => Math.max(hz, 0.1).toFixed(3);

const clamp = (value: number | undefined, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

export type AudioMixInput = { [K in keyof AudioMixSettings]?: AudioMixSettings[K] | undefined };

export function normaliseAudioMix(input?: AudioMixInput | null): AudioMixSettings {
  const merged = { ...DEFAULT_AUDIO_MIX, ...(input ?? {}) };
  return {
    music: merged.music !== false,
    ambience: merged.ambience !== false,
    narrationVolume: clamp(merged.narrationVolume, 0.1, 2),
    musicVolume: clamp(merged.musicVolume, 0, 1),
    ambienceVolume: clamp(merged.ambienceVolume, 0, 1),
    duckAmount: clamp(merged.duckAmount, 0, 1),
  };
}

export type AudioBedPlan = {
  /** Extra `-f lavfi -t <d> -i <source>` args appended after the base video input. */
  inputs: string[];
  /** Filtergraph that ends in the label below. */
  filter: string;
  /** Output label to map as the final audio stream. */
  outputLabel: string;
  /** Human-readable description of what was layered in. */
  description: string;
};

/**
 * Filtergraph for the final mix pass.
 *
 * Input 0 is the rendered video whose audio track is the narration. Every extra
 * input is a synthesised bed. Narration is duplicated as the sidechain key, so
 * music and ambience automatically dip whenever a line is being spoken and
 * recover in the gaps.
 */
export function buildAudioBed(options: {
  genre: AudioGenre;
  durationSeconds: number;
  settings: AudioMixSettings;
}): AudioBedPlan | null {
  const { genre, settings } = options;
  const duration = Math.max(options.durationSeconds, 1);
  const wantsMusic = settings.music && settings.musicVolume > 0;
  const wantsAmbience = settings.ambience && settings.ambienceVolume > 0;

  // Nothing to layer: let the caller skip the whole pass and keep the original file.
  if (!wantsMusic && !wantsAmbience && settings.narrationVolume === 1) return null;

  const t = duration.toFixed(3);
  const inputs: string[] = [];
  const chains: string[] = [];
  const mixLabels: string[] = [];
  const described: string[] = [];
  let nextInput = 1;

  // Narration: primary layer, split into the audible take plus one key per duck.
  // Only allocate keys when ducking is actually enabled — an unconsumed asplit
  // output makes FFmpeg fail with "Filter 'asplit' has output N unconnected".
  const ducking = settings.duckAmount > 0;
  const keysNeeded = ducking ? (wantsMusic ? 1 : 0) + (wantsAmbience ? 1 : 0) : 0;
  const keyLabels = Array.from({ length: keysNeeded }, (_, i) => `key${i}`);
  chains.push(
    `[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[narrsrc]`,
  );
  if (keysNeeded > 0) {
    // The key is taken *before* the narration volume trim, so the duck depth is
    // independent of how loud the user set the voice.
    chains.push(`[narrsrc]asplit=${keysNeeded + 1}[narrlvl]${keyLabels.map((l) => `[${l}raw]`).join("")}`);
    chains.push(`[narrlvl]volume=${settings.narrationVolume.toFixed(3)}[narrout]`);
    // Band-limit to the speech range and hard-boost so the key reliably crosses
    // the compressor threshold at ordinary narration levels.
    for (const label of keyLabels) {
      chains.push(
        `[${label}raw]highpass=f=150,lowpass=f=4000,volume=12,alimiter=limit=0.99[${label}]`,
      );
    }
  } else {
    chains.push(`[narrsrc]volume=${settings.narrationVolume.toFixed(3)}[narrout]`);
  }
  mixLabels.push("[narrout]");

  // Ducking strength: with a hot key, a low threshold plus a steep ratio gives a
  // clearly audible dip. duckAmount 1 ≈ 12+ dB of gain reduction under speech.
  const ratio = (1.5 + settings.duckAmount * 18.5).toFixed(2);
  const threshold = Math.max(0.3 - settings.duckAmount * 0.29, 0.01).toFixed(4);
  const duck = (source: string, key: string, out: string, release: number) =>
    `[${source}][${key}]sidechaincompress=threshold=${threshold}:ratio=${ratio}:attack=15:release=${release}:makeup=1:level_sc=1[${out}]`;

  let keyIndex = 0;

  if (wantsMusic) {
    const recipe = MUSIC[genre];
    const toneLabels: string[] = [];
    recipe.tones.forEach((freq, i) => {
      inputs.push("-f", "lavfi", "-t", t, "-i", `sine=frequency=${freq}:sample_rate=44100`);
      const label = `m${i}`;
      chains.push(`[${nextInput}:a]volume=${(1 / recipe.tones.length).toFixed(3)}[${label}]`);
      toneLabels.push(`[${label}]`);
      nextInput += 1;
    });
    const fadeOut = Math.max(duration - 2.5, 0).toFixed(3);
    chains.push(
      `${toneLabels.join("")}amix=inputs=${toneLabels.length}:normalize=0[chord]`,
      [
        `[chord]highpass=f=${recipe.highpassHz}`,
        `lowpass=f=${recipe.lowpassHz}`,
        `tremolo=f=${safeTremolo(recipe.pulseHz)}:d=${recipe.pulseDepth}`,
        `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo`,
        `volume=${settings.musicVolume.toFixed(3)}`,
        `afade=t=in:st=0:d=2`,
        `afade=t=out:st=${fadeOut}:d=2.5[musicraw]`,
      ].join(","),
    );
    if (ducking) {
      chains.push(duck("musicraw", keyLabels[keyIndex]!, "musicmix", 420));
      keyIndex += 1;
    } else {
      chains.push(`[musicraw]anull[musicmix]`);
    }
    mixLabels.push("[musicmix]");
    described.push(recipe.label);
  }

  if (wantsAmbience) {
    const recipe = AMBIENCE[genre];
    inputs.push("-f", "lavfi", "-t", t, "-i", `anoisesrc=color=${recipe.color}:sample_rate=44100:amplitude=0.6`);
    chains.push(
      [
        `[${nextInput}:a]highpass=f=${recipe.highpassHz}`,
        `lowpass=f=${recipe.lowpassHz}`,
        `tremolo=f=${safeTremolo(recipe.swellHz)}:d=${recipe.swellDepth}`,
        `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo`,
        `volume=${settings.ambienceVolume.toFixed(3)}`,
        `afade=t=in:st=0:d=1.5`,
        `afade=t=out:st=${Math.max(duration - 1.5, 0).toFixed(3)}:d=1.5[ambraw]`,
      ].join(","),
    );
    nextInput += 1;
    if (ducking) {
      // Ambience ducks more gently than music so the world never goes silent.
      chains.push(duck("ambraw", keyLabels[keyIndex]!, "ambmix", 700));
      keyIndex += 1;
    } else {
      chains.push(`[ambraw]anull[ambmix]`);
    }
    mixLabels.push("[ambmix]");
    described.push(recipe.label);
  }

  chains.push(
    `${mixLabels.join("")}amix=inputs=${mixLabels.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95[mixout]`,
  );

  return {
    inputs,
    filter: chains.join(";"),
    outputLabel: "[mixout]",
    description: described.length > 0 ? `${genre}: ${described.join(" + ")}` : `${genre}: narration only`,
  };
}
