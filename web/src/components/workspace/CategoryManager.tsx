"use client";

import { useState } from "react";
import { saveCategories, type Category } from "@/lib/categories";

type Props = {
  categories: Category[];
  disabled: boolean;
  onChange: (categories: Category[], selectedId?: string) => void;
};

// 分类表单独立为组件，页面负责筛选，组件负责编辑和保存。
export function CategoryManager({ categories, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function reset() {
    setEditingId(null);
    setName("");
    setKeywords("");
    setError("");
  }

  function submit() {
    const cleanName = name.trim();
    const words = [...new Set(keywords.split(/[,，\n]+/).map(word => word.trim().toLowerCase()).filter(Boolean))];
    if (!cleanName || !words.length) {
      setError("请填写分类名称和至少一个关键词。");
      return;
    }
    if (cleanName === "全部" || categories.some(category => category.id !== editingId && category.name.toLowerCase() === cleanName.toLowerCase())) {
      setError("分类名称重复或使用了保留名称“全部”。");
      return;
    }
    try {
      const category: Category = { id: editingId ?? crypto.randomUUID(), name: cleanName, keywords: words };
      const next = editingId === null ? [...categories, category] : categories.map(item => item.id === editingId ? category : item);
      saveCategories(next);
      onChange(next, category.id);
      setMessage(editingId === null ? "分类已添加。" : "分类已更新，筛选规则已生效。");
      reset();
    } catch {
      setError("保存失败，请检查浏览器本地存储后重试。");
    }
  }

  function remove(id: string) {
    try {
      const next = categories.filter(category => category.id !== id);
      saveCategories(next);
      onChange(next);
      if (editingId === id) reset();
      setError("");
      setMessage("分类已删除，帖子和收藏仍然保留。");
    } catch {
      setError("删除失败，请重试。");
    }
  }

  return (
    <div className="mt-4">
      <button type="button" disabled={disabled} aria-expanded={open} aria-controls="category-editor"
        onClick={() => setOpen(!open)}
        className="rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-50">
        {open ? "收起分类管理" : "管理分类"}
      </button>
      {open && (
        <section id="category-editor" className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">管理分类</h2>
          <p className="mt-2 text-sm text-slate-400">标题、正文或原帖话题标签命中任意关键词，即归入分类。图片不参与匹配。一篇帖子可以属于多个分类。删除分类不会删除帖子或收藏。</p>
          <div className="mt-4 space-y-3">
            {categories.length === 0 && <p className="text-sm text-slate-400">还没有分类，请在下方添加。</p>}
            {categories.map(category => (
              <div key={category.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/20 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-white">{category.name}</p>
                  <p className="mt-1 break-words text-sm text-slate-400">关键词：{category.keywords.join("、")}</p>
                </div>
                <div className="flex gap-4">
                  <button type="button" aria-label={`编辑分类：${category.name}`} className="text-sm text-purple-300"
                    onClick={() => { setEditingId(category.id); setName(category.name); setKeywords(category.keywords.join("，")); setError(""); setMessage(""); }}>编辑</button>
                  <button type="button" aria-label={`删除分类：${category.name}`} className="text-sm text-red-300"
                    onClick={() => remove(category.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
          <form className="mt-6 space-y-4 border-t border-white/10 pt-5" onSubmit={event => { event.preventDefault(); setMessage(""); submit(); }}>
            <h3 className="font-medium text-white">{editingId === null ? "新增分类" : "编辑分类"}</h3>
            <div>
              <label htmlFor="category-name" className="block text-sm text-slate-300">分类名称</label>
              <input id="category-name" required value={name} onChange={event => setName(event.target.value)} placeholder="例如：宠物日常"
                className="mt-2 w-full rounded-xl border border-white/20 bg-black/20 p-3 text-white" />
            </div>
            <div>
              <label htmlFor="category-keywords" className="block text-sm text-slate-300">关键词（用逗号或换行分隔）</label>
              <textarea id="category-keywords" required rows={3} value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="猫咪，狗狗，养宠"
                className="mt-2 w-full rounded-xl border border-white/20 bg-black/20 p-3 text-white" />
            </div>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            <p role="status" className="text-sm text-emerald-300">{message}</p>
            <div className="flex gap-3">
              <button type="submit" className="rounded-xl bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-500">{editingId === null ? "添加分类" : "保存修改"}</button>
              <button type="button" onClick={() => { reset(); setMessage(""); }} className="rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-300">{editingId === null ? "清空输入" : "取消编辑"}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}