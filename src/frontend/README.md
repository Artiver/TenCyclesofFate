# 浮生十梦 · 前端

Vue 3 + Vite + Pinia + Vue Router（hash 模式）实现的单页前端。功能与后端接口契约见
[`docs/frontend-feature-inventory.md`](./docs/frontend-feature-inventory.md)。

## 开发

```sh
pnpm install
pnpm dev        # Vite 开发服务器，/api 与 /generated-images 反代到 VITE_BACKEND_TARGET（默认 127.0.0.1:8000）
```

若要覆盖后端地址，在**本目录**（不是仓库根目录）新建 `.env.local`：

```sh
VITE_BACKEND_TARGET="http://127.0.0.1:8000"
```

## 构建

```sh
pnpm build      # vue-tsc 类型检查 + vite build，输出到 dist/
```

`src/backend/main.py` 把 `src/frontend/dist` 挂为站点根目录，所以部署前必须构建；否则后端启动时会因目录缺失直接报错。

## 目录

| 路径 | 职责 |
| --- | --- |
| `src/views` | 路由级视图（`GameView`、`LoginView`） |
| `src/components` | `common` 全局浮层 / `layout` 游戏骨架 / `game` 叙事与业力渲染 |
| `src/stores` | `auth`（登录态）、`game`（session + WS）、`ui`（浮层、折叠、背景图） |
| `src/services` | `http`（fetch 封装）、`api`（接口清单）、`socket`（gzip + JSON Patch 的 WS 客户端）、`types` |
| `src/composables` | Markdown 安全渲染、自动滚动、场景背景提取 |
| `src/assets/styles` | `theme`（设计 token）→ `base` → `auth` / `game` / `overlays` → `responsive`，按此顺序在 `main.ts` 引入 |