"use client";

import { useState } from "react";
import { PenLine, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { BriefOptions, BriefTemplate, PreferencesSection, UserPreferences } from "@/lib/api/preferences";
import styles from "../settings.module.css";

type Props = {
  preferences: UserPreferences;
  saving: boolean;
  updatePreferences: (updater: (prev: UserPreferences) => UserPreferences) => Promise<boolean>;
  resetSection: (section: PreferencesSection) => Promise<boolean>;
};

const EMPTY_TEMPLATE = (prefs: UserPreferences): BriefTemplate => ({
  id: "",
  name: "",
  mode: prefs.create.brief.defaults.mode,
  topic: "",
  category: "",
  facts: "",
  audience: "",
  tone: prefs.create.brief.defaults.tone,
  length: prefs.create.brief.defaults.length,
  titleStyle: prefs.create.brief.defaults.titleStyle,
  tagCount: prefs.create.brief.defaults.tagCount,
  emoji: prefs.create.brief.defaults.emoji,
  instructions: prefs.create.brief.defaults.instructions,
  angle: prefs.create.brief.defaults.angle,
  intensity: prefs.create.brief.defaults.intensity,
  keepHook: prefs.create.brief.defaults.keepHook,
  keepParagraphs: prefs.create.brief.defaults.keepParagraphs,
  keepTags: prefs.create.brief.defaults.keepTags,
});

const OPTION_POOLS: { key: keyof BriefOptions; label: string; placeholder: string }[] = [
  { key: "categories", label: "类目选项", placeholder: "新增类目，如：母婴育儿" },
  { key: "audiences", label: "快捷人群", placeholder: "新增人群，如：新手爸妈" },
  { key: "tones", label: "表达语气", placeholder: "新增语气，如：干货清单风" },
  { key: "titleStyles", label: "标题风格", placeholder: "新增风格，如：痛点共鸣" },
  { key: "angles", label: "仿写角度", placeholder: "新增角度，如：换季节" },
];

export function BriefSettingsTab({ preferences, saving, updatePreferences, resetSection }: Props) {
  const brief = preferences.create.brief;
  const [editingTemplate, setEditingTemplate] = useState<BriefTemplate | null>(null);
  const [poolInputs, setPoolInputs] = useState<Record<string, string>>({});
  const [defaultInstructions, setDefaultInstructions] = useState(brief.defaults.instructions);
  const [instructionsDirty, setInstructionsDirty] = useState(false);

  const displayedDefaultInstructions = instructionsDirty ? defaultInstructions : brief.defaults.instructions;

  async function saveTemplate(form: BriefTemplate) {
    const name = form.name.trim();
    if (!name) return;
    const item: BriefTemplate = {
      ...form,
      id: form.id || `tpl-${crypto.randomUUID().slice(0, 8)}`,
      name,
      topic: form.topic.trim(),
      category: form.category.trim(),
      audience: form.audience.trim(),
    };
    const ok = await updatePreferences((prev) => {
      const exists = prev.create.brief.templates.some((t) => t.id === item.id);
      const templates = exists
        ? prev.create.brief.templates.map((t) => (t.id === item.id ? item : t))
        : [...prev.create.brief.templates, item];
      return {
        ...prev,
        create: { ...prev.create, brief: { ...prev.create.brief, templates } },
      };
    });
    if (ok) setEditingTemplate(null);
  }

  function deleteTemplate(id: string) {
    void updatePreferences((prev) => ({
      ...prev,
      create: {
        ...prev.create,
        brief: {
          ...prev.create.brief,
          templates: prev.create.brief.templates.filter((t) => t.id !== id),
        },
      },
    }));
    if (editingTemplate?.id === id) setEditingTemplate(null);
  }

  function addOption(key: keyof BriefOptions) {
    const val = (poolInputs[key] ?? "").trim();
    if (!val) return;
    void updatePreferences((prev) => {
      const list = prev.create.brief.options[key];
      if (list.includes(val) || list.length >= 24) return prev;
      return {
        ...prev,
        create: {
          ...prev.create,
          brief: {
            ...prev.create.brief,
            options: { ...prev.create.brief.options, [key]: [...list, val] },
          },
        },
      };
    });
    setPoolInputs((prev) => ({ ...prev, [key]: "" }));
  }

  function removeOption(key: keyof BriefOptions, target: string) {
    void updatePreferences((prev) => ({
      ...prev,
      create: {
        ...prev.create,
        brief: {
          ...prev.create.brief,
          options: {
            ...prev.create.brief.options,
            [key]: prev.create.brief.options[key].filter((item) => item !== target),
          },
        },
      },
    }));
  }

  function patchDefaults(patch: Partial<UserPreferences["create"]["brief"]["defaults"]>) {
    void updatePreferences((prev) => ({
      ...prev,
      create: {
        ...prev.create,
        brief: {
          ...prev.create.brief,
          defaults: { ...prev.create.brief.defaults, ...patch },
        },
      },
    }));
  }

  const categoryChoices = [...new Set([...brief.options.categories, ...(editingTemplate?.category ? [editingTemplate.category] : [])])];
  const toneChoices = [...new Set([...brief.options.tones, brief.defaults.tone, ...(editingTemplate?.tone ? [editingTemplate.tone] : [])].filter(Boolean))];
  const titleStyleChoices = [...new Set([...brief.options.titleStyles, brief.defaults.titleStyle, ...(editingTemplate?.titleStyle ? [editingTemplate.titleStyle] : [])].filter(Boolean))];
  const angleChoices = [...new Set([...brief.options.angles, brief.defaults.angle, ...(editingTemplate?.angle ? [editingTemplate.angle] : [])].filter(Boolean))];

  return (
    <>
      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h3>创作模板库</h3>
            <p>沉淀常用的原创或仿写配置组合，在左栏「模板」菜单中一键套用或存为新模板。</p>
          </div>
          {!editingTemplate && (
            <button
              type="button"
              className={styles.tonalBtn}
              disabled={brief.templates.length >= 30}
              onClick={() => setEditingTemplate(EMPTY_TEMPLATE(preferences))}
            >
              <Plus size={14} aria-hidden="true" />新建模板
            </button>
          )}
        </div>

        {editingTemplate && (
          <form
            className={styles.editorBox}
            onSubmit={(e) => {
              e.preventDefault();
              void saveTemplate(editingTemplate);
            }}
          >
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="tpl-name">模板名称</label>
                <input
                  id="tpl-name"
                  className={styles.input}
                  required
                  maxLength={40}
                  placeholder="例如：通勤包干货测评"
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="tpl-mode">创作模式</label>
                <select
                  id="tpl-mode"
                  className={styles.select}
                  value={editingTemplate.mode}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, mode: e.target.value as "original" | "rewrite" })}
                >
                  <option value="original">原创</option>
                  <option value="rewrite">参考仿写</option>
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="tpl-topic">预设主题（选填）</label>
                <input
                  id="tpl-topic"
                  className={styles.input}
                  maxLength={200}
                  placeholder="例如：轻量通勤托特包"
                  value={editingTemplate.topic}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, topic: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="tpl-category">类目</label>
                <select
                  id="tpl-category"
                  className={styles.select}
                  value={editingTemplate.category}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })}
                >
                  <option value="">不预设</option>
                  {categoryChoices.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="tpl-audience">目标人群</label>
                <input
                  id="tpl-audience"
                  className={styles.input}
                  maxLength={100}
                  placeholder="例如：早八打工人"
                  value={editingTemplate.audience}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, audience: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="tpl-tone">语气</label>
                <select
                  id="tpl-tone"
                  className={styles.select}
                  value={editingTemplate.tone}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, tone: e.target.value })}
                >
                  {toneChoices.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="tpl-length">篇幅</label>
                <select
                  id="tpl-length"
                  className={styles.select}
                  value={editingTemplate.length}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, length: e.target.value as "short" | "standard" | "long" })}
                >
                  <option value="short">短笔记（约 250 字）</option>
                  <option value="standard">标准（400–600 字）</option>
                  <option value="long">长文（约 800 字）</option>
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="tpl-title-style">标题风格</label>
                <select
                  id="tpl-title-style"
                  className={styles.select}
                  value={editingTemplate.titleStyle}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, titleStyle: e.target.value })}
                >
                  {titleStyleChoices.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              {editingTemplate.mode === "rewrite" && (
                <>
                  <div className={styles.field}>
                    <label htmlFor="tpl-angle">仿写角度</label>
                    <select
                      id="tpl-angle"
                      className={styles.select}
                      value={editingTemplate.angle}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, angle: e.target.value })}
                    >
                      {angleChoices.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="tpl-intensity">改写力度：{editingTemplate.intensity}%</label>
                    <input
                      id="tpl-intensity"
                      type="range"
                      min={20}
                      max={100}
                      step={10}
                      value={editingTemplate.intensity}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, intensity: +e.target.value })}
                    />
                  </div>
                </>
              )}
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="tpl-facts">核心卖点 / 可用事实（每行一条）</label>
                <textarea
                  id="tpl-facts"
                  rows={2}
                  className={styles.textarea}
                  maxLength={4000}
                  value={editingTemplate.facts}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, facts: e.target.value })}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="tpl-instructions">补充要求</label>
                <textarea
                  id="tpl-instructions"
                  rows={2}
                  className={styles.textarea}
                  maxLength={2000}
                  value={editingTemplate.instructions}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, instructions: e.target.value })}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <div className={styles.checkRow}>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={editingTemplate.emoji}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, emoji: e.target.checked })}
                    />
                    加入适量 emoji
                  </label>
                  {editingTemplate.mode === "rewrite" && (
                    <>
                      <label className={styles.checkLabel}>
                        <input
                          type="checkbox"
                          checked={editingTemplate.keepHook}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, keepHook: e.target.checked })}
                        />
                        保留开篇钩子
                      </label>
                      <label className={styles.checkLabel}>
                        <input
                          type="checkbox"
                          checked={editingTemplate.keepParagraphs}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, keepParagraphs: e.target.checked })}
                        />
                        保留正文分段
                      </label>
                      <label className={styles.checkLabel}>
                        <input
                          type="checkbox"
                          checked={editingTemplate.keepTags}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, keepTags: e.target.checked })}
                        />
                        沿用原标签
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.ghostBtn} onClick={() => setEditingTemplate(null)}>取消</button>
              <button type="submit" className={styles.primaryBtn} disabled={saving || !editingTemplate.name.trim()}>保存模板</button>
            </div>
          </form>
        )}

        <div className={styles.itemList}>
          {brief.templates.map((tpl) => (
            <div key={tpl.id} className={styles.itemRow}>
              <div className={styles.itemMain}>
                <div className={styles.itemTitleRow}>
                  <strong>{tpl.name}</strong>
                  <span className={styles.pill} data-tone={tpl.mode === "rewrite" ? "accent" : "lavender"}>
                    {tpl.mode === "rewrite" ? "参考仿写" : "原创"}
                  </span>
                  {tpl.tone && <span className={styles.pill}>{tpl.tone}</span>}
                  {tpl.category && <span className={styles.pill}>{tpl.category}</span>}
                </div>
                {(tpl.topic || tpl.instructions) && (
                  <p className={styles.itemDesc}>{[tpl.topic && `主题：${tpl.topic}`, tpl.instructions].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              <div className={styles.rowBtns}>
                <button type="button" className={styles.iconBtn} title="编辑模板" aria-label={`编辑模板 ${tpl.name}`} onClick={() => setEditingTemplate(tpl)}>
                  <PenLine size={13} aria-hidden="true" />
                </button>
                <button type="button" className={styles.iconBtn} data-danger="true" title="删除模板" aria-label={`删除模板 ${tpl.name}`} onClick={() => deleteTemplate(tpl.id)}>
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
          {brief.templates.length === 0 && <p className={styles.itemDesc}>暂无模板，点击右上角「新建模板」，也可在左栏直接把当前设置存为模板。</p>}
        </div>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h3>快捷选项池</h3>
            <p>自定义左栏创作设置中展示的类目、快捷人群、语气、标题风格与仿写角度。</p>
          </div>
        </div>
        {OPTION_POOLS.map((pool) => (
          <div key={pool.key} className={styles.poolGroup}>
            <span className={styles.poolLabel}>{pool.label}</span>
            <div className={styles.chipPool}>
              {brief.options[pool.key].map((item) => (
                <span key={item} className={styles.poolChip}>
                  {item}
                  <button
                    type="button"
                    aria-label={`删除${pool.label} ${item}`}
                    onClick={() => removeOption(pool.key, item)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form
              className={styles.inlineAdd}
              onSubmit={(e) => {
                e.preventDefault();
                addOption(pool.key);
              }}
            >
              <input
                className={styles.input}
                maxLength={30}
                placeholder={pool.placeholder}
                value={poolInputs[pool.key] ?? ""}
                onChange={(e) => setPoolInputs((prev) => ({ ...prev, [pool.key]: e.target.value }))}
              />
              <button
                type="submit"
                className={styles.ghostBtn}
                disabled={!(poolInputs[pool.key] ?? "").trim() || brief.options[pool.key].length >= 24}
              >
                添加
              </button>
            </form>
          </div>
        ))}
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h3>新建笔记默认偏好</h3>
            <p>每次点击「新建」创建空白草稿时自动套用以下初始创作参数。</p>
          </div>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="def-mode">默认创作模式</label>
            <select
              id="def-mode"
              className={styles.select}
              value={brief.defaults.mode}
              onChange={(e) => patchDefaults({ mode: e.target.value as "original" | "rewrite" })}
            >
              <option value="original">原创</option>
              <option value="rewrite">参考仿写</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="def-tone">默认语气</label>
            <select
              id="def-tone"
              className={styles.select}
              value={brief.defaults.tone}
              onChange={(e) => patchDefaults({ tone: e.target.value })}
            >
              {toneChoices.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="def-length">默认篇幅</label>
            <select
              id="def-length"
              className={styles.select}
              value={brief.defaults.length}
              onChange={(e) => patchDefaults({ length: e.target.value as "short" | "standard" | "long" })}
            >
              <option value="short">短笔记（约 250 字）</option>
              <option value="standard">标准（400–600 字）</option>
              <option value="long">长文（约 800 字）</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="def-title-style">默认标题风格</label>
            <select
              id="def-title-style"
              className={styles.select}
              value={brief.defaults.titleStyle}
              onChange={(e) => patchDefaults({ titleStyle: e.target.value })}
            >
              {titleStyleChoices.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="def-tag-count">默认标签数量：{brief.defaults.tagCount} 个</label>
            <input
              id="def-tag-count"
              type="range"
              min={3}
              max={10}
              value={brief.defaults.tagCount}
              onChange={(e) => patchDefaults({ tagCount: +e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="def-intensity">默认改写力度：{brief.defaults.intensity}%</label>
            <input
              id="def-intensity"
              type="range"
              min={20}
              max={100}
              step={10}
              value={brief.defaults.intensity}
              onChange={(e) => patchDefaults({ intensity: +e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="def-angle">默认仿写角度</label>
            <select
              id="def-angle"
              className={styles.select}
              value={brief.defaults.angle}
              onChange={(e) => patchDefaults({ angle: e.target.value })}
            >
              {angleChoices.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <div className={styles.checkRow}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={brief.defaults.emoji}
                  onChange={(e) => patchDefaults({ emoji: e.target.checked })}
                />
                默认加入适量 emoji
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={brief.defaults.keepHook}
                  onChange={(e) => patchDefaults({ keepHook: e.target.checked })}
                />
                仿写默认保留钩子
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={brief.defaults.keepParagraphs}
                  onChange={(e) => patchDefaults({ keepParagraphs: e.target.checked })}
                />
                仿写默认保留分段
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={brief.defaults.keepTags}
                  onChange={(e) => patchDefaults({ keepTags: e.target.checked })}
                />
                仿写默认沿用原标签
              </label>
            </div>
          </div>
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label htmlFor="def-instructions">新稿默认补充要求（选填）</label>
            <textarea
              id="def-instructions"
              rows={2}
              className={styles.textarea}
              maxLength={2000}
              placeholder="例如：多用短句分段，适合手机端快速阅读"
              value={displayedDefaultInstructions}
              onChange={(e) => {
                setDefaultInstructions(e.target.value);
                setInstructionsDirty(true);
              }}
            />
            {instructionsDirty && displayedDefaultInstructions !== brief.defaults.instructions && (
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.tonalBtn}
                  disabled={saving}
                  onClick={() => {
                    patchDefaults({ instructions: displayedDefaultInstructions });
                    setInstructionsDirty(false);
                  }}
                >
                  保存默认补充要求
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className={styles.resetRow}>
        <button
          type="button"
          className={styles.ghostBtn}
          disabled={saving}
          onClick={() => {
            setEditingTemplate(null);
            setInstructionsDirty(false);
            void resetSection("brief");
          }}
        >
          <RotateCcw size={13} aria-hidden="true" />恢复「创作设置」默认配置
        </button>
      </div>
    </>
  );
}
