-- Phase 1 (AI Director): reusable per-scene shot metadata.
CREATE TABLE "scene_shots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "scene_id" UUID NOT NULL,
    "shot_type" TEXT NOT NULL,
    "camera_movement" TEXT NOT NULL,
    "duration_seconds" DOUBLE PRECISION NOT NULL,
    "emotion" TEXT NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "scene_shots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scene_shots_scene_id_key" ON "scene_shots"("scene_id");
CREATE INDEX "scene_shots_project_id_idx" ON "scene_shots"("project_id");

ALTER TABLE "scene_shots" ADD CONSTRAINT "scene_shots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scene_shots" ADD CONSTRAINT "scene_shots_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
