/*import { ModulePlaceholder } from "@/components/workspace/ModulePlaceholder";

export default function Page() {
  return <ModulePlaceholder slug="create" />;
}*/
"use client";

import { useEffect, useState } from "react";

export default function Page() {
  const [sourceText, setSourceText] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const savedText = sessionStorage.getItem(
        "rednoter:rewrite-source"
      );

      setSourceText(savedText ?? "");
    } catch {
      setError("读取文案失败，可以先手动粘贴文案。");
    } finally {
      setIsLoaded(true);
    }
  }, []);
  function updateSourceText(nextText: string) {
  // 先更新界面，让输入立即显示出来。
  setSourceText(nextText);

  try {
    // 再把最新内容保存到当前标签页的存储中。
    sessionStorage.setItem("rednoter:rewrite-source", nextText);
    setError("");
  } catch {
    setError("自动保存失败，请先复制文案备份，避免刷新后丢失。");
  }
}

  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-10">
      <h1 className="text-3xl font-bold text-white">AI 创作</h1>

      <p className="mt-3 text-slate-400">
        从素材库带入参考文案，也可以手动输入或修改。
      </p>

      {error && (
        <p role="alert" className="mt-4 text-red-400">
          {error}
        </p>
      )}

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
        <label
          htmlFor="source-text"
          className="block text-lg font-semibold text-white"
        >
          仿写参考文案
        </label>

        <textarea
          id="source-text"
          value={sourceText}
          onChange={(event) => updateSourceText(event.target.value)}
          disabled={!isLoaded}
          placeholder={
            isLoaded
              ? "请粘贴文案，或从素材库点击“用于仿写”"
              : "正在读取文案……"
          }
          rows={10}
          className="mt-4 w-full rounded-xl border border-white/15 bg-black/20 p-4 leading-7 text-white outline-none focus:border-purple-400"
        />

        <p className="mt-3 text-sm text-slate-400">
         当前已支持文案带入和编辑，AI 生成功能尚未接入。
        </p>
      </section>
    </main>
  );
}
