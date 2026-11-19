"use client";

import { useState } from "react";
import { cleanupPendingImages } from "@/lib/media-cleanup";

export function MediaCleanup({ disabled }: { disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function cleanup() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const deleted = await cleanupPendingImages();
      setMessage(`已清理 ${deleted} 张图片；帖子和收藏仍在使用的图片会保留。每次最多处理 500 张，可再次点击继续清理。`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "图片清理失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-4">
    <button type="button" disabled={disabled || busy} onClick={() => void cleanup()}
      className="rounded-lg border border-white/20 px-3 py-2 text-sm text-slate-300 disabled:opacity-50">
      {busy ? "正在清理…" : "清理淘汰图片"}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
    {message && <p role="status" className="mt-2 text-sm text-emerald-300">{message}</p>}
  </div>;
}
