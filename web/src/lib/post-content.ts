
export function cleanPostContent(text: string): string {
  return text.replace(/#[^#\r\n]+?\[话题\]#/g, "").trim();
}
export function isImagePath(value: unknown): value is string {
  return typeof value === "string" && /^\/imported-media\/[a-f0-9]{24}\.(jpg|png|webp|gif|avif)$/.test(value);
}
