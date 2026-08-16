/**
 * Phase 1 (AI Director) — AI shot planning and persistence.
 *
 * Reads existing scene data (narration, dialogue, title) plus the project genre
 * and produces reusable shot metadata. Scene generation is never touched: this
 * module only writes to the `scene_shots` table.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import {
  clampShotDuration,
  isCameraMovement,
  isShotEmotion,
  isShotType,
  mergeShot,
  planScenesOffline,
  resolveDirectorGenre,
  SHOT_CAMERA_MOVEMENTS,
  SHOT_EMOTIONS,
  SHOT_TYPES,
  type ScenePlanInput,
  type ShotPlanEntry,
} from "./shot-plan";

function parseJsonArray(raw: string): unknown[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Plans every scene. Never throws: any AI failure degrades to the deterministic
 * offline plan, so the caller always gets a complete, usable shot list.
 */
export async function planShots(
  scenes: ScenePlanInput[],
  genre: string | null | undefined,
): Promise<ShotPlanEntry[]> {
  const baseline = planScenesOffline(scenes, genre);
  if (baseline.length === 0) return baseline;

  const key = process.env["GEMINI_API_KEY"];
  if (!key) return baseline;

  try {
    const { createGeminiProvider } = await import("../ai-gateway.server");
    const { streamText } = await import("ai");
    const gateway = createGeminiProvider(key);
    const style = resolveDirectorGenre(genre);

    const result = streamText({
      model: gateway("gemini-3.5-flash"),
      system: [
        "You are a film director planning shots for a motion comic.",
        "For every scene you choose a shot type, a camera movement, an on-screen duration and the dominant emotion.",
        "Rules:",
        "- Reply with JSON only: an array, one object per scene, in the order given.",
        `- Each object: {"sceneNumber":number,"shotType":one of ${SHOT_TYPES.join("|")},"cameraMovement":one of ${SHOT_CAMERA_MOVEMENTS.join("|")},"durationSeconds":number,"emotion":one of ${SHOT_EMOTIONS.join("|")},"note":short reason}`,
        "- Duration must fit the narration length: roughly 0.35-0.55 seconds per spoken word, between 1.5 and 14 seconds.",
        "- Vary shot types and movements across neighbouring scenes; never repeat the same pair twice in a row.",
        "- Open on an establishing or wide shot; go tighter as tension rises.",
        "- Never invent story, characters or dialogue.",
      ].join("\n"),
      prompt: [
        `Genre: ${style}`,
        "",
        "Scenes:",
        ...scenes.map((scene) =>
          [
            `#${scene.sceneNumber} — ${scene.title}`,
            scene.narration ? `Narration: ${scene.narration}` : "Narration: (none)",
            scene.dialogue ? `Dialogue: ${scene.dialogue}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
        "",
        "Return the JSON array now.",
      ].join("\n"),
    });

    const parsed = parseJsonArray(await result.text);
    if (parsed.length === 0) return baseline;

    const byNumber = new Map<number, unknown>();
    parsed.forEach((item, index) => {
      const number =
        item && typeof item === "object" && Number.isFinite(Number((item as Record<string, unknown>)["sceneNumber"]))
          ? Number((item as Record<string, unknown>)["sceneNumber"])
          : (baseline[index]?.sceneNumber ?? -1);
      byNumber.set(number, item);
    });

    return baseline.map((base) => mergeShot(base, byNumber.get(base.sceneNumber)));
  } catch (error) {
    console.warn("[director] shot planning failed, using offline plan", error);
    return baseline;
  }
}

/** Persists the plan, one row per scene (upsert so re-planning is idempotent). */
export async function saveShotPlan(db: PrismaClient, projectId: string, plan: ShotPlanEntry[]) {
  for (const shot of plan) {
    const data = {
      project_id: projectId,
      scene_id: shot.sceneId,
      shot_type: shot.shotType,
      camera_movement: shot.cameraMovement,
      duration_seconds: shot.durationSeconds,
      emotion: shot.emotion,
      note: shot.note,
      source: shot.source,
    };
    await db.sceneShot.upsert({
      where: { scene_id: shot.sceneId },
      create: data,
      update: data,
    });
  }
}

type ShotRow = {
  scene_id: string;
  shot_type: string;
  camera_movement: string;
  duration_seconds: number;
  emotion: string;
  note: string | null;
  source: string;
};

/** Turns a stored row back into validated shot metadata. */
export function rowToShot(row: ShotRow, sceneNumber: number): ShotPlanEntry {
  return {
    sceneId: row.scene_id,
    sceneNumber,
    shotType: isShotType(row.shot_type) ? row.shot_type : "medium",
    cameraMovement: isCameraMovement(row.camera_movement) ? row.camera_movement : "push_in",
    durationSeconds: clampShotDuration(row.duration_seconds),
    emotion: isShotEmotion(row.emotion) ? row.emotion : "calm",
    note: row.note ?? "",
    source: row.source === "ai" ? "ai" : "offline",
  };
}

/** Reusable read for any later phase: sceneId -> shot metadata. */
export async function loadShotPlan(
  db: PrismaClient,
  projectId: string,
): Promise<Map<string, ShotPlanEntry>> {
  const [rows, scenes] = await Promise.all([
    db.sceneShot.findMany({ where: { project_id: projectId } }),
    db.scene.findMany({
      where: { project_id: projectId },
      select: { id: true, scene_number: true },
    }),
  ]);
  const numbers = new Map(scenes.map((scene) => [scene.id, scene.scene_number]));
  return new Map(rows.map((row) => [row.scene_id, rowToShot(row, numbers.get(row.scene_id) ?? 0)]));
}
