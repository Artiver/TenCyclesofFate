# `src/frontend` 功能梳理（Vue3 重构基线）

> 目标：把现有原生 JS 前端的**全部可见功能、状态依赖、接口契约和隐性约定**整理成可逐项验收的清单，供 `src/vue-project` 重构使用。
> 依据文件：`src/frontend/{index.html,index.js,index.css,favicon.svg}`，并对照后端 `src/tencyclesoffate/**` 校验接口与字段。

---

## 1. 现状概览

| 项 | 内容 |
|---|---|
| 文件 | `index.html`(120 行)、`index.js`(798 行)、`index.css`(825 行)、`favicon.svg` |
| 架构 | 无框架、无构建、无路由。单个 `appState` 对象 + 手写 DOM 渲染（全量 `innerHTML` 重绘） |
| 页面 | 仅两个“视图”：`#login-view`、`#game-view`，用 `.view.active` + `hidden` 切换（`index.js:282`） |
| 通信 | `fetch` 调 `/api/*`（HttpOnly Cookie 鉴权）+ WebSocket `/api/ws`（gzip + JSON Patch 增量） |
| 后端托管 | FastAPI 把 `src/frontend` 直接挂载在 `/`（`main.py:56`），生成的图片挂在 `/generated-images` |
| 第三方 | CDN 引入 `marked`、`DOMPurify`、`pako`、`fast-json-patch`；`clarity` 统计；Google Fonts（CSS `@import`） |

---

## 2. 页面与布局

### 2.1 登录视图 `#login-view`
- 标题「浮生十梦」+ 引导语「此乃试炼之地，请先表明身份。」
- 表单：用户名（`pattern="[A-Za-z0-9_]+"`，`autocomplete=username`）、密码（`autocomplete` 在登录/注册间切换 `current-password` / `new-password`）、提交按钮、「没有账号？注册 / 已有账号？登录」切换按钮。
- 错误文案区 `#login-error`。
- 视图本身是居中的「玉牌」卡片（`.auth-form`）。

### 2.2 游戏视图 `#game-view`
CSS Grid 三行两列布局（`index.css:209`）：
```
header  header
status  main
status  action
```
- **Header**：标题「浮生一梦」+ 「剩余机缘: N」+ 按钮组：存档 / 读档 / 删除存档 / 收起状态 / 登出 / 注销账户。
- **Status 侧栏**（`#status-panel`）：标题「【人物业力】」+「收起」按钮 + 折叠后的竖向「人物业力」轨道按钮 + `current_life` 递归渲染区。
- **主叙事区**（`#narrative-window`）：`display_history` 逐条 Markdown 渲染，可滚动。
- **底部行动区**（`#action-area`）：文本输入框 + 「定」按钮；另有「开启下一次试炼」按钮（默认 `hidden`）。
- **响应式**：`max-width: 850px` 时侧栏变成覆盖式抽屉（`translateX`），初始自动折叠（`index.js:590`）；`min-width:1920px / 2560px` 提升 `html` 字号。
- **主题**：江南园林风，深木底 + 白玉半透面板 + 印章红点缀；CSS 变量集中在 `:root`（`index.css:6`）。

### 2.3 全局浮层（与视图同级）
| 浮层 | 触发 | 行为 |
|---|---|---|
| `#scene-background-image` | 叙事中出现「已加载成功」的图片 | 取最新一张图作为整页背景，`opacity 0.2`，`body.has-scene-background` 联动面板透明度 |
| `#loading-spinner` | 首次初始化（此时无 `gameState`） | 全屏遮罩 + 旋转圈；有 `gameState` 后改用按钮内小 spinner |
| `#roll-overlay` | `roll_event.id` 变化 | 骰盅动画 → 1s 后显示结果 → 3s 后整体隐藏 |
| `#modal-overlay` | `showAlert` / `showConfirm` | 替代原生 `alert/confirm` 的主题化对话框 |

---

## 3. 功能清单（按用户可感知行为）

### 3.1 认证
1. **自动登录探测**：页面加载即 `POST /api/game/init`；成功 → 进游戏；`401` → 静默回登录页（`index.js:738`）。
2. **登录 / 注册**（同一表单，`isRegisterMode` 切换）：
   - 前端校验：用户名/密码非空；用户名 `^[A-Za-z0-9_]+$`；错误直接写 `#login-error`。
   - 请求期间禁用提交按钮。
   - 成功后立刻 `initializeGame()`（服务端已种下 HttpOnly Cookie，前端不接触 token）。
3. **登出**：`POST /api/logout`（服务端清 Cookie 并 302 到 `/`），前端随后 `window.location.href='/'` 强制整页刷新，确保所有内存状态清空。
4. **注销账户**：二次确认文案强调「永久删除账号及其全部数据（存档、命途、兑换码）且不可恢复」→ `DELETE /api/account` → 成功后：禁止重连、关闭 WS、清空 `gameState / saveInfo / isFirstRender`、移除页面背景图、回到登录视图、弹提示「账号已注销，此界与此身，皆成过往。」；`409` 显示「正在处理中，暂无法注销」。

### 3.2 游戏循环
1. **状态同步**：`POST /api/game/init` 拿全量 `gameState` → 拉 `GET /api/game/save` 拿 `saveInfo` → 首次渲染 → 切换到游戏视图 → 建立 WebSocket（`index.js:738`）。
2. **开始试炼**：底部红色按钮，点击发送动作字符串 `"开始试炼"`（`index.js:791`）。按钮文案/可用性见 §5.4。
3. **提交行动**：输入框内容或回车 → `socket.send({action})`，输入框清空；空内容不发送。
4. **AI 处理中**：`gameState.is_processing === true` 时输入框与按钮禁用、「定」按钮改为 spinner；SSE 之外的变化都靠 WS 推送回来。
5. **判定动画**：服务端在 `roll_event` 里给出 `{id,type,target,sides,result,outcome}`，前端按 `id` 去重后播放层；`outcome` 为 大成功/成功/失败/大失败 时颜色不同；结果值单独大字号显示。
6. **叙事点「破碎虚空」等**：无独立按钮，全部通过自然语言输入完成——前端不感知具体玩法分支。
7. **每次渲染**：
   - 重建整段历史 DOM；
   - 首次渲染直接跳到底部，之后以 150px/s 缓动滚到底（`smoothScrollToBottom`）；
   - 用户滚轮/触摸时中断自动滚动，2s 后恢复允许；
   - 触发场景背景图更新。

### 3.3 存档
| 操作 | 确认文案 | 接口 | 成功后 |
|---|---|---|---|
| 存档/覆盖存档 | 「确定保存当前进度吗？」/「已有存档，确定覆盖吗？」 | `POST /api/game/save` | 用返回的 `saveInfo` 刷新按钮，提示「存档成功」 |
| 读档 | 「读档将覆盖当前进度，确定继续吗？」 | `POST /api/game/load` | 用返回值整体替换 `gameState` 并重绘，提示「读档成功」 |
| 删除存档 | 「确定删除存档吗？此操作不可恢复。」 | `DELETE /api/game/save` | 刷新 `saveInfo`，提示「存档已删除」 |

约束：`is_processing` 时三个按钮全部禁用；无存档时读档/删除禁用；有存档时存档按钮文案变「覆盖存档」。错误码映射：`409` → 后端 detail（处理中）、`404` → 「暂无存档」、其余 → 通用失败文案。

### 3.4 侧栏折叠
- 桌面：收起后侧栏宽度降为 48px，仅剩竖排「人物业力」按钮可展开。
- 移动（≤850px）：收起 = 抽屉滑出屏幕；展开为覆盖式全屏面板。
- 初始状态按 `matchMedia('(max-width: 850px)')` 决定；**不持久化**，窗口尺寸变化也不重算。

### 3.5 对话框系统
- `showAlert(msg, {title})`：单按钮「知晓」，`title` 默认「天机所示」。
- `showConfirm(msg)`：双按钮「确定 / 取消」，返回 `Promise<boolean>`。
- 交互：点击遮罩 = 有取消按钮则取消、否则确认；`Enter` 确认、`Escape` 取消；确认按钮自动聚焦；关闭时有 200ms 渐隐。

---

## 4. 状态字段消费清单

前端只读后端下发的 session（WS `full_state` 已剔除 `internal_history`）。

| 字段 | 类型 | 前端用途 |
|---|---|---|
| `opportunities_remaining` | int | Header「剩余机缘」数字；行动区显示/隐藏与按钮文案判据 |
| `daily_success_achieved` | bool | 成功通关 → 隐藏输入行、显示禁用按钮「今日功德圆满」 |
| `is_in_trial` | bool | 是否处于试炼中；决定输入行是否显示 |
| `is_processing` | bool | 全局交互禁用 + 小 spinner；`true` 时 even 存档/读档/注销都被拦 |
| `current_life` | object\|null | 侧栏「人物业力」递归渲染；`null` 时显示「静待天命...」 |
| `display_history` | string[] | 叙事区逐条 Markdown 渲染 + 场景背景图来源 |
| `roll_event` | object\|null | 判定动画；按 `id` 去重；服务端处理完会置回 `null` |
| `session_date` / `redemption_code` | — | **前端未使用**（兑换码/日期没有任何 UI 呈现） |

`saveInfo`：`{has_save, saved_at, session_date}` 或 `{has_save:false}`。前端仅用 `has_save`，`saved_at`/`session_date` 未展示（可作为重构后的增强点）。

---

## 5. 渲染规则

### 5.1 叙事条目
- 每条字符串经 `marked.parse` → `DOMPurify.sanitize`：
  - `USE_PROFILES: {html:true}`
  - 禁标签：`script/style/iframe/object/embed/link/meta`
  - 禁属性：`onerror/onload/onclick/onmouseover/onfocus/onmouseenter/onmouseleave/style`
- 分类增补 class：`"> "` 开头 → `.user-input-message`；`"【"` 开头 → `.system-message`。**注意：CSS 中这两个类没有定义任何样式**（应为死代码/待补样式）。
- 图片：`![场景插画](/generated-images/xxx.png)` 由后端追加进 `display_history`（`game_logic.py:125`）。

### 5.2 场景背景提取算法（`index.js:477`）
1. `requestAnimationFrame` 后扫描 `#narrative-window img[src]`；
2. 从后往前找第一张 `complete && naturalWidth>0` 的图；
3. 找到 → 设为背景并加 `body.has-scene-background`；
4. 没找到但有图 → 给每张图挂 `load/error` 一次性回调再重算；
5. 完全没图 → 移除背景类与 `src`。

### 5.3 人物业力递归渲染（`index.js:504`）
- 顶层键 → 每个 `<details><summary>键名</summary>` 折叠块；
- 值递归：对象 → 缩进 `level*10px` 的 `.property-item`（`key: ` + 值），数组 → 逐项展开，标量 → `.property-value`；
- 折叠默认展开（未设 `open`）。

### 5.4 行动区按钮状态机（`index.js:456`）
| 条件 | 输入行 | 试炼按钮 |
|---|---|---|
| `is_in_trial` | 显示 | 隐藏 |
| `daily_success_achieved` | 隐藏 | 显示、禁用、文案「今日功德圆满」 |
| `opportunities_remaining < 0`（后端用 `-10` 作「天道斥逐」哨兵，`game_logic.py:737`） | 隐藏 | 隐藏 |
| `0 <= opportunities <= 0` 且不在试炼 | 隐藏 | 显示、禁用、文案「机缘已尽」 |
| 其余（试炼已结束、仍有机缘） | 隐藏 | 显示；`opportunities===10` → 「开始第一次试炼」，否则「开启下一次试炼」；`is_processing` 时禁用 |

### 5.5 自动滚动（`index.js:315`）
- 目标滚动距离 < 50px 时最多重试 10 次（每 100ms），避免内容未布局完就放弃；
- 二次缓动（`1-(1-p)^2`），速度 150px/s；
- `wheel` / `touchstart` 立即中断并被标记为用户滚动，`touchend`/2s 后解除；
- 首次渲染（含断线重连后重绘）直接 `scrollTop = scrollHeight`。

---

## 6. HTTP 接口契约

基址 `/api`，全部依赖 HttpOnly `token` Cookie，无 `Authorization` 头。

| 方法 | 路径 | 请求体 | 成功响应 | 前端处理 |
|---|---|---|---|---|
| POST | `/api/register` | `{username,password}` | `{username,user_id}` + Set-Cookie | 400 → detail 文案 |
| POST | `/api/login` | `{username,password}` | 同上 | 400/401 → detail（「用户名或密码错误」） |
| POST | `/api/logout` | — | 302 `Location: /` + 清 Cookie | 前端跳 `/` |
| DELETE | `/api/account` | — | `{deleted:true}` + 清 Cookie | 409 → 「正在处理中，暂无法注销」 |
| POST | `/api/game/init` | — | 完整 session | 401 → 视为未登录 |
| POST | `/api/game/save` | — | `{has_save:true,saved_at,session_date}` | 409 → detail |
| GET | `/api/game/save` | — | `{has_save,...}` / `{has_save:false}` | 失败时 `saveInfo=null` 且不阻断进入游戏 |
| POST | `/api/game/load` | — | 完整 session | 409/404 → 文案 |
| DELETE | `/api/game/save` | — | saveInfo | 404 → 「暂无存档」 |

---

## 7. WebSocket 契约

- 地址：`ws(s)://<host>/api/ws`，`binaryType='arraybuffer'`；鉴权走 Cookie（服务端 `ws.py:13`），**URL 不带 token**。
- 服务端消息统一 gzip 压缩的二进制 JSON：**必须用 `pako.ungzip` 解压后再 `JSON.parse`**（也有非二进制兜底分支）。
- 接收消息类型：

| type | 载荷 | 前端行为 |
|---|---|---|
| `full_state` | `{data: session}`（已剔除 `internal_history`） | 整体替换 `gameState` → 检查判定事件 → 重绘 |
| `patch` | `{patch: JSONPatch[]}` | 仅当已有 `gameState` 时 `jsonpatch.applyPatch(state, patch, true, false)` 取 `newDocument`；失败仅 `console.error` |
| `error` | `{detail}` | 弹窗「WebSocket Error: …」，标题「连接异常」 |

- 发送：`{action: string}`。
- 生命周期：
  - 连接成功 `console.log("WebSocket established.")`；
  - `onclose` 且非主动断开 → 显示全屏 spinner，**每 5s 无限重连**；
  - 发送前若 `readyState !== OPEN` → 弹「连接已断开，请刷新。」
  - 主动断开场景（注销账户）用 `preventReconnect` 标志抑制重连。
- 服务端行为补充（影响前端设计）：连接后若已有 session 会**先推一次 full_state**；之后更新有 70ms 级 debounce + 差分，若 patch 体积 ≥ 全量 80% 则改推全量。

---

## 8. 资源与依赖

| 类别 | 现状 | 重构建议 |
|---|---|---|
| Markdown | CDN `marked` | `pnpm add marked` |
| 净化 | CDN `dompurify@3.1.7` | `pnpm add dompurify` + `@types/dompurify`（新版已内置类型） |
| 压缩 | CDN `pako@2.1.0` | `pnpm add pako` |
| 增量 | CDN `fast-json-patch@3.1.1` | `pnpm add fast-json-patch` |
| 统计 | 微软 Clarity 内联脚本 | 可选，移到 `index.html` 或按需加载 |
| 字体 | CSS `@import` Google Fonts（Ma Shan Zheng / ZCOOL KuaiLe） | 移到 `index.html` 或改为本地/自托管；注意现有 `@import` 写在 `:root{}` 之后，**CSS 规范要求 `@import` 在最前，浏览器会丢弃该导入**（字体实际可能未生效） |
| 图标 | `favicon.svg`（前端目录） | 复制进 `public/`，`index.html` 改 `<link rel="icon" href="/favicon.svg">` |
| 主题 | `index.css` 全部样式 | 拆为 `assets/styles/{variables,base,layout,component,responsive}.css` 或全局 + 组件 `<style scoped>` |

---

## 9. 重构必须保留 / 需要修正的隐性约定

**必须保留（否则功能回归）**
1. 所有请求同源、依赖 HttpOnly Cookie，前端绝不拼接/存储 token。
2. WS 二进制 gzip 解压 + JSON Patch 增量应用；`patch` 到达时若无基线状态要安全忽略。
3. `roll_event.id` 去重：同一判定只播一次动画；`roll_event` 会被后端复位为 `null`。
4. 「开始试炼」动作字符串必须精确为 `开始试炼`（后端 `game_logic.py:743` 按字面量匹配，也接受「开启下一次试炼」「开始第一次试炼」）。
5. `opportunities_remaining === -10` 是「天道斥逐」哨兵，不是普通数字，UI 必须把 `<0` 与 `>0` 分开处理。
6. 输入行隐藏 ≠ 不能行动：试炼结束后由「开始试炼」按钮驱动，且**该动作允许在 `is_processing` 时放行**（原代码 `index.js:726` 注释说明是为了避免 `finally` 前被锁死）。
7. 404 全局重定向：后端任何 404 都 302 到 `/`（`main.py:46`），因此**不能用 `createWebHistory` 加多路径**，否则刷新 `/game` 会被绕回根路径而丢掉路由。重构建议二选一：
   - 用 `createWebHashHistory()`（最省事）；
   - 或用 history 模式但把游戏态放根路由 `/`、登录态放 `/login`，并在后端为 SPA 增加 fallback。
8. 开发期需在 Vite 配置 `/api` 代理，且 WS 必须在代理里启用：
   ```ts
   server: { proxy: {
     '/api': { target: 'http://127.0.0.1:<PORT>', changeOrigin: true, ws: true },
     '/generated-images': { target: 'http://127.0.0.1:<PORT>', changeOrigin: true },
   }}
   ```
   生产构建产物需由 FastAPI 托管（或把 `build.outDir` 指到 `src/frontend` 之类的位置）。

**建议修正**
- `.user-input-message` / `.system-message` 两个 class 无对应样式 → 重构时要么补样式（用户输入用引文色、系统提示用朱批色），要么删掉。
- `roll-overlay` 的两个 `setTimeout` 未清理，连续判定会叠加隐藏时序 → 改用可取消的定时器/动画状态机。
- 每次渲染全量重建叙事 DOM：会丢失 `<details>` 展开状态、图片重新加载、滚动抖动 → 重构时用 `v-for` + `key`（可用索引或消息 id），并给图片加 `loading="lazy"`。
- 无 `aria-live`：新叙事对读屏不可感知；弹窗缺焦点陷阱与焦点归还。
- 重连无上限、无指数退避、断线期间无「正在重连」提示（只有全屏 spinner，且会盖住已有内容）。
- 窗口 resize 不重算侧栏折叠态；折叠态不持久化。
- `saved_at`、`session_date`、`redemption_code`、`user_id/username` 均已下发但没有任何 UI，可作为重构后的信息展示增强。
- 内联 Clarity 脚本会拖慢首屏，且生产环境属隐私项，建议条件启用。

---

## 10. Vue3 重构映射建议

```
src/vue-project/
├─ index.html                      # title=浮生十梦, favicon.svg, 字体/Clarity
├─ vite.config.ts                  # /api + /generated-images 代理（ws:true）
├─ src/
│  ├─ main.ts                      # createApp + pinia + router + 全局样式
│  ├─ App.vue                      # <RouterView/> + 全局浮层容器 + 背景图层
│  ├─ router/index.ts              # /login, /game, 守卫: 未登录跳 /login
│  ├─ services/
│  │  ├─ http.ts                   # fetch 封装: 统一错误码→中文文案、401 处理
│  │  ├─ api.ts                    # auth/game 各端点
│  │  └─ socket.ts                 # WS: gzip 解压、patch 应用、重连/退避、事件总线
│  ├─ stores/
│  │  ├─ auth.ts                   # 登录态、登录/注册/登出/注销
│  │  ├─ game.ts                   # gameState + saveInfo + 派生 getters(按钮状态机)
│  │  └─ ui.ts                     # loading、modal(alert/confirm 队列)、statusPanel 折叠
│  ├─ composables/
│  │  ├─ useMarkdown.ts            # marked + DOMPurify（统一安全策略）
│  │  ├─ useSmoothScroll.ts        # 自动滚动/用户中断
│  │  ├─ useSceneBackground.ts     # 叙事图 → 页面背景
│  │  └─ useRollAnimation.ts       # roll_event 去重 + 时序
│  ├─ components/
│  │  ├─ layout/GameHeader.vue, StatusPanel.vue, ActionBar.vue, NarrativeWindow.vue
│  │  ├─ common/AppModal.vue, LoadingOverlay.vue, BaseButton.vue
│  │  └─ game/RollOverlay.vue, NarrativeEntry.vue, CharacterStatusTree.vue, StatusValue.vue
│  ├─ views/LoginView.vue, GameView.vue
│  └─ assets/styles/…              # index.css 拆分
└─ docs/frontend-feature-inventory.md   ← 本文件
```

关键设计点：
- **`game.ts` getters 复刻 §5.4 状态机**（`canSubmitAction`、`isStartTrialVisible`、`startTrialLabel`、`canSave/canLoad`），组件只消费 getter，避免条件散落。
- **`socket.ts` 保持单一连接**，用 `reactive`/事件回调把 `full_state`、`patch`、`error` 交给 store；重连成功必须重新拉 `GET /api/game/save` 与 `POST /api/game/init`（或依赖服务端连接时补推 full_state）。
- **模态用队列**，避免并发 `showAlert` 覆盖（原实现只保存一个 `resolvePromise`，并发会丢）。
- **路由守卫**：`/game` 无登录态（`init` 返回 401）时 `redirect /login`；已登录访问 `/login` 时 `redirect /game`。
- **组件 props 用后端字段直传**，不要在前端复制 `internal_history` 等敏感/冗余字段。

---

## 11. 验收清单（重构后逐项对照）

- [ ] 打开根路径自动探测登录态；未登录只显示登录视图，无报错弹窗
- [ ] 登录/注册切换、文案、`autocomplete` 变化、客户端用户名校验、服务端错误文案直显
- [ ] 登录成功直接进游戏：剩余机缘数字正确、初始长文叙事完整渲染
- [ ] Markdown 渲染（标题/列表/引用/代码/图片）且 XSS 载荷被净化
- [ ] 历史条目：`> ` 与 `【` 分类样式生效
- [ ] 叙事插图能更新整页背景，无图时背景复原
- [ ] 人物业力折叠块递归展示层级与缩进，空态显示「静待天命...」
- [ ] 提交行动：回车/按钮、空输入不发、发送后清空、处理中禁用并显示 spinner
- [ ] 判定动画：只播一次、1s 出结果、3s 收起、四种结果颜色正确
- [ ] 状态机四种形态（试炼中 / 今日功德圆满 / 机缘已尽 / -10 斥逐）的输入行与按钮表现
- [ ] 首次渲染跳到底部；后续平滑滚动；滚轮中断后 2s 恢复
- [ ] 存档/覆盖存档/读档/删除存档的确认文案、禁用条件、成功与错误提示（含 409/404）
- [ ] 侧栏折叠/展开，桌面窄栏与移动抽屉两种形态，初始按 850px 断点
- [ ] 主题弹窗：Enter/Escape/点遮罩行为、单/双按钮、渐隐、焦点
- [ ] 登出后回到 `/` 且无残留状态
- [ ] 注销：确认文案、409 处理、断连不进重连、回登录视图
- [ ] WS：gzip 解压、patch 增量、错误弹窗、断线 5s 重连、主动断开不重连、断线发送提示
- [ ] 刷新页面（各路由）不被后端 404 重定向打乱
- [ ] 大屏（1920/2560）字号、移动端布局、滚动条与溢出行为