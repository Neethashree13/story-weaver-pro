import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ShotPlanEntry } from "./video/shot-plan";

/** Phase 1 (AI Director) — shot plan server functions. */
export type ProjectShotPlan = {
  shots: ShotPlanEntry[];
  totalScenes: number;
  plannedScenes: number;
};

export const getProjectShotPlan = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ projectId: z.string() }).parse(input))
  .handler(async ({ data }): Promise<ProjectShotPlan> => {
    const { getDb } = await import("./db.server");
    const { loadShotPlan } = await import("./video/shot-plan.server");
    const db = getDb();

    const scenes = await db.scene.findMany({
      where: { project_id: data.projectId },
      orderBy: { scene_number: "asc" },
      select: { id: true },
    });
    const plan = await loadShotPlan(db, data.projectId);
    const shots = scenes.map((scene) => plan.get(scene.id)).filter(Boolean) as ShotPlanEntry[];

    return { shots, totalScenes: scenes.length, plannedScenes: shots.length };
  });

export const planProjectShots = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ projectId: z.string() }).parse(input))
  .handler(async ({ data }): Promise<ProjectShotPlan> => {
    const { getDb } = await import("./db.server");
    const { planShots, saveShotPlan } = await import("./video/shot-plan.server");
    const db = getDb();

    const project = await db.project.findUnique({ where: { id: data.projectId } });
    if (!project) throw new Error("Project not found.");

    const scenes = await db.scene.findMany({
      where: { project_id: data.projectId },
      orderBy: { scene_number: "asc" },
      select: { id: true, scene_number: true, title: true, narration: true, dialogue: true },
    });
    if (scenes.length === 0) throw new Error("This project has no scenes to plan yet.");

    const plan = await planShots(
      scenes.map((scene) => ({
        sceneId: scene.id,
        sceneNumber: scene.scene_number,
        title: scene.title,
        narration: scene.narration,
        dialogue: scene.dialogue,
      })),
      project.genre,
    );

    await saveShotPlan(db, data.projectId, plan);
    return { shots: plan, totalScenes: scenes.length, plannedScenes: plan.length };
  });
