import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { CINEMATIC_SYSTEM_PROMPT } from "@/lib/story-prompt";

const Body = z.object({
  idea: z.string().min(3).max(4000),
  tone: z.string().max(100).default("Melancholic & tender"),
  length: z.string().max(100).default("5 chapters, roughly 1800 words"),
  setting: z.string().max(300).optional().default(""),
});

export const Route = createFileRoute("/api/story")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing AI key", { status: 500 });

        const parsed = Body.safeParse(await request.json());
        if (!parsed.success) return new Response("Invalid input", { status: 400 });
        const { idea, tone, length, setting } = parsed.data;

        const gateway = createLovableAiGatewayProvider(key);

        try {
          const result = streamText({
            model: gateway("google/gemini-3.6-flash"),
            system: CINEMATIC_SYSTEM_PROMPT,
            prompt: [
              `Story premise: ${idea}`,
              setting ? `Setting / world: ${setting}` : "",
              `Emotional tone: ${tone}`,
              `Target length: ${length}.`,
              "Write the full story now.",
            ]
              .filter(Boolean)
              .join("\n"),
            abortSignal: request.signal,
          });

          return result.toTextStreamResponse();
        } catch (err) {
          const status =
            typeof err === "object" && err && "statusCode" in err
              ? Number((err as { statusCode?: number }).statusCode) || 500
              : 500;
          const message =
            status === 429
              ? "The story engine is busy. Please try again in a moment."
              : status === 402
                ? "AI credits are exhausted. Add credits to keep writing."
                : "The story engine failed. Please try again.";
          return new Response(message, { status });
        }
      },
    },
  },
});