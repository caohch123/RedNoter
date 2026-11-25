"use client";

import { useState } from "react";
import { PenLine, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { CanvasSnippet, PreferencesSection, UserPreferences } from "@/lib/api/preferences";
import styles from "../settings.module.css";

type Props = {
  preferences: UserPreferences;
  saving: boolean;
  updatePreferences: (updater: (prev: UserPreferences) => UserPreferences) => Promise<boolean>;
  resetSection: (section: PreferencesSection) => Promise<boolean>;
};

const QUICK_EMOJI_CANDIDATES = ["🔥", "📌", "✅", "💬", "🌸", "⭐", "🎯", "🤍"];

export function CanvasSettingsTab({ preferences, saving, updatePreferences, resetSection }: Props) {
  const canvas = preferences.create.canvas;
  const [emojiInput, setEmojiInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [editingSnippet, setEditingSnippet] = useState<CanvasSnippet | null>(null);
  const [visualPromptDraft, setVisualPromptDraft] = useState(canvas.visualStylePrompt);
  const [visualPromptDirty, setVisualPromptDirty] = useState(false);

  const displayedVisualPrompt = visualPromptDirty ? visualPromptDraft : canvas.visualStylePrompt;

  function addEmoji(value: string) {
    const cleaned = value.trim();
    if (!cleaned || Array.from(cleaned).length > 8) return;
    void updatePreferences((prev) => {
      if (prev.create.canvas.emojis.includes(cleaned) || prev.create.canvas.emojis.length >= 30) return prev;
      return {
        ...prev,
        create: {
          ...prev.create,
          canvas: { ...prev.create.canvas, emojis: [...prev.create.canvas.emojis, cleaned] },
        },
      };
    });
  }

  function removeEmoji(target: string) {
    void updatePreferences((prev) => ({
      ...prev,
      create: {
        ...prev.create,
        canvas: { ...prev.create.canvas, emojis: prev.create.canvas.emojis.filter((item) => item !== target) },
      },
    }));
  }

  function addPresetTag() {
    const cleaned = tagInput.trim().replace(/^#+\s*/, "");
    if (!cleaned || Array.from(cleaned).length > 30) return;
    void updatePreferences((prev) => {
      if (prev.create.canvas.presetTags.includes(cleaned) || prev.create.canvas.presetTags.length >= 40) return prev;
      return {
        ...prev,
        create: {
          ...prev.create,
          canvas: { ...prev.create.canvas, presetTags: [...prev.create.canvas.presetTags, cleaned] },
        },
      };
    });
    setTagInput("");
  }

  function removePresetTag(target: string) {
    void updatePreferences((prev) => ({
      ...prev,
      create: {
        ...prev.create,
        canvas: { ...prev.create.canvas, presetTags: prev.create.canvas.presetTags.filter((item) => item !== target) },
      },
    }));
  }

  async function saveSnippet(snippet: CanvasSnippet) {
    const name = snippet.name.trim();
    const content = snippet.content.trim();
    if (!name || !content) return;
    const item: CanvasSnippet = {
      id: snippet.id || `snip-${crypto.randomUUID().slice(0, 8)}`,
      name,
      content,
    };
    const ok = await updatePreferences((prev) => {
      const exists = prev.create.canvas.snippets.some((s) => s.id === item.id);
      const snippets = exists
        ? prev.create.canvas.snippets.map((s) => (s.id === item.id ? item : s))
        : [...prev.create.canvas.snippets, item];
      return { ...prev, create: { ...prev.create, canvas: { ...prev.create.canvas, snippets } } };
    });
    if (ok) setEditingSnippet(null);
  }

  function deleteSnippet(id: string) {
    void updatePreferences((prev) => ({
      ...prev,
      create: {
        ...prev.create,
        canvas: {
          ...prev.create.canvas,
          snippets: prev.create.canvas.snippets.filter((s) => s.id !== id),
        },
      },
    }));
    if (editingSnippet?.id === id) setEditingSnippet(null);
  }

  return (
    <>
      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h3>常用 Emoji 快捷栏</h3>
            <p>显示在笔记画布正文输入框下方，点击即可一键插入到正文光标处。</p>
          </div>
        </div>
        <div className={styles.chipPool}>
          {canvas.emojis.map((item) => (
            <span key={item} className={styles.poolChip}>
              <span>{item}</span>
              <button type="button" aria-label={`移除表情 ${item}`} onClick={() => removeEmoji(item)}>×</button>
            </span>
          ))}
        </div>
        <form
          className={styles.inlineAdd}
          onSubmit={(e) => {
            e.preventDefault();
            addEmoji(emojiInput);
            setEmojiInput("");
          }}
        >
          <input
            className={styles.input}
            maxLength={8}
            placeholder="输入要添加的 emoji，如 🔥"
            value={emojiInput}
            onChange={(e) => setEmojiInput(e.target.value)}
          />
          <button type="submit" className={styles.ghostBtn} disabled={!emojiInput.trim() || canvas.emojis.length >= 30}>
            添加
          </button>
        </form>
        <div className={styles.emojiQuickPick}>
          <small className={styles.itemDesc}>快速加入：</small>
          {QUICK_EMOJI_CANDIDATES.map((em) => (
            <button
              key={em}
              type="button"
              className={styles.emojiPickBtn}
              disabled={canvas.emojis.includes(em) || canvas.emojis.length >= 30}
              onClick={() => addEmoji(em)}
            >
              {em}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h3>常用话题标签库</h3>
            <p>沉淀个人高频使用的领域标签，在笔记画布标签区点击即可一键加入当前笔记。</p>
          </div>
        </div>
        <div className={styles.chipPool}>
          {canvas.presetTags.map((tag) => (
            <span key={tag} className={styles.poolChip}>
              #{tag}
              <button type="button" aria-label={`移除常用标签 ${tag}`} onClick={() => removePresetTag(tag)}>×</button>
            </span>
          ))}
        </div>
        <form
          className={styles.inlineAdd}
          onSubmit={(e) => {
            e.preventDefault();
            addPresetTag();
          }}
        >
          <input
            className={styles.input}
            maxLength={30}
            placeholder="新增常用标签（无需 #）"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
          />
          <button type="submit" className={styles.ghostBtn} disabled={!tagInput.trim() || canvas.presetTags.length >= 40}>
            添加
          </button>
        </form>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h3>常用正文 / 结尾片段模板</h3>
            <p>例如互动提问引导、无广声明、专栏导流语，编辑正文时可一键插入光标处。</p>
          </div>
          {!editingSnippet && (
            <button
              type="button"
              className={styles.tonalBtn}
              disabled={canvas.snippets.length >= 24}
              onClick={() => setEditingSnippet({ id: "", name: "", content: "" })}
            >
              <Plus size={14} aria-hidden="true" />新增片段
            </button>
          )}
        </div>

        {editingSnippet && (
          <form
            className={styles.editorBox}
            onSubmit={(e) => {
              e.preventDefault();
              void saveSnippet(editingSnippet);
            }}
          >
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="snip-name">片段名称（最多 30 字）</label>
                <input
                  id="snip-name"
                  className={styles.input}
                  required
                  maxLength={30}
                  placeholder="例如：选购清单总结口吻"
                  value={editingSnippet.name}
                  onChange={(e) => setEditingSnippet({ ...editingSnippet, name: e.target.value })}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="snip-content">片段正文内容</label>
                <textarea
                  id="snip-content"
                  rows={3}
                  required
                  className={styles.textarea}
                  maxLength={1000}
                  placeholder="写下需要一键插入到正文的固定文本…"
                  value={editingSnippet.content}
                  onChange={(e) => setEditingSnippet({ ...editingSnippet, content: e.target.value })}
                />
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.ghostBtn} onClick={() => setEditingSnippet(null)}>取消</button>
              <button type="submit" className={styles.primaryBtn} disabled={saving || !editingSnippet.name.trim() || !editingSnippet.content.trim()}>
                保存片段
              </button>
            </div>
          </form>
        )}

        <div className={styles.itemList}>
          {canvas.snippets.map((snip) => (
            <div key={snip.id} className={styles.itemRow}>
              <div className={styles.itemMain}>
                <div className={styles.itemTitleRow}>
                  <strong>{snip.name}</strong>
                </div>
                <p className={styles.itemDesc}>{snip.content}</p>
              </div>
              <div className={styles.rowBtns}>
                <button type="button" className={styles.iconBtn} title="编辑片段" aria-label={`编辑片段 ${snip.name}`} onClick={() => setEditingSnippet(snip)}>
                  <PenLine size={13} aria-hidden="true" />
                </button>
                <button type="button" className={styles.iconBtn} data-danger="true" title="删除片段" aria-label={`删除片段 ${snip.name}`} onClick={() => deleteSnippet(snip.id)}>
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h3>画布与出图偏好</h3>
            <p>配置右栏笔记画布默认打开的视图模式，以及生图/生成封面时的默认视觉风格偏好。</p>
          </div>
        </div>
        <div className={styles.formGrid}>
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <span>默认画布视图</span>
            <div className={styles.checkRow}>
              <label className={styles.checkLabel}>
                <input
                  type="radio"
                  name="canvas-default-view"
                  checked={canvas.defaultView === "edit"}
                  onChange={() =>
                    void updatePreferences((prev) => ({
                      ...prev,
                      create: { ...prev.create, canvas: { ...prev.create.canvas, defaultView: "edit" } },
                    }))
                  }
                />
                编辑模式
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="radio"
                  name="canvas-default-view"
                  checked={canvas.defaultView === "preview"}
                  onChange={() =>
                    void updatePreferences((prev) => ({
                      ...prev,
                      create: { ...prev.create, canvas: { ...prev.create.canvas, defaultView: "preview" } },
                    }))
                  }
                />
                小红书成片预览模式
              </label>
            </div>
          </div>

          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label htmlFor="canvas-visual-style">默认视觉生图风格偏好（选填）</label>
            <textarea
              id="canvas-visual-style"
              rows={2}
              maxLength={500}
              className={styles.textarea}
              placeholder="例如：奶油简约手账风，柔和自然光线，画面留白充足适合加中文标题"
              value={displayedVisualPrompt}
              onChange={(e) => {
                setVisualPromptDraft(e.target.value);
                setVisualPromptDirty(true);
              }}
            />
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={saving || displayedVisualPrompt === canvas.visualStylePrompt}
                onClick={() => {
                  void updatePreferences((prev) => ({
                    ...prev,
                    create: {
                      ...prev.create,
                      canvas: { ...prev.create.canvas, visualStylePrompt: displayedVisualPrompt },
                    },
                  })).then((ok) => {
                    if (ok) setVisualPromptDirty(false);
                  });
                }}
              >
                {displayedVisualPrompt === canvas.visualStylePrompt ? "已同步保存" : "保存视觉偏好"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.resetRow}>
        <button
          type="button"
          className={styles.ghostBtn}
          disabled={saving}
          onClick={() => {
            setEditingSnippet(null);
            setVisualPromptDirty(false);
            void resetSection("canvas");
          }}
        >
          <RotateCcw size={13} aria-hidden="true" />恢复「笔记画布」默认配置
        </button>
      </div>
    </>
  );
}
