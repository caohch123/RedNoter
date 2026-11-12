# 摘星 · Web 前端

Next.js（App Router）+ TypeScript + Tailwind CSS。包含官网首页、登录 / 注册，以及工作区外壳。

## 启动

```bash
npm install
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
│  │   └─ create | topics | assets | publish   四个模块的占位页
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

## 接入工作区模块

1. 把 `src/app/(workspace)/workspace/<模块>/page.tsx` 里的占位页换成真实页面；
2. 在 `src/lib/workspace/modules.ts` 把对应模块的 `ready` 改为 `true`。

导航、登录校验和用户菜单由 `workspace/layout.tsx` 统一提供，模块里不用再处理。

### 从静态原型搬页面时要注意

- **容器自己写**：外壳不限制内容宽度，模块页面自己包一层 `<main className="mx-auto w-full max-w-[1240px] px-5 ...">`（AI 创作原型用的是 1480px）。
- **不要搬 `<header>` 和 `<script>`**：顶部导航已由外壳提供；原型里的 `onclick="..."` 要改成 React 的状态和事件。
- **图标**：原型用的 `<iconify-icon>` 这里没有，换成 `lucide-react` 里的图标组件。
- **Tailwind 是 v4**：没有 `tailwind.config.js`，颜色等主题变量在 `src/app/globals.css` 的 `@theme` 里。原型用到的 `brand-*`、`shadow-soft`、`grid-bg`、`no-scrollbar`、`typing-dot` 都已定义，其中 `brand-*` 是紫色而不是原型的粉色。
- **配色**：原型是浅色主题，现在的外壳是深色。直接搬过来的白底卡片能正常显示，但直接写在页面背景上的深色文字（如 `text-slate-900`）会看不清，需要统一处理。
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

之后 `/api/auth/login` 会被转发到 `http://localhost:3001/auth/login`，mock 接口不再生效，前端代码无需改动。

未配置时使用 mock：用户保存在 `web/.mock/users.json`（已加入 .gitignore），删除该文件即可清空账号。
