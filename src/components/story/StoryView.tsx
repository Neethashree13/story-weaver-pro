import { useMemo } from "react";
import { Camera } from "lucide-react";

type Block =
  | { kind: "chapter"; text: string }
  | { kind: "image"; text: string }
  | { kind: "para"; text: string };

function parse(story: string): Block[] {
  return story
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      if (/^#{1,4}\s/.test(line))
        return { kind: "chapter", text: line.replace(/^#{1,4}\s*/, "") } as Block;
      if (/^\**image prompt:?\**/i.test(line))
        return {
          kind: "image",
          text: line.replace(/^\**image prompt:?\**\s*/i, ""),
        } as Block;
      return { kind: "para", text: line.replace(/\*\*/g, "") } as Block;
    });
}

export function StoryView({ story }: { story: string }) {
  const blocks = useMemo(() => parse(story), [story]);

  return (
    <article className="mx-auto max-w-3xl">
      {blocks.map((b, i) => {
        if (b.kind === "chapter")
          return (
            <h2
              key={i}
              className="mt-14 mb-6 border-b border-border pb-3 text-2xl font-semibold text-primary first:mt-0 sm:text-3xl"
            >
              {b.text}
            </h2>
          );
        if (b.kind === "image")
          return (
            <figure
              key={i}
              className="text-ui my-8 flex gap-3 rounded-lg border border-primary/30 bg-card/70 p-4 text-sm text-muted-foreground"
            >
              <Camera className="mt-0.5 size-4 shrink-0 text-primary" />
              <figcaption>
                <span className="mr-2 font-medium tracking-wide text-primary uppercase">
                  Key frame
                </span>
                {b.text}
              </figcaption>
            </figure>
          );
        return (
          <p key={i} className="mb-5 text-lg leading-relaxed text-foreground/90 sm:text-xl">
            {b.text}
          </p>
        );
      })}
    </article>
  );
}