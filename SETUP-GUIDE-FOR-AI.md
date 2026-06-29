# notionblog — 一键交给 AI 的部署指南

> **这份文档是写给 AI 助手读的。** 把整个仓库交给你的朋友后，让他把这份文件丢给一个能跑命令的 AI（Claude Code / Cursor 等），AI 按下面的步骤完成部署。
>
> **核心原则：能用 API 自动做的，AI 全包；人类只做三件 API 无法替代的事**（见下方"人类只需做这 3 件事"）。不要再让人类手动一列列建 Notion 数据库——那一步已经由 `npm run notion:bootstrap` 脚本通过 Notion API 自动完成。

---

## 0. 这个项目是什么（给 AI 的背景）

用 **Notion 官方 API** + **Next.js (Pages Router)** 写的博客。内容存在 Notion 数据库里，网站实时拉取并渲染。部署在 Vercel，用 ISR 保持新鲜，**改完 Notion 不用重新部署**。

关键文件：

| 文件 | 作用 |
|------|------|
| `blog.config.js` | 站点信息 + Notion 列名映射 |
| `.env.local` | `NOTION_TOKEN`、`NOTION_DATABASE_ID`（不进 git） |
| `lib/notion.ts` | Notion 数据层 |
| `scripts/find-db.ts` | **AI 用 search API 自动定位数据库**并写回 `.env.local`（配合模板路径） |
| `scripts/bootstrap-notion.ts` | 兜底：没有模板时，AI 用 API 从零创建整个数据库 |
| `scripts/introspect.ts` | 打印数据库列名/类型，用来核对 |
| `scripts/dump-config.ts` | 打印 CONFIG-TABLE 现状 |

---

## 人类只需做这 3 件事

这三件 Notion/Vercel 的 API 都**无法**让 AI 代办（涉及账号身份与授权），其余全部由 AI 自动完成：

1. **建 Notion 集成并复制密钥**（约 1 分钟）
2. **点模板「Duplicate」复制数据库，并把集成连接到复制出的页面**（约 30 秒，无需复制 id）
3. **用浏览器完成一次 Vercel 登录授权**（`vercel login`，约 30 秒）

下面每一步 AI 都给出精确的链接和点击路径。

---

## 1. 前置确认（AI 操作）

```bash
node -v   # 需要 18+，没有则让人类去 https://nodejs.org 装 LTS
npm install
```

---

## 2. 【人类操作 ①】创建 Notion 集成 + 拿密钥

AI 把下面这段原样发给人类：

> 1. 打开 **https://www.notion.so/my-integrations**
> 2. 点 **「+ New integration」**
> 3. Name 填 `myblog`，Associated workspace 选你的工作区，Type 选 **Internal** → 点 **Save**
> 4. 进入集成页，在 **Configuration** 标签下找到 **Internal Integration Secret** → 点 **Show** → **Copy**
> 5. 把复制到的密钥（形如 `ntn_xxx` 或 `secret_xxx`）发给我

AI 拿到后：

```bash
cp .env.local.example .env.local
```

然后把 `.env.local` 里的 `NOTION_TOKEN=` 改成人类给的密钥（`NOTION_DATABASE_ID` 这一步先留空，第 4 步脚本会自动写入）。

---

## 3. 【人类操作 ②】复制模板并连接集成

数据库结构已经做成了 Notion 可复制模板，人类点一下就能把整个数据库（含列、Select 选项、示例文章、Config 行 + CONFIG-TABLE）复制进自己的工作区。AI 把下面这段发给人类：

> 1. 打开模板链接并点右上角 **「Duplicate」**：
>    **https://codgi.notion.site/129687f2b6dd8291997d0162228c2375**
>    选择复制到你自己的工作区。
> 2. 打开复制出来的页面，点右上角 **「•••」→「+ Add connections」**（中文：连接）→ 选中你在上一步创建的集成 `myblog` → 确认。
> 3. 告诉我已经完成（**不用复制任何 id**，下一步我自动定位）。

> ⚠️ 第 2 步（连接集成）最容易漏，且任何方式都绕不开——授权是按工作区授予的，模板带不过来。不连接的话 API 会报 403 / `object_not_found`。

---

## 4. 【AI 操作】自动定位数据库

人类连好集成后，一条命令用 search API 找到那个数据库并把 id 写进 `.env.local`，**无需人类手动复制 id**：

```bash
npm run notion:find
```

它会跳过同时被搜到的 CONFIG-TABLE 子库，只认带 `type`/`status` 列的主博客库。然后核对结构：

```bash
npm run notion:schema   # 打印列名/类型
npm run notion:config   # 打印 CONFIG-TABLE 现状
```

> **没有模板 / 模板失效时的兜底**：让人类只做「建一个空白页面 + 连接集成 + 发页面链接」，AI 用 API 从零建库：
> ```bash
> npm run notion:bootstrap -- "<页面链接或URL>"
> ```
> 该脚本按 `blog.config.js` 的列名创建全部列 + Select 选项 + 2 篇示例文章 + Config 行/CONFIG-TABLE，并自动写回 `NOTION_DATABASE_ID`。
>
> 如果人类要用自己**已有**的数据库：保证列名与 `blog.config.js` 的 `properties` 对齐，跑 `npm run notion:find`（或手填 id），再 `npm run notion:schema` 核对、必要时改 `blog.config.js`。

顺手改 `blog.config.js` 顶部站点信息：`title` / `description` / `author` / `link`（`link` 先填占位，部署后回来改）。

---

## 5. 【AI 操作】本地验证

```bash
npm run dev
```

打开 http://localhost:3000，能看到两篇示例文章就通了。

**排查表：**

| 现象 | 原因 / 解决 |
|------|------|
| `Set NOTION_TOKEN and NOTION_DATABASE_ID` | `.env.local` 没填全 |
| 403 / `object_not_found` | 人类操作②没把集成连接到父页面 |
| 首页空 | 文章 `status` 不在 `publishedStatuses`，或 `type` 不是 `Post` |
| 图片不显示 | 正常，走代理 `pages/api/notion-image`，线上无问题 |

---

## 6. 【AI 操作为主】部署到 Vercel

用 Vercel CLI 直接从本地部署，**无需 GitHub**。

```bash
npx vercel login      # 见下，需人类在浏览器点一下
npx vercel link --yes # 关联/新建 Vercel 项目
# 把两个密钥写进 Vercel 各环境（值与 .env.local 一致）
npx vercel env add NOTION_TOKEN production
npx vercel env add NOTION_DATABASE_ID production
npx vercel --prod     # 部署，结束后输出线上 URL
```

### 【人类操作 ③】`vercel login` 的浏览器确认

AI 运行 `npx vercel login` 后，把下面这段发给人类：

> 终端会让你选登录方式（推荐 **Continue with GitHub** 或 **Continue with Email**）。选好后浏览器会自动打开一个 Vercel 授权页，点 **「Authorize」/「确认」** 即可。回到终端看到 `Success!` 就完成了。没有 Vercel 账号也没关系，这个流程会顺带帮你注册。

> `vercel env add` 会交互式地让你粘贴值——AI 可在终端直接粘贴 `.env.local` 里的对应值；或改用 `printf '%s' "<值>" | npx vercel env add NOTION_TOKEN production` 非交互写入。

### 收尾（AI 操作）
- 把上线域名填回 `blog.config.js` 的 `link`；如启用了 Notion 的 `LINK` 配置项，也把它的值更新成真实域名并勾选启用（`scripts/seed-config.ts` 可参考）。
- 想要 git 重新部署 / 自定义域名：在 https://vercel.com 项目设置里关联 GitHub 仓库或加 **Settings → Domains**。

---

## 7. 日常使用（告诉人类）

- **写文章**：Notion 数据库新建一行，`type=Post`、`status=Published`、填 `title`/`slug`/`date`，正文写在该页面里。
- **更新生效**：ISR 默认 60 秒（`blog.config.js` 的 `revalidate`），改完 Notion 等一会儿刷新即可，**无需重新部署**。
- **改站点设置**：在 Notion 的 CONFIG-TABLE 改对应行的值并勾选「启用」，或改 `blog.config.js` 默认值。

---

## 给 AI 的执行清单（TL;DR）

1. `node -v` 确认 18+，`npm install`。
2. 【人类①】建 Notion 集成 → 拿 `NOTION_TOKEN`。`cp .env.local.example .env.local` 填进去。
3. 【人类②】点模板 **Duplicate** 复制数据库 + **连接集成**（无需复制 id）。
4. `npm run notion:find`（自动定位库 + 写 `NOTION_DATABASE_ID`）→ `npm run notion:schema` / `notion:config` 核对。兜底用 `npm run notion:bootstrap`。
5. `npm run dev` 验证首页有文章。
6. `npx vercel login`（【人类③】浏览器确认）→ `vercel link` → `vercel env add` ×2 → `npx vercel --prod`。
7. 把上线域名写回 `blog.config.js` 的 `link`。
