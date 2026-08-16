import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/SiteHeader";
import { VideoStudio } from "@/components/VideoStudio";
import {
  getStudioProject,
  updateSceneNarration,
  updateSceneShot,
  type StudioScene,
} from "@/lib/studio.functions";
import { planProjectShots } from "@/lib/shots.functions";
import { generateSceneNarration } from "@/lib/narration.functions";
import {
  SHOT_CAMERA_MOVEMENTS,
  SHOT_EMOTIONS,
  SHOT_TYPES,
} from "@/lib/video/shot-plan";

export const Route = createFileRoute("/studio/$projectId")({
  head: () => ({
    meta: [
      { title: "Video studio — ComicVerse AI" },
      {
        name: "description",
        content:
          "Preview your motion comic, edit shot metadata and narration per scene, then render the final video with progress tracking.",
      },
      { property: "og:title", content: "Video studio — ComicVerse AI" },
      {
        property: "og:description",
        content: "Preview player, shot editor, narration editor and render controls in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioPage,
});

const label = (value: string) => value.replace(/_/g, " ");

const selectClass =
  "mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm capitalize";

function SceneEditor({
  scene,
  projectId,
  active,
  onSelect,
}: {
  scene: StudioScene;
  projectId: string;
  active: boolean;
  onSelect: () => void;
}) {
  const queryClient = useQueryClient();
  const saveShot = useServerFn(updateSceneShot);
  const saveNarration = useServerFn(updateSceneNarration);
  const narrate = useServerFn(generateSceneNarration);

  const [shotType, setShotType] = useState(scene.shot?.shotType ?? "medium");
  const [cameraMovement, setCameraMovement] = useState(scene.shot?.cameraMovement ?? "push_in");
  const [emotion, setEmotion] = useState(scene.shot?.emotion ?? "calm");
  const [duration, setDuration] = useState(scene.shot?.durationSeconds ?? 4);
  const [narration, setNarration] = useState(scene.narration);

  // Keep the editors in sync when the combined read refreshes.
  useEffect(() => {
    setShotType(scene.shot?.shotType ?? "medium");
    setCameraMovement(scene.shot?.cameraMovement ?? "push_in");
    setEmotion(scene.shot?.emotion ?? "calm");
    setDuration(scene.shot?.durationSeconds ?? 4);
  }, [scene.shot]);
  useEffect(() => setNarration(scene.narration), [scene.narration]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["studio", projectId] });

  const shotMutation = useMutation({
    mutationFn: () =>
      saveShot({
        data: {
          sceneId: scene.sceneId,
          shotType,
          cameraMovement,
          emotion,
          durationSeconds: Number(duration),
          note: scene.shot?.note ?? "",
        },
      }),
    onSettled: refresh,
  });

  const narrationMutation = useMutation({
    mutationFn: () => saveNarration({ data: { sceneId: scene.sceneId, narration } }),
    onSettled: refresh,
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      await saveNarration({ data: { sceneId: scene.sceneId, narration } });
      return narrate({ data: { sceneId: scene.sceneId, regenerate: true } });
    },
    onSettled: refresh,
  });

  return (
    <li
      className={`rounded-sm border p-5 ${active ? "border-primary" : "border-border"}`}
      onFocus={onSelect}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="text-left font-display text-xl tracking-wider"
        >
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Scene {scene.sceneNumber}
          </span>
          <span className="block">{scene.title}</span>
        </button>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {scene.imageUrl ? "Image ready" : "No image"} ·{" "}
          {scene.audioUrl ? "Narration ready" : "No narration"}
        </span>
      </div>

      {/* Shot editor */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Shot type
          <select
            value={shotType}
            onChange={(event) => setShotType(event.target.value as typeof shotType)}
            className={selectClass}
          >
            {SHOT_TYPES.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Camera movement
          <select
            value={cameraMovement}
            onChange={(event) => setCameraMovement(event.target.value as typeof cameraMovement)}
            className={selectClass}
          >
            {SHOT_CAMERA_MOVEMENTS.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Emotion
          <select
            value={emotion}
            onChange={(event) => setEmotion(event.target.value as typeof emotion)}
            className={selectClass}
          >
            {SHOT_EMOTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Duration (s)
          <input
            type="number"
            min={1.5}
            max={14}
            step={0.5}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={shotMutation.isPending}
          onClick={() => shotMutation.mutate()}
          className="rounded-sm border border-primary/60 px-5 py-2 text-xs uppercase tracking-[0.2em] text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
        >
          {shotMutation.isPending ? "Saving…" : "Save shot"}
        </button>
        {scene.shot ? (
          <span className="text-[11px] text-muted-foreground">
            {scene.shot.source === "ai" ? "AI director" : "Manual override"}
            {scene.shot.note ? ` — ${scene.shot.note}` : ""}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">No shot metadata yet.</span>
        )}
      </div>

      {/* Narration editor */}
      <div className="mt-5 border-t border-border pt-4">
        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Narration
          <textarea
            value={narration}
            rows={4}
            onChange={(event) => setNarration(event.target.value)}
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={narrationMutation.isPending || narration === scene.narration}
            onClick={() => narrationMutation.mutate()}
            className="rounded-sm border border-border px-5 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40"
          >
            {narrationMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={regenerateMutation.isPending}
            onClick={() => regenerateMutation.mutate()}
            className="rounded-sm bg-primary px-5 py-2 text-xs uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-40"
          >
            {regenerateMutation.isPending ? "Regenerating…" : "Regenerate narration"}
          </button>
          {scene.audioUrl ? (
            <audio key={scene.audioUrl} src={scene.audioUrl} controls className="h-9" />
          ) : null}
        </div>
        {regenerateMutation.isError ? (
          <p className="mt-2 text-xs text-destructive">
            {(regenerateMutation.error as Error).message}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function StudioPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const load = useServerFn(getStudioProject);
  const plan = useServerFn(planProjectShots);
  const [activeScene, setActiveScene] = useState(0);

  const studioQuery = useQuery({
    queryKey: ["studio", projectId],
    queryFn: () => load({ data: { projectId } }),
  });

  const planMutation = useMutation({
    mutationFn: () => plan({ data: { projectId } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["studio", projectId] }),
  });

  const project = studioQuery.data;
  const scenes = project?.scenes ?? [];
  const current = scenes[Math.min(activeScene, Math.max(scenes.length - 1, 0))] ?? null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Video studio
            </p>
            <h1 className="mt-2 font-display text-4xl tracking-wider">
              {project?.title ?? "Loading…"}
            </h1>
            {project?.genre ? (
              <p className="mt-2 text-sm capitalize text-muted-foreground">{project.genre}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/project/$projectId"
              params={{ projectId }}
              className="rounded-sm border border-border px-5 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:border-primary hover:text-primary"
            >
              Back to project
            </Link>
            <button
              type="button"
              disabled={planMutation.isPending || scenes.length === 0}
              onClick={() => planMutation.mutate()}
              className="rounded-sm border border-primary/60 px-5 py-3 text-xs uppercase tracking-[0.2em] text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
            >
              {planMutation.isPending ? "Planning…" : "Plan with AI"}
            </button>
          </div>
        </div>

        {studioQuery.isError ? (
          <p className="mt-6 text-sm text-destructive">
            {(studioQuery.error as Error).message}
          </p>
        ) : null}

        {/* Preview player — scene-by-scene fallback until a video exists. */}
        <section className="mt-10">
          <h2 className="text-3xl">Preview</h2>
          {current ? (
            <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
              <div className="rounded-sm border border-border p-4">
                {current.imageUrl ? (
                  <img
                    src={current.imageUrl}
                    alt={`Scene ${current.sceneNumber} — ${current.title}`}
                    className="w-full rounded-sm"
                    loading="lazy"
                  />
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    No image generated for this scene yet.
                  </p>
                )}
                {current.audioUrl ? (
                  <audio
                    key={current.audioUrl}
                    src={current.audioUrl}
                    controls
                    className="mt-4 w-full"
                  />
                ) : null}
                <p className="mt-4 text-sm text-muted-foreground">{current.narration}</p>
              </div>
              <ul className="grid max-h-[520px] grid-cols-3 gap-3 overflow-y-auto lg:grid-cols-2">
                {scenes.map((scene, index) => (
                  <li key={scene.sceneId}>
                    <button
                      type="button"
                      onClick={() => setActiveScene(index)}
                      className={`w-full overflow-hidden rounded-sm border text-left ${
                        index === activeScene ? "border-primary" : "border-border"
                      }`}
                    >
                      {scene.imageUrl ? (
                        <img
                          src={scene.imageUrl}
                          alt={`Scene ${scene.sceneNumber} thumbnail`}
                          className="aspect-square w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex aspect-square items-center justify-center text-xs text-muted-foreground">
                          {scene.sceneNumber}
                        </span>
                      )}
                      <span className="block px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Scene {scene.sceneNumber}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              {studioQuery.isLoading ? "Loading scenes…" : "This project has no scenes yet."}
            </p>
          )}
        </section>

        {/* Shot + narration editors */}
        <section className="mt-14">
          <h2 className="text-3xl">Scene editor</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Shot metadata drives the camera at render time; narration edits feed the existing TTS
            pipeline.
          </p>
          <ul className="mt-6 space-y-4">
            {scenes.map((scene, index) => (
              <SceneEditor
                key={scene.sceneId}
                scene={scene}
                projectId={projectId}
                active={index === activeScene}
                onSelect={() => setActiveScene(index)}
              />
            ))}
          </ul>
        </section>

        {/* Render controls + progress tracking (shared with the project page) */}
        <VideoStudio projectId={projectId} />
      </main>
    </div>
  );
}
