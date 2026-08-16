/**
 * Phase 1 (AI Director) — shot planning types and the deterministic fallback.
 *
 * Pure module: no database, storage or AI access. It defines the reusable shot
 * metadata every later phase reads (motion engine, transitions, video studio)
 * and can plan a whole project offline when AI is unavailable.
 */

import { CAMERA_MOVES, pickCameraMove, type CameraMove } from "./camera";

export const SHOT_TYPES = [
  "establishing",
  "wide",
  "medium",
  "close_up",
  "extreme_close_up",
  "over_the_shoulder",
  "insert",
] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

export const SHOT_EMOTIONS = [
  "calm",
  "tense",
  "dread",
  "wonder",
  "urgent",
  "triumphant",
  "melancholy",
] as const;
export type ShotEmotion = (typeof SHOT_EMOTIONS)[number];

/** Camera movement vocabulary = the renderer's moves plus a true static hold. */
export const SHOT_CAMERA_MOVEMENTS = ["static", ...CAMERA_MOVES] as const;
export type ShotCameraMovement = CameraMove | "static";

export type ShotPlanEntry = {
  sceneId: string;
  sceneNumber: number;
  shotType: ShotType;
  cameraMovement: ShotCameraMovement;
  /** Intended on-screen time in seconds. Narration length still wins at render time. */
  durationSeconds: number;
  emotion: ShotEmotion;
  /** One-line director's note explaining the choice. */
  note: string;
  source: "ai" | "offline";
};

export const SHOT_DURATION_RANGE = { min: 1.5, max: 14 } as const;

export function isShotType(value: unknown): value is ShotType {
  return typeof value === "string" && (SHOT_TYPES as readonly string[]).includes(value);
}
export function isShotEmotion(value: unknown): value is ShotEmotion {
  return typeof value === "string" && (SHOT_EMOTIONS as readonly string[]).includes(value);
}
export function isCameraMovement(value: unknown): value is ShotCameraMovement {
  return typeof value === "string" && (SHOT_CAMERA_MOVEMENTS as readonly string[]).includes(value);
}

export const clampShotDuration = (seconds: number) =>
  Math.min(SHOT_DURATION_RANGE.max, Math.max(SHOT_DURATION_RANGE.min, Number(seconds.toFixed(2))));

/** Genre-specific defaults the director leans on. */
type GenreProfile = {
  /** Baseline seconds per spoken word — action cuts fast, drama breathes. */
  pace: number;
  defaultEmotion: ShotEmotion;
  favours: ShotType[];
};

const GENRE_PROFILES: Record<string, GenreProfile> = {
  "sci-fi": { pace: 0.42, defaultEmotion: "wonder", favours: ["establishing", "wide", "insert"] },
  horror: { pace: 0.52, defaultEmotion: "dread", favours: ["close_up", "extreme_close_up", "insert"] },
  action: { pace: 0.34, defaultEmotion: "urgent", favours: ["medium", "close_up", "wide"] },
  fantasy: { pace: 0.48, defaultEmotion: "wonder", favours: ["establishing", "wide", "medium"] },
  drama: { pace: 0.46, defaultEmotion: "melancholy", favours: ["medium", "close_up", "over_the_shoulder"] },
};

/** Maps a free-form project genre onto a director profile key. */
export function resolveDirectorGenre(genre: string | null | undefined): keyof typeof GENRE_PROFILES {
  const value = (genre ?? "").toLowerCase();
  if (/sci|space|cyber|tech|mecha|future/.test(value)) return "sci-fi";
  if (/horror|thriller|creep|dark|ghost|zombie/.test(value)) return "horror";
  if (/action|adventure|hero|battle|super/.test(value)) return "action";
  if (/fantasy|myth|magic|fairy|epic/.test(value)) return "fantasy";
  return "drama";
}

const EMOTION_WORDS: [ShotEmotion, RegExp][] = [
  ["dread", /dark|blood|silence|shadow|scream|corpse|alone|whisper|cold/i],
  ["urgent", /run|now|quick|escape|chase|explod|fire|attack|hurry|fight/i],
  ["triumphant", /win|victor|saved|rise|final|hero|freedom|together/i],
  ["tense", /wait|watch|slow|closer|breath|edge|listen|behind/i],
  ["wonder", /light|star|vast|ancient|glow|impossible|beautiful|first time/i],
  ["melancholy", /gone|lost|remember|never|goodbye|empty|rain|alone/i],
];

export type ScenePlanInput = {
  sceneId: string;
  sceneNumber: number;
  title: string;
  narration: string | null;
  dialogue: string | null;
};

/**
 * Deterministic plan used when AI is unavailable, and as the merge base for any
 * field the model leaves out or returns invalid.
 */
export function planScenesOffline(
  scenes: ScenePlanInput[],
  genre: string | null | undefined,
): ShotPlanEntry[] {
  const profile = GENRE_PROFILES[resolveDirectorGenre(genre)]!;

  return scenes.map((scene, index) => {
    const text = `${scene.title} ${scene.narration ?? ""} ${scene.dialogue ?? ""}`.trim();
    const words = text.split(/\s+/).filter(Boolean).length;

    // First scene establishes; a scene carrying dialogue goes tighter on faces.
    const shotType: ShotType =
      index === 0
        ? "establishing"
        : scene.dialogue && scene.dialogue.trim()
          ? profile.favours.includes("over_the_shoulder")
            ? "over_the_shoulder"
            : "close_up"
          : profile.favours[index % profile.favours.length]!;

    const emotion = EMOTION_WORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? profile.defaultEmotion;

    const durationSeconds = clampShotDuration(Math.max(words * profile.pace, 2.5));

    // Tight shots push in; wide shots drift. Falls back to the renderer's own
    // deterministic rotation so neighbouring scenes never repeat a move.
    const cameraMovement: ShotCameraMovement =
      shotType === "extreme_close_up"
        ? "push_in"
        : shotType === "establishing"
          ? "zoom_out"
          : pickCameraMove(scene.sceneId || String(scene.sceneNumber), index);

    return {
      sceneId: scene.sceneId,
      sceneNumber: scene.sceneNumber,
      shotType,
      cameraMovement,
      durationSeconds,
      emotion,
      note: `${shotType.replace(/_/g, " ")} · ${emotion} · ${cameraMovement.replace(/_/g, " ")}`,
      source: "offline" as const,
    };
  });
}

/** Normalises one model-authored shot against the offline baseline. */
export function mergeShot(base: ShotPlanEntry, raw: unknown): ShotPlanEntry {
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Record<string, unknown>;
  const duration = Number(value["durationSeconds"] ?? value["duration"]);
  const note = typeof value["note"] === "string" ? value["note"].trim().slice(0, 200) : "";

  return {
    ...base,
    shotType: isShotType(value["shotType"]) ? value["shotType"] : base.shotType,
    cameraMovement: isCameraMovement(value["cameraMovement"]) ? value["cameraMovement"] : base.cameraMovement,
    emotion: isShotEmotion(value["emotion"]) ? value["emotion"] : base.emotion,
    durationSeconds: Number.isFinite(duration) ? clampShotDuration(duration) : base.durationSeconds,
    note: note || base.note,
    source: "ai",
  };
}

/** The renderer only understands real moves — "static" means motion off. */
export function cameraMoveFor(movement: ShotCameraMovement): CameraMove | null {
  return movement === "static" ? null : movement;
}
