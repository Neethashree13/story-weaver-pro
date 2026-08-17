/**
 * Shared cinematic-anime art direction.
 * Every image prompt in the app is assembled from these blocks so that
 * lighting, composition and quality never drift between scenes.
 */

export const ANIME_STYLE_BLOCK = [
  "Cinematic anime movie frame, Makoto Shinkai atmosphere with Kyoto Animation character quality.",
  "Soft cinematic lighting, volumetric light shafts, warm interior light against cool ambient shadow,",
  "realistic light falloff and contact shadows, rain or dust motes catching the light where it fits the mood,",
  "detailed expressive eyes with catchlights, natural relaxed poses, hand-painted background art.",
].join(" ");

export const COMPOSITION_BLOCK = [
  "Composition: rule of thirds, clear foreground / midground / background layering with depth haze,",
  "cinematic widescreen framing, shallow depth of field on the focal character,",
  "the background must carry part of the story (props, weather, signage, time of day).",
].join(" ");

export const QUALITY_BLOCK =
  "masterpiece, best quality, ultra detailed, 8k, cinematic, highly detailed, professional anime illustration";

export const NEGATIVE_BLOCK =
  "Avoid entirely: blurry, low quality, bad anatomy, extra fingers, deformed face, duplicate characters, cropped subject, watermark, text, logo, captions, speech bubbles, low detail, flat lighting, poor composition, overexposed, underexposed, 3d render, photo.";

/** Camera choices cycled per scene so a comic never reads as a row of identical shots. */
export const CAMERA_ANGLES = [
  "wide establishing shot, low camera, character small against the environment",
  "medium two-shot at eye level, over-the-shoulder framing",
  "tight emotional close-up, slight dutch tilt, face on the left third",
  "low hero angle looking up, strong rim light",
  "high angle looking down, character isolated in negative space",
  "profile side shot with heavy foreground silhouette framing the subject",
] as const;

export function cameraForScene(sceneNumber: number, offset = 0) {
  return CAMERA_ANGLES[(sceneNumber - 1 + offset + CAMERA_ANGLES.length) % CAMERA_ANGLES.length]!;
}

/** Lighting contrast recipe, also varied per scene to keep the film feeling alive. */
export const LIGHTING_KEYS = [
  "warm golden-hour key light against cool blue shadow",
  "cool moonlight key with a single warm practical lamp in frame",
  "warm neon signage bouncing off wet cool-toned surfaces",
  "overcast diffuse light with one warm window glow",
  "firelight warm key against deep cold night background",
] as const;

export function lightingForScene(sceneNumber: number, offset = 0) {
  return LIGHTING_KEYS[(sceneNumber - 1 + offset + LIGHTING_KEYS.length) % LIGHTING_KEYS.length]!;
}
