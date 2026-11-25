/** 清理参考正文尾部与话题胶囊重复的纯 `#标签` / `#关键词[话题]#` 片段。 */
export function formatPreviewBody(rawBody: string | undefined, tags: string[]): string {
  let text = (rawBody ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return "";

  if (tags.length > 0) {
    text = text.replace(/(?:[\s\u200b]*#[^\s#[\]]+(?:\[话题\]#)?)+$/u, "").trim();
    const lines = text.split("\n");
    while (lines.length > 0) {
      const last = lines[lines.length - 1].trim();
      if (!last) {
        lines.pop();
        continue;
      }
      if (/^(?:#[^\s#[\]]+(?:\[话题\]#)?\s*)+$/u.test(last)) {
        lines.pop();
        continue;
      }
      break;
    }
    text = lines.join("\n").trim();
  }

  return text.replace(/#([^\s#[\]]+)\[话题\]#/gu, "#$1").trim();
}
