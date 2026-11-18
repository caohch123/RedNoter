"use client";

import { useEffect, useRef, useState } from "react";
import type { Post } from "@/lib/collections";
import type { CrawlJob, CrawlMode } from "@/lib/crawl-types";
import { mergeImportedPosts, parseImportedPosts, readImportedPosts, saveImportedPosts } from "@/lib/imported-posts";
import { cleanupPendingImages } from "@/lib/media-cleanup";

const ACTIVE_KEY = "rednoter:crawl-job";
// 原生下拉菜单在 Windows 上可能使用浅色背景，显式设置选项颜色以保证文字可见。
const SELECT_COLORS = { backgroundColor: "#0f172a", color: "#f8fafc" };

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message ?? "采集服务暂不可用"), { status: response.status });
  return data;
}

export function PostCollector({ disabled, onImported }: { disabled: boolean; onImported: (posts: Post[]) => void }) {
  const [mode, setMode] = useState<CrawlMode>("search");
  const [count, setCount] = useState<10 | 100>(10);
  const [keyword, setKeyword] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<CrawlJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingResult, setPendingResult] = useState<unknown>(null);
  const callback = useRef(onImported);
  const applying = useRef(false);
  useEffect(() => { callback.current = onImported; }, [onImported]);

  async function applyResult(posts: unknown) {
    if (applying.current) return;
    applying.current = true;
    try {
      const incoming = parseImportedPosts(JSON.stringify(posts));
      if (!incoming.length) throw new Error("本次没有获取到有效帖子");
      const existing = readImportedPosts();
      const next = mergeImportedPosts(existing, incoming);
      saveImportedPosts([...existing, ...incoming]);
      callback.current(next);
      localStorage.removeItem(ACTIVE_KEY);
      setPendingResult(null);
      setError("");
      setMessage(`已加入 ${incoming.length} 条采集结果，当前保留 ${next.length} 条。沿用当前分类筛选。`);
      try { await cleanupPendingImages(); }
      catch { setError("帖子已加入；淘汰图片清理未完成，可点击下方“清理淘汰图片”重试。"); }
    } catch (error) {
      setError(error instanceof Error ? error.message : "结果保存失败，请重试加入列表");
      setPendingResult(posts);
    } finally { applying.current = false; }
  }
  const applyRef = useRef(applyResult);
  useEffect(() => { applyRef.current = applyResult; });

  useEffect(() => {
    let stopped = false;
    api("/api/crawl").then(data => {
      if (stopped) return;
      setReady(data.ready);
      const remembered = localStorage.getItem(ACTIVE_KEY);
      if (data.active) {
        localStorage.setItem(ACTIVE_KEY, data.active.id);
        setJobId(data.active.id);
        setJob(data.active);
      } else if (remembered) setJobId(remembered);
      else if (data.busy) setError("其他用户正在本机采集，请稍后重试。");
    }).catch(error => { if (!stopped) setError(error.message); });
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await api("/api/crawl?id=" + encodeURIComponent(jobId!));
        if (stopped) return;
        setJob(data.job);
        if (data.job.state === "done") {
          await applyRef.current(data.posts);
          return;
        }
        if (["failed", "cancelled"].includes(data.job.state)) {
          localStorage.removeItem(ACTIVE_KEY);
          return;
        }
      } catch (error) {
        if (stopped) return;
        setError(error instanceof Error ? error.message : "进度读取失败，正在重试");
        if (error && typeof error === "object" && "status" in error && error.status === 404) {
          localStorage.removeItem(ACTIVE_KEY);
          setJobId(null);
          setJob(null);
          return;
        }
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [jobId]);

  const running = submitting || (!!job && ["queued", "running", "converting"].includes(job.state));

  async function start() {
    setSubmitting(true); setError(""); setMessage("");
    try {
      const data = await api("/api/crawl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, count, keyword }) });
      setJob(data.job); setJobId(data.job.id); setPendingResult(null);
      localStorage.setItem(ACTIVE_KEY, data.job.id);
    } catch (error) { setError(error instanceof Error ? error.message : "无法启动采集"); }
    finally { setSubmitting(false); }
  }

  async function stop() {
    try {
      await api("/api/crawl?id=" + encodeURIComponent(jobId!), { method: "DELETE" });
      setMessage("正在停止采集，请等待状态更新。");
    } catch (error) { setError(error instanceof Error ? error.message : "停止失败"); }
  }

  return <section className="mt-6 rounded-2xl border border-purple-400/20 bg-white/5 p-5">
    <h2 className="text-lg font-semibold text-white">采集小红书帖子</h2>
    <p className="mt-2 text-sm text-slate-400">推荐流采集来自登录账号的小红书首页。开始后请在弹出的浏览器中扫码登录或完成验证，结果会自动加入列表。</p>
    <form className="mt-4 flex flex-wrap items-end gap-4" onSubmit={event => { event.preventDefault(); void start(); }}>
      <label className="text-sm text-slate-300">采集方式
        <select aria-label="采集方式" value={mode} disabled={running} onChange={event => setMode(event.target.value as CrawlMode)} style={{ ...SELECT_COLORS, colorScheme: "dark" }} className="mt-2 block rounded-lg border border-white/20 bg-slate-900 p-2 text-white">
          <option value="search" style={SELECT_COLORS}>按关键词搜索</option><option value="homefeed" style={SELECT_COLORS}>随机采集（首页推荐流）</option>
        </select>
      </label>
      <label className="text-sm text-slate-300">采集数量
        <select aria-label="采集数量" value={count} disabled={running} onChange={event => setCount(Number(event.target.value) as 10 | 100)} style={{ ...SELECT_COLORS, colorScheme: "dark" }} className="mt-2 block rounded-lg border border-white/20 bg-slate-900 p-2 text-white">
          <option value={10} style={SELECT_COLORS}>最多 10 条</option><option value={100} style={SELECT_COLORS}>最多 100 条</option>
        </select>
      </label>
      {mode === "search" && <label className="min-w-0 flex-1 text-sm text-slate-300">关键词
        <input aria-label="采集关键词" required maxLength={80} value={keyword} disabled={running} onChange={event => setKeyword(event.target.value)} placeholder="例如：通勤穿搭" className="mt-2 block w-full rounded-lg border border-white/20 bg-black/20 p-2 text-white" />
      </label>}
      <button type="submit" disabled={disabled || running || ready !== true || pendingResult !== null} className="rounded-lg bg-purple-600 px-4 py-2 text-white disabled:opacity-40">{running ? "正在采集…" : "开始采集"}</button>
      {running && <button type="button" onClick={() => void stop()} disabled={!jobId} className="rounded-lg border border-white/20 px-4 py-2 text-slate-300">停止采集</button>}
    </form>
    {ready === false && <p className="mt-3 text-sm text-amber-300">请先在项目根目录运行 tools/xhs/install.ps1 初始化采集环境，完成后刷新页面。</p>}
    <p className="mt-3 text-xs text-slate-400">100 条需要更长时间；实际数量取决于可访问的有效帖子。列表最多保留 100 条，超出会淘汰最早加入的记录。</p>
    {job && <div role="status" className="mt-4 text-sm text-slate-300"><p>{job.message}</p><p className="mt-1">已成功获取 {job.received} / {job.count} 条 · 已尝试 {job.attempted ?? job.received} 条 · 失败 {job.failed ?? 0} 条{job.state === "converting" ? " · 正在下载图片" : ""}</p></div>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-300">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
    {pendingResult !== null && <button type="button" onClick={() => void applyResult(pendingResult)} className="mt-3 rounded-lg bg-purple-600 px-3 py-2 text-sm text-white">重试加入列表</button>}
  </section>;
}
