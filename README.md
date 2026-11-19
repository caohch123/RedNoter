# 摘星

AI 驱动的小红书内容创作工作台。

| 目录 | 内容 |
| --- | --- |
| [`web/`](web/) | 前端工程（Next.js + TypeScript + Tailwind）：官网首页、登录 / 注册、工作区外壳。启动方式、目录结构、接口契约见 [`web/README.md`](web/README.md) |
| `*.html` | 早期的静态原型（首页、登录、AI 创作、话题追踪、素材库、发布管理），仅作设计参考 |

## 快速开始

```bash
cd web
npm install
npm run dev
```

打开 http://localhost:3000 。后端未接入时，登录使用本地 mock 接口。

## 采集与图片清理工具

采集工具已包含在 tools/xhs。环境准备、初始化、采集命令和图片删除功能说明见 [工具运行说明](tools/README.md)。
