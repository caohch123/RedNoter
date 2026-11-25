"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, PenLine, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { PreferencesSection, QuickCommand, StarterChip, UserPreferences } from "@/lib/api/preferences";
import styles from "../settings.module.css";

type Props = {
  preferences: UserPreferences;
  saving: boolean;
  updatePreferences: (updater: (prev: UserPreferences) => UserPreferences) => Promise<boolean>;
  resetSection: (section: PreferencesSection) => Promise<boolean>;
};

const TONE_LABELS: Record<StarterChip["tone"], string> = {
  lavender: "淡紫",
  butter: "奶油黄",
  sky: "淡蓝",
  pink: "樱花粉",
};

export function ChatSettingsTab({ preferences, saving, updatePreferences, resetSection }: Props) {
  const chat = preferences.create.chat;
  const [editingCmd, setEditingCmd] = useState<QuickCommand | null>(null);
  const [editingChip, setEditingChip] = useState<StarterChip | null>(null);
  const [draftGlobal, setDraftGlobal] = useState(chat.globalInstructions);
  const [globalDirty, setGlobalDirty] = useState(false);

  const displayedGlobal = globalDirty ? draftGlobal : chat.globalInstructions;

  async function saveCommand(cmd: QuickCommand) {
    const label = cmd.label.trim();
    const prompt = cmd.prompt.trim();
    if (!label || !prompt) return;
    const item: QuickCommand = {
      id: cmd.id || `cmd-${crypto.randomUUID().slice(0, 8)}`,
      label,
      prompt,
      enabled: cmd.enabled,
    };
    const ok = await updatePreferences((prev) => {
      const exists = prev.create.chat.quickCommands.some((c) => c.id === item.id);
      const quickCommands = exists
        ? prev.create.chat.quickCommands.map((c) => (c.id === item.id ? item : c))
        : [...prev.create.chat.quickCommands, item];
      return { ...prev, create: { ...prev.create, chat: { ...prev.create.chat, quickCommands } } };
    });
    if (ok) setEditingCmd(null);
  }

  function moveCommand(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= chat.quickCommands.length) return;
    void updatePreferences((prev) => {
      const next = [...prev.create.chat.quickCommands];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, create: { ...prev.create, chat: { ...prev.create.chat, quickCommands: next } } };
    });
  }

  function toggleCommand(id: string) {
    void updatePreferences((prev) => ({
      ...prev,
      create: {
        ...prev.create,
        chat: {
          ...prev.create.chat,
          quickCommands: prev.create.chat.quickCommands.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
        },
      },
    }));
  }

  function deleteCommand(id: string) {
    void updatePreferences((prev) => ({
      ...prev,
      create: {
        ...prev.create,
        chat: {
          ...prev.create.chat,
          quickCommands: prev.create.chat.quickCommands.filter((c) => c.id !== id),
        },
      },
    }));
    if (editingCmd?.id === id) setEditingCmd(null);
  }

  async function saveChip(chip: StarterChip) {
    const label = chip.label.trim();
    const prompt = chip.prompt.trim();
    if (!label || !prompt) return;
    const item: StarterChip = {
      id: chip.id || `chip-${crypto.randomUUID().slice(0, 8)}`,
      label,
      prompt,
      tone: chip.tone,
      enabled: chip.enabled,
    };
    const ok = await updatePreferences((prev) => {
      const exists = prev.create.chat.starterChips.some((c) => c.id === item.id);
      const starterChips = exists
        ? prev.create.chat.starterChips.map((c) => (c.id === item.id ? item : c))
        : [...prev.create.chat.starterChips, item];
      return { ...prev, create: { ...prev.create, chat: { ...prev.create.chat, starterChips } } };
    });
    if (ok) setEditingChip(null);
  }

  function moveChip(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= chat.starterChips.length) return;
    void updatePreferences((prev) => {
      const next = [...prev.create.chat.starterChips];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, create: { ...prev.create, chat: { ...prev.create.chat, starterChips: next } } };
    });
  }

  function toggleChip(id: string) {
    void updatePreferences((prev) => ({
      ...prev,
      create: {
        ...prev.create,
        chat: {
          ...prev.create.chat,
          starterChips: prev.create.chat.starterChips.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
        },
      },
    }));
  }

  function deleteChip(id: string) {
    void updatePreferences((prev) => ({
      ...prev,
      create: {
        ...prev.create,
        chat: {
          ...prev.create.chat,
          starterChips: prev.create.chat.starterChips.filter((c) => c.id !== id),
        },
      },
    }));
    if (editingChip?.id === id) setEditingChip(null);
  }

  async function saveGlobalInstructions() {
    const ok = await updatePreferences((prev) => ({
      ...prev,
      create: {
        ...prev.create,
        chat: { ...prev.create.chat, globalInstructions: displayedGlobal },
      },
    }));
    if (ok) setGlobalDirty(false);
  }

  return (
    <>
      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h3>快捷指令（输入框上方改稿胶囊）</h3>
            <p>自定义常用的一键润色、改稿指令名称、发给 AI 的提示词、排序及启用状态。</p>
          </div>
          {!editingCmd && (
            <button
              type="button"
              className={styles.tonalBtn}
              disabled={chat.quickCommands.length >= 24}
              onClick={() => setEditingCmd({ id: "", label: "", prompt: "", enabled: true })}
            >
              <Plus size={14} aria-hidden="true" />新增指令
            </button>
          )}
        </div>

        {editingCmd && (
          <form
            className={styles.editorBox}
            onSubmit={(e) => {
              e.preventDefault();
              void saveCommand(editingCmd);
            }}
          >
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="cmd-label">按钮显示文案（最多 24 字）</label>
                <input
                  id="cmd-label"
                  className={styles.input}
                  required
                  maxLength={24}
                  placeholder="例如：增加评论区互动"
                  value={editingCmd.label}
                  onChange={(e) => setEditingCmd({ ...editingCmd, label: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <span>启用状态</span>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={editingCmd.enabled}
                    onChange={(e) => setEditingCmd({ ...editingCmd, enabled: e.target.checked })}
                  />
                  在对话输入框上方展示
                </label>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="cmd-prompt">点击后发送给助手的完整指令</label>
                <textarea
                  id="cmd-prompt"
                  rows={2}
                  required
                  className={styles.textarea}
                  maxLength={1000}
                  placeholder="例如：保留正文事实不变，在结尾设计 1 个能引发读者共鸣评论的开放式提问。"
                  value={editingCmd.prompt}
                  onChange={(e) => setEditingCmd({ ...editingCmd, prompt: e.target.value })}
                />
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.ghostBtn} onClick={() => setEditingCmd(null)}>取消</button>
              <button type="submit" className={styles.primaryBtn} disabled={saving || !editingCmd.label.trim() || !editingCmd.prompt.trim()}>
                保存指令
              </button>
            </div>
          </form>
        )}

        <div className={styles.itemList}>
          {chat.quickCommands.map((cmd, idx) => (
            <div key={cmd.id} className={styles.itemRow}>
              <div className={styles.itemMain}>
                <div className={styles.itemTitleRow}>
                  <strong>{cmd.label}</strong>
                  <label className={styles.switchTrack}>
                    <input type="checkbox" checked={cmd.enabled} onChange={() => toggleCommand(cmd.id)} />
                    {cmd.enabled ? "已启用" : "已隐藏"}
                  </label>
                </div>
                <p className={styles.itemDesc}>{cmd.prompt}</p>
              </div>
              <div className={styles.rowBtns}>
                <button type="button" className={styles.iconBtn} disabled={idx === 0} title="上移" aria-label={`上移 ${cmd.label}`} onClick={() => moveCommand(idx, -1)}>
                  <ArrowUp size={13} aria-hidden="true" />
                </button>
                <button type="button" className={styles.iconBtn} disabled={idx === chat.quickCommands.length - 1} title="下移" aria-label={`下移 ${cmd.label}`} onClick={() => moveCommand(idx, 1)}>
                  <ArrowDown size={13} aria-hidden="true" />
                </button>
                <button type="button" className={styles.iconBtn} title="编辑" aria-label={`编辑 ${cmd.label}`} onClick={() => setEditingCmd(cmd)}>
                  <PenLine size={13} aria-hidden="true" />
                </button>
                <button type="button" className={styles.iconBtn} data-danger="true" title="删除" aria-label={`删除 ${cmd.label}`} onClick={() => deleteCommand(cmd.id)}>
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
            <h3>快速起步卡片（空对话欢迎页）</h3>
            <p>新对话空状态时展示的灵感开场胶囊，支持自定义提示词与淡彩配色。</p>
          </div>
          {!editingChip && (
            <button
              type="button"
              className={styles.tonalBtn}
              disabled={chat.starterChips.length >= 12}
              onClick={() => setEditingChip({ id: "", label: "", prompt: "", tone: "lavender", enabled: true })}
            >
              <Plus size={14} aria-hidden="true" />新增卡片
            </button>
          )}
        </div>

        {editingChip && (
          <form
            className={styles.editorBox}
            onSubmit={(e) => {
              e.preventDefault();
              void saveChip(editingChip);
            }}
          >
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="chip-label">起步按钮文案（最多 24 字）</label>
                <input
                  id="chip-label"
                  className={styles.input}
                  required
                  maxLength={24}
                  placeholder="例如：写一篇避坑指南"
                  value={editingChip.label}
                  onChange={(e) => setEditingChip({ ...editingChip, label: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="chip-tone">卡片配色</label>
                <select
                  id="chip-tone"
                  className={styles.select}
                  value={editingChip.tone}
                  onChange={(e) => setEditingChip({ ...editingChip, tone: e.target.value as StarterChip["tone"] })}
                >
                  <option value="lavender">淡紫</option>
                  <option value="butter">奶油黄</option>
                  <option value="sky">淡蓝</option>
                  <option value="pink">樱花粉</option>
                </select>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="chip-prompt">触发后发给助手的开场需求</label>
                <textarea
                  id="chip-prompt"
                  rows={2}
                  required
                  className={styles.textarea}
                  maxLength={1000}
                  value={editingChip.prompt}
                  onChange={(e) => setEditingChip({ ...editingChip, prompt: e.target.value })}
                />
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.ghostBtn} onClick={() => setEditingChip(null)}>取消</button>
              <button type="submit" className={styles.primaryBtn} disabled={saving || !editingChip.label.trim() || !editingChip.prompt.trim()}>
                保存卡片
              </button>
            </div>
          </form>
        )}

        <div className={styles.itemList}>
          {chat.starterChips.map((chip, idx) => (
            <div key={chip.id} className={styles.itemRow}>
              <div className={styles.itemMain}>
                <div className={styles.itemTitleRow}>
                  <strong>{chip.label}</strong>
                  <span className={styles.pill} data-tone={chip.tone}>{TONE_LABELS[chip.tone]}</span>
                  <label className={styles.switchTrack}>
                    <input type="checkbox" checked={chip.enabled} onChange={() => toggleChip(chip.id)} />
                    {chip.enabled ? "已启用" : "已隐藏"}
                  </label>
                </div>
                <p className={styles.itemDesc}>{chip.prompt}</p>
              </div>
              <div className={styles.rowBtns}>
                <button type="button" className={styles.iconBtn} disabled={idx === 0} title="上移" aria-label={`上移 ${chip.label}`} onClick={() => moveChip(idx, -1)}>
                  <ArrowUp size={13} aria-hidden="true" />
                </button>
                <button type="button" className={styles.iconBtn} disabled={idx === chat.starterChips.length - 1} title="下移" aria-label={`下移 ${chip.label}`} onClick={() => moveChip(idx, 1)}>
                  <ArrowDown size={13} aria-hidden="true" />
                </button>
                <button type="button" className={styles.iconBtn} title="编辑" aria-label={`编辑 ${chip.label}`} onClick={() => setEditingChip(chip)}>
                  <PenLine size={13} aria-hidden="true" />
                </button>
                <button type="button" className={styles.iconBtn} data-danger="true" title="删除" aria-label={`删除 ${chip.label}`} onClick={() => deleteChip(chip.id)}>
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
            <h3>全局写作规范（每轮 AI 对话自动注入）</h3>
            <p>写明长期账号人设、语言习惯、禁忌词或固定排版规范，助手在每次生成和改稿时都会自动遵守。</p>
          </div>
        </div>
        <div className={styles.field}>
          <textarea
            aria-label="全局写作规范"
            rows={4}
            maxLength={2000}
            className={styles.textarea}
            placeholder={"例如：\n1. 我是实用主义护肤测评博主，语气克制真诚，不用「绝绝子」「闭眼入」等夸张词。\n2. 每段不超过 3 句话，适当留白方便手机端阅读。"}
            value={displayedGlobal}
            onChange={(e) => {
              setDraftGlobal(e.target.value);
              setGlobalDirty(true);
            }}
          />
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={saving || displayedGlobal === chat.globalInstructions}
              onClick={() => void saveGlobalInstructions()}
            >
              {displayedGlobal === chat.globalInstructions ? "已同步保存" : "保存写作规范"}
            </button>
          </div>
        </div>
      </section>

      <div className={styles.resetRow}>
        <button
          type="button"
          className={styles.ghostBtn}
          disabled={saving}
          onClick={() => {
            setEditingCmd(null);
            setEditingChip(null);
            setGlobalDirty(false);
            void resetSection("chat");
          }}
        >
          <RotateCcw size={13} aria-hidden="true" />恢复「对话窗口」默认配置
        </button>
      </div>
    </>
  );
}
