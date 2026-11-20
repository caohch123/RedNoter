"use client";

import {
  readCategories,
  matchesCategory,
  type Category,
} from "@/lib/categories";
import {
  readSavedPosts,
  saveSavedPosts,
  type Post,
} from "@/lib/collections";
import { useEffect, useState } from "react";
import { PostCard } from "@/components/workspace/PostCard";
import { MediaCleanup } from "@/components/workspace/MediaCleanup";
import { PostCollector } from "@/components/workspace/PostCollector";
import { readImportedPosts } from "@/lib/imported-posts";
import { CategoryManager } from "@/components/workspace/CategoryManager";



export default function Page() {
const [importedPosts, setImportedPosts] = useState<Post[]>([]);
const [importsLoaded, setImportsLoaded] = useState(false);
const [importError, setImportError] = useState("");
useEffect(() => {
  try {
    setImportedPosts(readImportedPosts());
    setImportsLoaded(true);
  } catch {
    setImportError("读取帖子失败，请检查浏览器存储中的帖子数据。");
  }
}, []);
const allPosts = importedPosts;
const [savedPosts, setSavedPosts] = useState<Post[]>([]);

// 从完整帖子中提取 ID，供原来的按钮判断收藏状态。
const savedIds = savedPosts.map((post) => post.id);
const [isLoaded, setIsLoaded] = useState(false);
const [storageError, setStorageError] = useState("");
const [categories, setCategories] = useState<Category[]>([]);
const [selectedCategoryId, setSelectedCategoryId] =
  useState<string | null>(null);

const [categoriesLoaded, setCategoriesLoaded] = useState(false);
const [categoryError, setCategoryError] = useState("");

useEffect(() => {
  try {
    setCategories(readCategories());
  } catch {
    setCategoryError("读取分类失败，请检查本地分类数据。");
  } finally {
    setCategoriesLoaded(true);
  }
}, []);

// 页面加载后，读取之前保存的收藏。
useEffect(() => {
  try {
    setSavedPosts(readSavedPosts());
    setIsLoaded(true);
  } catch {
    setStorageError("读取收藏失败，请检查本地存储或收藏数据。");
  }
}, []);

function toggleSave(post: Post) {
  if (!isLoaded) return;

  const alreadySaved = savedPosts.some(
    (item) => item.id === post.id
  );

  const nextPosts = alreadySaved
    ? savedPosts.filter((item) => item.id !== post.id)
    : [...savedPosts, post];

  try {
    saveSavedPosts(nextPosts);
    setSavedPosts(nextPosts);
    setStorageError("");
  } catch {
    setStorageError("保存失败，本次收藏未更新，请重试。");
  }
}
const selectedCategory = categories.find(
  (category) => category.id === selectedCategoryId
);

const visiblePosts = selectedCategoryId === null
  ? allPosts
  : selectedCategory
  ? allPosts.filter((post) => matchesCategory(post, selectedCategory))
  : [];
  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-10">
      <h1 className="text-3xl font-bold text-slate-900">话题追踪</h1>

      <p className="mt-3 text-slate-500">
        发现感兴趣的帖子，收集创作灵感。
      </p>{categoryError && (
  <p role="alert" className="mt-4 text-red-600">
    {categoryError}
  </p>
)}

{!categoriesLoaded ? (
  <p className="mt-6 text-slate-500">正在读取分类……</p>
) : (
  <div
    role="group"
    aria-label="按分类筛选帖子"
    className="mt-6 flex flex-wrap gap-2"
  >
    <button
      type="button"
      aria-pressed={selectedCategoryId === null}
      onClick={() => setSelectedCategoryId(null)}
      className={`rounded-xl px-4 py-2 text-sm ${
        selectedCategoryId === null
          ? "bg-brand-600 text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      全部
    </button>

    {categories.map((category) => (
      <button
        key={category.id}
        type="button"
        aria-pressed={selectedCategoryId === category.id}
        onClick={() => setSelectedCategoryId(category.id)}
        className={`rounded-xl px-4 py-2 text-sm ${
          selectedCategoryId === category.id
            ? "bg-brand-600 text-white"
            : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        }`}
      >
        {category.name}
      </button>
    ))}
  </div>
)}

{importError && <p role="alert" className="mt-4 text-red-600">{importError}</p>}
<PostCollector disabled={!importsLoaded} onImported={setImportedPosts} />
<MediaCleanup disabled={!importsLoaded} />
<CategoryManager
  categories={categories}
  disabled={!categoriesLoaded || Boolean(categoryError)}
  onChange={(nextCategories, selectedId) => {
    setCategories(nextCategories);
    if (selectedId !== undefined) {
      setSelectedCategoryId(selectedId);
    } else if (selectedCategoryId !== null && !nextCategories.some(category => category.id === selectedCategoryId)) {
      setSelectedCategoryId(null);
    }
  }}
/>
<p className="mt-4 text-sm text-slate-500">
  当前分类：{selectedCategoryId === null ? "全部" : selectedCategory?.name ?? "分类不可用"} · 显示 {visiblePosts.length} / {allPosts.length} 篇帖子
</p>

{selectedCategory && (
  <p className="mt-2 text-sm text-slate-500">
    匹配关键词：{selectedCategory.keywords.join("、")}（任意命中；检查标题、正文和原帖话题标签，图片不参与匹配）
  </p>
)}

{visiblePosts.length === 0 && (
  <p className="mt-8 text-slate-500">
    {selectedCategoryId === null
      ? "暂无帖子，请先使用上方的采集功能获取帖子。"
      : "暂无符合该分类关键词的帖子，可以切换到“全部”。"}
  </p>
)}

      {storageError && (
       <p role="alert" className="mt-4 text-red-600">
       {storageError}
       </p>
)}

      <div className="mt-8 grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
  {visiblePosts.map((post) => (
    <PostCard key={post.id} post={post}
      badge="帖子数据"
      actions={<button type="button" disabled={!isLoaded} onClick={() => toggleSave(post)}
        aria-pressed={savedIds.includes(post.id)}
        className="rounded-xl bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50">
        {savedIds.includes(post.id) ? "已收藏 · 点击取消" : "收藏到素材库"}
      </button>}
    />
  ))}
</div>
    </main>
  );
}

