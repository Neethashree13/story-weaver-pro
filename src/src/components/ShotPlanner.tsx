import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProjectShotPlan, planProjectShots } from "@/lib/shots.functions";

const label = (value: string) => value.replace(/_/g, " ");

/** Phase 1 (AI Director) — reusable shot metadata for every scene. */
export function ShotPlanner({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getProjectShotPlan);
  const plan = useServerFn(planProjectShots);

  const planQuery = useQuery({
    queryKey: ["shot-plan", projectId],
    queryFn: () => load({ data: { projectId } }),
  });

  const planMutation = useMutation({
    mutationFn: () => plan({ data: { projectId } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["shot-plan", projectId] }),
  });

  const state = planQuery.data;
  const shots = state?.shots ?? [];

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl">Shot plan</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The AI director reads each scene's narration, dialogue and the project genre, then sets a
            shot type, camera movement, duration and emotion. Stored as reusable shot metadata.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {state ? (
            <span className="rounded-sm border border-border px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {state.plannedScenes}/{state.totalScenes} scenes planned
            </span>
          ) : null}
          <button
            type="button"
            disabled={planMutation.isPending}
            onClick={() => planMutation.mutate()}
            className="rounded-sm bg-primary px-6 py-3 font-display text-lg tracking-wider text-primary-foreground disabled:opacity-40"
          >
            {planMutation.isPending
              ? "Planning shots…"
              : shots.length > 0
                ? "Re-plan shots"
                : "Plan shots"}
          </button>
        </div>
      </div>

      {planMutation.isError ? (
        <p className="mt-4 text-sm text-destructive">
          {(planMutation.error as Error).message}
        </p>
      ) : null}

      {shots.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          No shots planned yet. Plan the shots to give every scene a deliberate camera.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shots.map((shot) => (
            <li key={shot.sceneId} className="rounded-sm border border-border p-5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <span>Scene {shot.sceneNumber}</span>
                <span className="text-primary">{shot.durationSeconds.toFixed(1)}s</span>
              </div>
              <p className="mt-3 font-display text-xl capitalize tracking-wider">
                {label(shot.shotType)}
              </p>
              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between gap-3">
                  <dt>Camera</dt>
                  <dd className="capitalize text-foreground">{label(shot.cameraMovement)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Emotion</dt>
                  <dd className="capitalize text-foreground">{shot.emotion}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Source</dt>
                  <dd className="text-foreground">{shot.source === "ai" ? "AI director" : "Fallback"}</dd>
                </div>
              </dl>
              {shot.note ? <p className="mt-3 text-[11px] text-muted-foreground">{shot.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
