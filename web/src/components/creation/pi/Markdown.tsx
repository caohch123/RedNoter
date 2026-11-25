"use client";

import { Fragment, type ReactNode } from "react";
import styles from "./pi.module.css";

/**
 * 只覆盖模型实际会用的那一小撮写法：标题、列表、引用、围栏代码、粗斜体、行内代码、链接。
 * 全部走 React 元素，不拼 HTML 字符串，模型输出里的尖括号不会被当成标签。
 */
type Block =
  | { type: "code"; lang: string; lines: string[] }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; ordered: boolean; start: number; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "rule" }
  | { type: "paragraph"; lines: string[] };

const HEADING = /^(#{1,6})\s+(.*)$/u;
const FENCE = /^```([\w+-]*)\s*$/u;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/u;
const QUOTE = /^\s*>\s?(.*)$/u;
const BULLET = /^\s*[-*+]\s+(.*)$/u;
const ORDERED = /^\s*(\d{1,3})[.)]\s+(.*)$/u;

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(FENCE);
    if (fence) {
      flush();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", lang: fence[1], lines: body });
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    const heading = line.match(HEADING);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }
    if (RULE.test(line)) { flush(); blocks.push({ type: "rule" }); continue; }
    const quote = line.match(QUOTE);
    if (quote) {
      flush();
      const body = [quote[1]];
      while (index + 1 < lines.length && QUOTE.test(lines[index + 1])) {
        index += 1;
        body.push(lines[index].match(QUOTE)![1]);
      }
      blocks.push({ type: "quote", lines: body });
      continue;
    }
    const bullet = line.match(BULLET);
    const ordered = line.match(ORDERED);
    if (bullet || ordered) {
      flush();
      const isOrdered = Boolean(ordered);
      const items = [(bullet ?? ordered)![isOrdered ? 2 : 1]];
      const start = ordered ? Number(ordered[1]) : 1;
      while (index + 1 < lines.length) {
        const next = lines[index + 1];
        const nextBullet = isOrdered ? null : next.match(BULLET);
        const nextOrdered = isOrdered ? next.match(ORDERED) : null;
        if (!nextBullet && !nextOrdered) break;
        index += 1;
        items.push((nextBullet ?? nextOrdered)![isOrdered ? 2 : 1]);
      }
      blocks.push({ type: "list", ordered: isOrdered, start, items });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|~~[^~\n]+~~|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/gu;

/** 行内标记：粗体、行内代码、斜体、删除线、链接。匹配不到的按原文输出。 */
function inline(text: string): ReactNode[] {
  const parts = text.split(INLINE);
  return parts.filter((part) => part !== "").map((part, index) => {
    const key = `${index}-${part.slice(0, 8)}`;
    if (/^\*\*[^*]+\*\*$/u.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^__[^_]+__$/u.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/u.test(part)) return <code key={key}>{part.slice(1, -1)}</code>;
    if (/^~~[^~]+~~$/u.test(part)) return <del key={key}>{part.slice(2, -2)}</del>;
    if (/^\*[^*]+\*$/u.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/u);
    if (link) {
      const safe = /^(https?:\/\/|mailto:)/iu.test(link[2]) ? link[2] : null;
      return safe
        ? <a key={key} href={safe} target="_blank" rel="noreferrer noopener">{link[1]}</a>
        : <Fragment key={key}>{link[1]}</Fragment>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

function lines(text: string[]): ReactNode {
  return text.map((line, index) => (
    <Fragment key={index}>{index > 0 && <br />}{inline(line)}</Fragment>
  ));
}

export function Markdown({ text }: { text: string }) {
  const blocks = parse(text);
  return <div className={styles.md}>
    {blocks.map((block, index) => {
      if (block.type === "code") {
        return <pre key={index} className={styles.mdCode} data-lang={block.lang || undefined}><code>{block.lines.join("\n")}</code></pre>;
      }
      if (block.type === "rule") return <hr key={index} className={styles.mdRule} />;
      if (block.type === "heading") {
        const Tag = (`h${Math.min(block.level + 2, 6)}`) as "h3" | "h4" | "h5" | "h6";
        return <Tag key={index} className={styles.mdHeading}>{inline(block.text)}</Tag>;
      }
      if (block.type === "quote") return <blockquote key={index}>{lines(block.lines)}</blockquote>;
      if (block.type === "list") {
        const Tag = block.ordered ? "ol" : "ul";
        return <Tag key={index} start={block.ordered ? block.start : undefined}>
          {block.items.map((item, position) => <li key={position}>{inline(item)}</li>)}
        </Tag>;
      }
      return <p key={index}>{lines(block.lines)}</p>;
    })}
  </div>;
}
