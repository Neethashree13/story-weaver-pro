import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Clapperboard, Loader2, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StoryView } from "@/components/story/StoryView";
import { LENGTHS, TONES } from "@/lib/story-prompt";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Motion Comic Studio — Cinematic Story Generator" },
      {
        name: "description",
        content:
          "Turn a single idea into a long-form cinematic story with scene-by-scene atmosphere, natural dialogue, and ready-to-use image prompts.",
      },
      { property: "og:title", content: "Motion Comic Studio — Cinematic Story Generator" },
      {
        property: "og:description",
        content:
          "Write immersive, movie-like chapters with sensory detail and key-frame image prompts for narration and art.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [idea, setIdea] = useState("");
  const [setting, setSetting] = useState("");
  const [tone, setTone] = useState<string>(TONES[0]);
  const [length, setLength] = useState<string>(LENGTHS[1].value);
  const [story, setStory] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function generate() {
    if (!idea.trim() || loading) return;
    setLoading(true);
    setError("");
    setStory("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, setting, tone, length }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setError((await res.text()) || "The story engine failed. Please try again.");
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        setStory((prev) => prev + value);
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError")
        setError("Connection lost while writing the story.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <main className="grain min-h-screen">
      <div className="grain-overlay fixed inset-0 z-50" aria-hidden />

      <header className="mx-auto max-w-5xl px-6 pt-16 pb-10 text-center">
        <p className="text-ui text-xs tracking-[0.35em] text-primary uppercase">
          Motion Comic Studio
        </p>
        <h1 className="mt-4 text-4xl leading-tight sm:text-6xl">
          Every chapter, a movie scene
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground italic">
          Give it a spark. It returns weather, lighting, breath, dialogue — and the key frame
          to draw.
        </p>
      </header>

      <section className="mx-auto max-w-3xl px-6">
        <div className="shadow-projector rounded-xl border border-border bg-card/80 p-6 backdrop-blur-sm">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="idea" className="text-ui">
                Story premise
              </Label>
              <Textarea
                id="idea"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                rows={4}
                placeholder="A lighthouse keeper receives a letter from someone who drowned twelve years ago."
                className="text-ui resize-none bg-background/60"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setting" className="text-ui">
                Setting or world <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="setting"
                value={setting}
                onChange={(e) => setSetting(e.target.value)}
                placeholder="Rain-soaked coastal town, late autumn, 1974"
                className="text-ui bg-background/60"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-ui">Emotional tone</Label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={tone === t ? "default" : "outline"}
                    className="text-ui"
                    onClick={() => setTone(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-ui">Runtime</Label>
              <div className="flex flex-wrap gap-2">
                {LENGTHS.map((l) => (
                  <Button
                    key={l.value}
                    type="button"
                    size="sm"
                    variant={length === l.value ? "default" : "outline"}
                    className="text-ui"
                    onClick={() => setLength(l.value)}
                  >
                    {l.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={generate}
                disabled={loading || !idea.trim()}
                size="lg"
                className="text-ui flex-1"
              >
                {loading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Clapperboard />
                )}
                {loading ? "Rolling camera…" : "Generate the story"}
              </Button>
              {loading && (
                <Button
                  size="lg"
                  variant="outline"
                  className="text-ui"
                  onClick={() => abortRef.current?.abort()}
                >
                  <Square /> Cut
                </Button>
              )}
            </div>

            {error && (
              <p className="text-ui text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        {story ? (
          <div className="shadow-projector rounded-xl border border-border bg-card/60 px-6 py-10 backdrop-blur-sm sm:px-12">
            <StoryView story={story} />
            {loading && (
              <span className="ml-1 inline-block h-5 w-2 animate-pulse bg-primary align-middle" />
            )}
          </div>
        ) : (
          !loading && (
            <p className="text-ui flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4 text-primary" />
              Your scene will appear here, chapter by chapter.
            </p>
          )
        )}
      </section>
    </main>
  );
}
