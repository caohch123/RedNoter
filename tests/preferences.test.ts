import test from "node:test";
import assert from "node:assert/strict";
import { emptyDraft } from "../server/domain.js";
import {
  applyBriefDefaultsToDraft,
  DEFAULT_USER_PREFERENCES,
  normalizeUserPreferences,
  resetPreferencesSection,
  userPreferencesSchema,
} from "../server/preferences.js";

test("DEFAULT_USER_PREFERENCES 符合 schema 且默认新建参数与 emptyDraft 一致", () => {
  const parsed = userPreferencesSchema.parse(DEFAULT_USER_PREFERENCES);
  assert.equal(parsed.version, 1);
  assert.ok(parsed.create.brief.templates.length >= 2);
  assert.equal(parsed.create.chat.quickCommands.length, 6);
  assert.equal(parsed.create.chat.starterChips.length, 3);
  assert.ok(parsed.create.canvas.emojis.length >= 5);

  const initialDraft = applyBriefDefaultsToDraft(emptyDraft, parsed);
  assert.deepEqual(initialDraft, emptyDraft);
});

test("normalizeUserPreferences 兼容空值/缺省字段并去重与清理 # 前缀", () => {
  const fromNull = normalizeUserPreferences(null);
  assert.deepEqual(fromNull, DEFAULT_USER_PREFERENCES);

  const partial = normalizeUserPreferences({
    version: 1,
    create: {
      brief: {
        options: {
          categories: ["通勤箱包", "  通勤箱包 ", "家居好物", ""],
        },
        defaults: {
          mode: "rewrite",
          tagCount: 8,
        },
      },
      chat: {
        globalInstructions: "不要用夸张词",
      },
      canvas: {
        presetTags: ["#好物分享", "好物分享", " #日常记录 ", ""],
        defaultView: "preview",
      },
    },
  });

  assert.deepEqual(partial.create.brief.options.categories, ["通勤箱包", "家居好物"]);
  assert.equal(partial.create.brief.defaults.mode, "rewrite");
  assert.equal(partial.create.brief.defaults.tagCount, 8);
  assert.equal(partial.create.chat.globalInstructions, "不要用夸张词");
  assert.deepEqual(partial.create.canvas.presetTags, ["好物分享", "日常记录"]);
  assert.equal(partial.create.canvas.defaultView, "preview");
  assert.equal(partial.create.brief.templates.length, DEFAULT_USER_PREFERENCES.create.brief.templates.length);
});

test("resetPreferencesSection 仅重置目标子模块，保留其他子模块配置", () => {
  const customized = normalizeUserPreferences({
    version: 1,
    create: {
      brief: {
        defaults: { mode: "rewrite", tagCount: 9 },
        templates: [],
      },
      chat: {
        globalInstructions: "保持口语化",
      },
      canvas: {
        defaultView: "preview",
        visualStylePrompt: "奶油胶片感",
      },
    },
  });

  const resetChat = resetPreferencesSection(customized, "chat");
  assert.equal(resetChat.create.chat.globalInstructions, "");
  assert.equal(resetChat.create.brief.defaults.mode, "rewrite");
  assert.equal(resetChat.create.canvas.defaultView, "preview");
  assert.equal(resetChat.create.canvas.visualStylePrompt, "奶油胶片感");

  const resetAll = resetPreferencesSection(customized, "all");
  assert.deepEqual(resetAll, DEFAULT_USER_PREFERENCES);
});

test("applyBriefDefaultsToDraft 仅应用默认参数且不修改原始 emptyDraft", () => {
  const prefs = normalizeUserPreferences({
    create: {
      brief: {
        defaults: {
          mode: "rewrite",
          tone: "闺蜜聊天",
          length: "long",
          tagCount: 9,
          emoji: false,
          instructions: "结尾放互动问题",
        },
      },
    },
  });

  const applied = applyBriefDefaultsToDraft(emptyDraft, prefs);
  assert.equal(emptyDraft.settings.mode, "original");
  assert.equal(applied.settings.mode, "rewrite");
  assert.equal(applied.settings.tone, "闺蜜聊天");
  assert.equal(applied.settings.length, "long");
  assert.equal(applied.settings.tagCount, 9);
  assert.equal(applied.settings.emoji, false);
  assert.equal(applied.settings.instructions, "结尾放互动问题");
});
