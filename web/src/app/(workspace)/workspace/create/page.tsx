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
      <h1 className="text-3xl font-bold text-slate-900">AI 创作</h1>

      <p className="mt-3 text-slate-500">
        从素材库带入参考文案，也可以手动输入或修改。
      </p>

      {error && (
        <p role="alert" className="mt-4 text-red-600">
          {error}
        </p>
      )}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label
          htmlFor="source-text"
          className="block text-lg font-semibold text-slate-900"
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
          className="mt-4 w-full rounded-xl border border-slate-200 bg-white p-4 leading-7 text-slate-900 outline-none focus:border-brand-300 focus:ring-4 focus:ring-brand-50"
        />

        <p className="mt-3 text-sm text-slate-500">
         当前已支持文案带入和编辑，AI 生成功能尚未接入。
        </p>
      </section>
    </main>
  );
}
