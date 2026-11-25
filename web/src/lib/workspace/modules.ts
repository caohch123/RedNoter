/**
 * 工作区模块注册表：侧边栏和工作区首页都从这里读取。
 * 接入一个模块 = 在 src/app/(workspace)/workspace/<slug>/page.tsx 里替换占位页，
 * 并把这里的 ready 改成 true。
 */
export type WorkspaceModule = {
  slug: string;
  name: string;
  desc: string;
  ready: boolean;
};

export const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    slug: "create",
    name: "AI 创作",
    desc: "原创模式与仿写模式，生成、预览并保存笔记。",
    ready: true,
  },
  {
    slug: "topics",
    name: "话题追踪",
    desc: "实时热门话题与笔记，支持分类刷新。",
    ready: true,
  },
  {
    slug: "assets",
    name: "素材库",
    desc: "图片、视频、文案、标题、标签结构化存储。",
    ready: true,
  },
  {
    slug: "publish",
    name: "发布管理",
    desc: "草稿箱、待发布、已发布状态管理。",
    ready: true,
  },
];
