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
