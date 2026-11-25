# 摘星 · Web 前端

Next.js（App Router）+ TypeScript + Tailwind CSS。包含官网首页、登录 / 注册，以及工作区外壳。

## 启动

项目需要 Node.js 22.19 或更高版本。完整工作区启动步骤见[项目说明](../README.md)。

```bash
npm ci
npm run dev
```

打开 http://localhost:3000 。

## 目录结构

```
src/
├─ app/
│  ├─ (marketing)/page.tsx        官网首页 /
│  ├─ (auth)/login、register      登录 /login、注册 /register
│  ├─ (workspace)/workspace/      工作区 /workspace/*（需登录）
│  │   └─ create | topics | assets | publish   工作区模块
│  └─ api/auth/*                  mock 接口（接上后端后可删）
├─ components/
│  ├─ marketing/  auth/  workspace/  ui/
├─ lib/
│  ├─ api/        请求封装与接口类型（前后端契约）
│  ├─ mock/       本地 mock 用户库
│  ├─ workspace/modules.ts        工作区模块注册表
│  └─ validation.ts               用户名 / 密码校验规则
└─ proxy.ts       官网与工作区的跳转边界（未登录 → /login）
```

## 官网的图片和字体

- **示例图片**在 `public/showcase/`，来自 Unsplash 免费图库（可商用、无需署名），作者清单见 `public/showcase/CREDITS.md`。首屏照片墙和「作品展示」的数据在 `src/lib/marketing/showcase.ts`，标题、正文、昵称都是团队编写的示例，页面上标明了「示例作品」。换成真实作品前要先拿到作者授权，不要直接搬运小红书上别人的笔记。
- **字体**都跟随网站一起部署，不依赖谷歌，浏览器只下载页面上用到的字：
  - 标题 `font-serif`：中文思源宋体（`@fontsource/noto-serif-sc`，OFL），西文和数字 Newsreader（`@fontsource-variable/newsreader`，OFL）；
  - 点缀 `font-hand`：霞鹜文楷（`lxgw-wenkai-lite-webfont`，OFL），只用在「团队在跟你说话」的短句和那封信上。
- **首屏照片墙**在 `src/components/marketing/HeroWall.tsx`：七列照片斜着缓慢滚动，点任意一张会弹出「摘下这颗星」。
- **光影**：全站假设只有一个光源——右上方窗户照进来的暖光。
  - 树影贴图在 `public/textures/`，是程序绘制的原创素材（不涉及版权），组件是 `src/components/ui/LeafShadow.tsx`；
  - 阴影统一用 `shadow-card` / `shadow-float`（偏暖、略向左下），标题墨色用 `ink-print`。照片保持原本的鲜亮，不再统一调色。
- **写给你的一封信**的正文在 `src/components/marketing/Letter.tsx` 顶部，团队可以换成自己的话。

## 接入工作区模块

1. 把 `src/app/(workspace)/workspace/<模块>/page.tsx` 里的占位页换成真实页面；
2. 在 `src/lib/workspace/modules.ts` 把对应模块的 `ready` 改为 `true`。

导航、登录校验和用户菜单由 `workspace/layout.tsx` 统一提供，模块里不用再处理。

### 工作区开发约定

- **容器**：外壳不限制内容宽度，各模块定义自己的内容容器。
- **当前用户**：客户端组件里用 `useCurrentUser()`（`src/components/workspace/CurrentUser.tsx`），不要再单独请求 `/auth/me`。
- **请求接口**：统一用 `src/lib/api/client.ts` 的 `request()`，路径不带 `/api` 前缀；传 `FormData` 可以上传文件。每个模块在 `src/lib/api/` 下建自己的文件（参考 `auth.ts`）。
- **Next.js 是 16**：开启了 Cache Components，服务端组件里读取 cookie、`searchParams` 等请求数据时必须包在 `<Suspense>` 里，否则构建报错。写代码前先看 `AGENTS.md` 的提示。

## 登录接口契约

前端只请求同源的 `/api/*`，会话用 httpOnly cookie（`zx_session`）保存。类型定义见 `src/lib/api/types.ts`。

| 方法 | 路径 | 请求体 | 成功 | 失败 |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | `{ username, password }` | 201 `{ user }` + Set-Cookie | 400 `VALIDATION_ERROR` / 409 `USERNAME_TAKEN` |
| POST | `/auth/login` | `{ username, password }` | 200 `{ user }` + Set-Cookie | 401 `INVALID_CREDENTIALS` |
| GET | `/auth/me` | — | 200 `{ user }` | 401 `UNAUTHORIZED` |
| POST | `/auth/logout` | — | 204，清除 cookie | — |

- `user`：`{ id: string, username: string, createdAt: string }`
- 失败响应统一为 `{ code: string, message: string }`
- 用户名 3–20 位（中文、字母、数字、下划线）；密码 8–64 位，需同时包含字母和数字

## 切换到真实后端

复制 `.env.example` 为 `.env.local`，设置：

```
API_PROXY_TARGET=http://localhost:3001
```

配置后，`/api/auth/login` 会被转发到 `http://localhost:3001/auth/login`。创作相关的 `/api/v1/creation/*` 由 `CREATION_API_TARGET` 单独转发，默认指向 `http://127.0.0.1:3002`。

未配置时使用 mock：用户保存在 `web/.mock/users.json`（已加入 .gitignore），删除该文件即可清空账号。
