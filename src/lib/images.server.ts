import {
  ANIME_STYLE_BLOCK,
  COMPOSITION_BLOCK,
  NEGATIVE_BLOCK,
  QUALITY_BLOCK,
  cameraForScene,
  lightingForScene,
} from "./cinematic";
import { IMAGE_MODEL } from "./ai-models";
import { characterDescriptor as fullDescriptor, type CharacterDetail as FullCharacter } from "./characters.server";

export type CharacterDetail = Partial<FullCharacter> & { id?: string; name: string };

/** Canonical, repeatable description of a character — identical text in every prompt. */
export function characterDescriptor(character: CharacterDetail) {
  return fullDescriptor({
    name: character.name,
    role: character.role ?? null,
    appearance: character.appearance ?? null,
    hair: character.hair ?? null,
    hair_color: character.hair_color ?? null,
    eye_color: character.eye_color ?? null,
    clothing: character.clothing ?? null,
    accessories: character.accessories ?? null,
    colors: character.colors ?? null,
    age: character.age ?? null,
    personality: character.personality ?? null,
    backstory: null,
    traits: character.traits ?? [],
    is_locked: Boolean(character.is_locked),
  });
}

type SceneRow = {
  scene_number: number;
  title: string;
  narration: string | null;
  dialogue: string | null;
  /** Scene-specific visual brief written during story generation. */
  panel_prompt?: string | null;
};

type ProjectRow = {
  title: string;
  genre: string;
  art_style: string;
  logline: string | null;
};

export function characterSheet(characters: CharacterDetail[]) {
  return characters.map((character) => characterDescriptor(character)).join("\n");
}

/** Characters actually mentioned in this scene — prevents crowding every frame with the full cast. */
function charactersInScene(scene: SceneRow, characters: CharacterDetail[]) {
  const haystack = `${scene.title} ${scene.narration ?? ""} ${scene.dialogue ?? ""} ${scene.panel_prompt ?? ""}`.toLowerCase();
  const present = characters.filter((character) =>
    character.name ? haystack.includes(character.name.toLowerCase()) : false,
  );
  return present.length ? present : characters.slice(0, 2);
}

/**
 * Builds a cinematic anime scene prompt.
 *
 * Order matters: subject and story beat first, then locked character identity,
 * then camera/light/composition, then quality tokens, then the negative list.
 */
export function buildScenePrompt(
  project: ProjectRow,
  scene: SceneRow,
  characters: CharacterDetail[],
  variantHint?: string,
  referencedNames: string[] = [],
) {
  const cast = charactersInScene(scene, characters);
  const sheet = characterSheet(cast);
  const variantOffset = variantHint ? 2 : 0;

  return [
    `${ANIME_STYLE_BLOCK} Art style: ${project.art_style}. Genre mood: ${project.genre}.`,
    "",
    `SCENE ${scene.scene_number} — ${scene.title}`,
    scene.panel_prompt ? `Visual brief: ${scene.panel_prompt}` : "",
    scene.narration ? `What is happening: ${scene.narration}` : "",
    scene.dialogue
      ? `Emotional beat (render the feeling through faces and body language, never as text): ${scene.dialogue}`
      : "",
    "",
    sheet
      ? `CHARACTER CONTINUITY — render these exact faces, hair, clothing, accessories and colours with zero deviation:\n${sheet}`
      : "",
    referencedNames.length
      ? `Reference sheets are attached for: ${referencedNames.join(", ")}. The references define identity (face, hair, outfit, palette); this scene defines only pose, expression, setting and light.`
      : "",
    cast.length ? `Only these characters appear in frame: ${cast.map((c) => c.name).join(", ")}. No extra duplicated characters.` : "",
    "",
    `Camera: ${cameraForScene(scene.scene_number, variantOffset)}.`,
    `Lighting: ${lightingForScene(scene.scene_number, variantOffset)}.`,
    COMPOSITION_BLOCK,
    "Consistent line weight, consistent colour grading and consistent character design across the whole film.",
    variantHint ? `Alternate take: ${variantHint}` : "",
    "",
    QUALITY_BLOCK,
    NEGATIVE_BLOCK,
  ]
    .filter(Boolean)
    .join("\n");
}

export const VARIANT_HINTS = [
  "wider establishing framing, more environment storytelling",
  "tight dramatic close-up on the emotional focal character",
  "low hero angle with heavier rim light and deeper shadow",
  "over-the-shoulder framing with a richer foreground layer",
  "high bird's-eye staging with stronger warm/cool colour separation",
];

export function bytesToDataUrl(bytes: Uint8Array, mime = "image/png") {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return `data:${mime};base64,${btoa(binary)}`;
}

function b64ToBytes(b64: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Primary generator: Lovable AI Gateway image model.
 * It is the only path that can consume approved character reference sheets,
 * which is what keeps a character identical from scene to scene.
 */
async function generateViaGateway(prompt: string, references: string[]): Promise<Uint8Array> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY is not configured.");

  const content = references.length
    ? [
        { type: "text", text: prompt },
        ...references.map((url) => ({ type: "image_url", image_url: { url } })),
      ]
    : prompt;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 429) throw new Error("Image service is rate limited. Try again shortly.");
    if (response.status === 402) throw new Error("AI credits are exhausted. Add credits to keep generating.");
    throw new Error(`Image generation failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { data?: { b64_json?: string; url?: string }[] };
  const first = payload.data?.[0];
  if (first?.b64_json) return b64ToBytes(first.b64_json);
  if (first?.url) {
    const remote = await fetch(first.url);
    if (!remote.ok) throw new Error("Could not download the generated image.");
    return new Uint8Array(await remote.arrayBuffer());
  }
  throw new Error("The image service returned no image data.");
}

/** Last-resort fallback so a render never dies outright. Cannot use references. */
async function generateViaPollinations(prompt: string): Promise<Uint8Array> {
  const encoded = encodeURIComponent(prompt.slice(0, 1800));
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1280&height=720&nologo=true&enhance=true`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fallback image service returned ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Generates image bytes for a prompt, conditioning on approved character
 * reference art when it is available.
 */
export async function generateImageBytes(
  prompt: string,
  _apiKey: string,
  references: string[] = [],
): Promise<Uint8Array> {
  try {
    const bytes = await generateViaGateway(prompt, references);
    console.log(`[generateImageBytes] ✅ gateway image (${bytes.byteLength} bytes, ${references.length} refs)`);
    return bytes;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[generateImageBytes] gateway failed, falling back:", message);
    const bytes = await generateViaPollinations(prompt);
    console.log(`[generateImageBytes] ✅ fallback image (${bytes.byteLength} bytes)`);
    return bytes;
  }
}
