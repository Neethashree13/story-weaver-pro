import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ShotPlanEntry } from "./video/shot-plan";

/** Video Studio — one combined read plus manual shot/narration overrides. */
export type StudioScene = {
  sceneId: string;
  sceneNumber: number;
  title: string;
  narration: string;
  dialogue: string;
  imageUrl: string | null;
  audioUrl: string | null;
  audioDurationMs: number | null;
  shot: ShotPlanEntry | null;
};

export type StudioProject = {
  projectId: string;
  title: string;
  genre: string | null;
  scenes: StudioScene[];
};

export const getStudioProject = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ projectId: z.string() }).parse(input))
  .handler(async ({ data }): Promise<StudioProject> => {
    const { getDb } = await import("./db.server");
    const { objectUrl } = await import("./storage.server");
    const { collectSceneTimeline } = await import("./narration.server");
    const { loadShotPlan } = await import("./video/shot-plan.server");
    const db = getDb();

    const project = await db.project.findUnique({ where: { id: data.projectId } });
    if (!project) throw new Error("Project not found.");

    const [rows, scenes, shots] = await Promise.all([
      collectSceneTimeline(db, data.projectId),
      db.scene.findMany({
        where: { project_id: data.projectId },
        orderBy: { scene_number: "asc" },
        select: { id: true, narration: true, dialogue: true },
      }),
      loadShotPlan(db, data.projectId),
    ]);
    const textById = new Map(scenes.map((scene) => [scene.id, scene]));

    return {
      projectId: project.id,
      title: project.title,
      genre: project.genre ?? null,
      scenes: rows.map((row) => ({
        sceneId: row.sceneId,
        sceneNumber: row.sceneNumber,
        title: row.title,
        narration: textById.get(row.sceneId)?.narration ?? "",
        dialogue: textById.get(row.sceneId)?.dialogue ?? "",
        imageUrl: objectUrl(row.imageKey),
        audioUrl: objectUrl(row.audioKey),
        audioDurationMs: row.durationMs,
        shot: shots.get(row.sceneId) ?? null,
      })),
    };
  });

export const updateSceneShot = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        sceneId: z.string(),
        shotType: z.string(),
        cameraMovement: z.string(),
        durationSeconds: z.number(),
        emotion: z.string(),
        note: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ShotPlanEntry> => {
    const { getDb } = await import("./db.server");
    const { rowToShot } = await import("./video/shot-plan.server");
    const {
      isShotType,
      isCameraMovement,
      isShotEmotion,
      clampShotDuration,
    } = await import("./video/shot-plan");
    const db = getDb();

    const scene = await db.scene.findUnique({
      where: { id: data.sceneId },
      select: { id: true, project_id: true, scene_number: true },
    });
    if (!scene) throw new Error("Scene not found.");

    if (!isShotType(data.shotType)) throw new Error("Unknown shot type.");
    if (!isCameraMovement(data.cameraMovement)) throw new Error("Unknown camera movement.");
    if (!isShotEmotion(data.emotion)) throw new Error("Unknown emotion.");

    const values = {
      shot_type: data.shotType,
      camera_movement: data.cameraMovement,
      duration_seconds: clampShotDuration(data.durationSeconds),
      emotion: data.emotion,
      note: data.note ?? "",
      // Manual override — never overwritten silently by a future AI pass label.
      source: "offline",
    };

    const row = await db.sceneShot.upsert({
      where: { scene_id: scene.id },
      create: { project_id: scene.project_id, scene_id: scene.id, ...values },
      update: values,
    });

    return rowToShot(row, scene.scene_number);
  });

export const updateSceneNarration = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ sceneId: z.string(), narration: z.string().max(4000) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { getDb } = await import("./db.server");
    await getDb().scene.update({
      where: { id: data.sceneId },
      data: { narration: data.narration },
    });
    return { ok: true };
  });
