CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL DEFAULT 'Untitled story',
    "logline" TEXT,
    "idea" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "length" TEXT NOT NULL,
    "art_style" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "ending" TEXT,
    "status" TEXT NOT NULL DEFAULT 'story',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);
GRANT ALL ON public."projects" TO service_role;

CREATE TABLE "characters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "appearance" TEXT,
    "traits" JSONB NOT NULL DEFAULT '[]',
    "hair" TEXT,
    "hair_color" TEXT,
    "eye_color" TEXT,
    "clothing" TEXT,
    "accessories" TEXT,
    "colors" TEXT,
    "age" TEXT,
    "personality" TEXT,
    "backstory" TEXT,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);
GRANT ALL ON public."characters" TO service_role;

CREATE TABLE "scenes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "scene_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "narration" TEXT,
    "dialogue" TEXT,
    "music" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);
GRANT ALL ON public."scenes" TO service_role;

CREATE TABLE "panels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "scene_id" UUID NOT NULL,
    "panel_number" INTEGER NOT NULL,
    "image_prompt" TEXT NOT NULL,
    "caption" TEXT,
    "image_url" TEXT,
    "image_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "panels_pkey" PRIMARY KEY ("id")
);
GRANT ALL ON public."panels" TO service_role;

CREATE TABLE "generated_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "scene_id" UUID NOT NULL,
    "image_url" TEXT,
    "image_prompt" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "error_message" TEXT,
    "is_selected" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "generated_images_pkey" PRIMARY KEY ("id")
);
GRANT ALL ON public."generated_images" TO service_role;

CREATE TABLE "character_reference_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "character_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "image_url" TEXT,
    "image_prompt" TEXT NOT NULL,
    "view_type" TEXT NOT NULL DEFAULT 'front',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "error_message" TEXT,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "character_reference_images_pkey" PRIMARY KEY ("id")
);
GRANT ALL ON public."character_reference_images" TO service_role;

CREATE TABLE "scene_audio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "scene_id" UUID NOT NULL,
    "audio_url" TEXT,
    "narration_text" TEXT NOT NULL,
    "voice" TEXT NOT NULL DEFAULT 'alloy',
    "provider" TEXT NOT NULL DEFAULT 'lovable',
    "format" TEXT NOT NULL DEFAULT 'mp3',
    "duration_ms" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "is_selected" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "scene_audio_pkey" PRIMARY KEY ("id")
);
GRANT ALL ON public."scene_audio" TO service_role;

CREATE TABLE "video_renders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "video_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "video_renders_pkey" PRIMARY KEY ("id")
);
GRANT ALL ON public."video_renders" TO service_role;

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
GRANT ALL ON public."scene_shots" TO service_role;

CREATE INDEX "projects_updated_at_idx" ON "projects"("updated_at" DESC);
CREATE INDEX "characters_project_id_sort_order_idx" ON "characters"("project_id", "sort_order");
CREATE INDEX "scenes_project_id_scene_number_idx" ON "scenes"("project_id", "scene_number");
CREATE INDEX "panels_project_id_panel_number_idx" ON "panels"("project_id", "panel_number");
CREATE INDEX "generated_images_scene_id_version_idx" ON "generated_images"("scene_id", "version" DESC);
CREATE INDEX "generated_images_project_id_idx" ON "generated_images"("project_id");
CREATE INDEX "character_reference_images_character_id_view_type_version_idx" ON "character_reference_images"("character_id", "view_type", "version");
CREATE INDEX "scene_audio_scene_id_version_idx" ON "scene_audio"("scene_id", "version" DESC);
CREATE INDEX "scene_audio_project_id_idx" ON "scene_audio"("project_id");
CREATE INDEX "video_renders_project_id_created_at_idx" ON "video_renders"("project_id", "created_at" DESC);
CREATE UNIQUE INDEX "scene_shots_scene_id_key" ON "scene_shots"("scene_id");
CREATE INDEX "scene_shots_project_id_idx" ON "scene_shots"("project_id");

ALTER TABLE "characters" ADD CONSTRAINT "characters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "panels" ADD CONSTRAINT "panels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "panels" ADD CONSTRAINT "panels_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_reference_images" ADD CONSTRAINT "character_reference_images_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_reference_images" ADD CONSTRAINT "character_reference_images_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scene_audio" ADD CONSTRAINT "scene_audio_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scene_audio" ADD CONSTRAINT "scene_audio_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_renders" ADD CONSTRAINT "video_renders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scene_shots" ADD CONSTRAINT "scene_shots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scene_shots" ADD CONSTRAINT "scene_shots_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "characters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scenes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "panels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "generated_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "character_reference_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scene_audio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "video_renders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scene_shots" ENABLE ROW LEVEL SECURITY;