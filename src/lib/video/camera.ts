/**
 * Phase 1 — Cinematic camera motion (Ken Burns) for the comic video renderer.
 *
 * Pure, dependency-free helpers that turn a scene into an FFmpeg `zoompan`
 * filter so every still image drifts/zooms while its narration plays.
 * No database, storage or AI access here on purpose — later phases (the AI
 * director) only need to pick a `CameraMove` and pass it in.
 */

export const CAMERA_MOVES = [
  "zoom_in",
  "zoom_out",
  "pan_left",
  "pan_right",
  "push_in",
] as const;

export type CameraMove = (typeof CAMERA_MOVES)[number];

export type CameraOptions = {
  width: number;
  height: number;
  fps: number;
  /** Segment length in seconds (matches the narration duration). */
  durationSeconds: number;
  move: CameraMove;
  /** Supersampling factor before zoompan — keeps motion from looking crunchy. */
  supersample?: number;
};

/** Deterministic hash so the same scene always gets the same camera move. */
function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

/**
 * Picks one motion style per scene. Deterministic (stable re-renders) and
 * rotated so neighbouring scenes never repeat the same move.
 */
export function pickCameraMove(seed: string, index = 0): CameraMove {
  const offset = (hash(seed) + index) % CAMERA_MOVES.length;
  return CAMERA_MOVES[offset]!;
}

/** Smoothstep easing expression on progress `p` (0 → 1). */
function eased(progress: string): string {
  return `(${progress}*${progress}*(3-2*${progress}))`;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Builds the FFmpeg filter fragment (scale → pad → zoompan) that applies the
 * chosen camera move. Motion always spans the full segment, so the pacing
 * follows the narration length automatically.
 */
export function buildCameraFilter(options: CameraOptions): string {
  const { width, height, fps, move } = options;
  const supersample = options.supersample ?? 2;
  const duration = Math.max(options.durationSeconds, 0.5);
  const frames = Math.max(Math.round(duration * fps), 2);
  const progress = `(on/${frames - 1})`;
  const ease = eased(progress);

  // Longer scenes travel slightly further, but stay within a tasteful range.
  const travel = clampNumber(0.10 + duration * 0.012, 0.10, 0.28);

  const bigWidth = Math.round(width * supersample);
  const bigHeight = Math.round(height * supersample);

  let zoomExpression: string;
  let xExpression: string;
  let yExpression: string;

  switch (move) {
    case "zoom_out": {
      const max = 1 + travel;
      zoomExpression = `${max.toFixed(4)}-${travel.toFixed(4)}*${ease}`;
      xExpression = "iw/2-(iw/zoom/2)";
      yExpression = "ih/2-(ih/zoom/2)";
      break;
    }
    case "push_in": {
      // Tighter, more aggressive move that also drifts up towards the subject.
      const max = 1 + travel * 1.6;
      zoomExpression = `1+${(max - 1).toFixed(4)}*${ease}`;
      xExpression = "iw/2-(iw/zoom/2)";
      yExpression = `ih/2-(ih/zoom/2)-(ih*0.05*${ease})`;
      break;
    }
    case "pan_left": {
      const zoom = (1 + travel).toFixed(4);
      zoomExpression = zoom;
      xExpression = `(iw-iw/zoom)*(1-${ease})`;
      yExpression = "ih/2-(ih/zoom/2)";
      break;
    }
    case "pan_right": {
      const zoom = (1 + travel).toFixed(4);
      zoomExpression = zoom;
      xExpression = `(iw-iw/zoom)*${ease}`;
      yExpression = "ih/2-(ih/zoom/2)";
      break;
    }
    case "zoom_in":
    default: {
      zoomExpression = `1+${travel.toFixed(4)}*${ease}`;
      xExpression = "iw/2-(iw/zoom/2)";
      yExpression = "ih/2-(ih/zoom/2)";
      break;
    }
  }

  // Commas inside expressions would break the filter chain, so none are used.
  return [
    `scale=${bigWidth}:${bigHeight}:force_original_aspect_ratio=decrease`,
    `pad=${bigWidth}:${bigHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "setsar=1",
    [
      `zoompan=z='${zoomExpression}'`,
      `x='${xExpression}'`,
      `y='${yExpression}'`,
      `d=${frames}`,
      `s=${width}x${height}`,
      `fps=${fps}`,
    ].join(":"),
  ].join(",");
}
