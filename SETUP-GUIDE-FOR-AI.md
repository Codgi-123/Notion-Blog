# notionblog — 一键交给 AI 的部署指南

> **这份文档是写给 AI 助手读的。** 把整个仓库交给你的朋友后，让他把这份文件丢给一个 AI（Claude Code / Cursor / 任意能跑命令的 AI），AI 按下面的步骤一步步带他配好 Notion、Vercel 和所有配置即可。人类只需要在 Notion 和浏览器里点几下、复制几个密钥。

---

## 0. 这个项目是什么（给 AI 的背景）

一个用 **Notion 官方 API** + **Next.js (Pages Router)** 写的博客。内容全部存在 Notion 数据库里，网站从 Notion 实时拉取并用自带的 React 渲染器把 Notion block 渲染成网页。部署在 Vercel，用 ISR（增量静态再生）保持内容新鲜，**改完 Notion 不用重新部署**。

关键文件：

| 文件 | 作用 |
|------|------|
| `blog.config.js` | 站点信息 + Notion 列名映射（最常改的文件） |
| `.env.local` | 两个密钥：`NOTION_TOKEN`、`NOTION_DATABASE_ID`（不进 git） |
| `lib/notion.ts` | Notion 数据层（拉文章、拉 block） |
| `components/NotionBlock.tsx` | 把 Notion block 渲染成 HTML |
| `pages/` | 路由：首页、文章、标签、分类、sitemap |
| `scripts/introspect.ts` | 打印 Notion 数据库的列名/类型，用来核对 `blog.config.js` |

不需要任何数据库或后端服务，Notion 就是数据库。

---

## 1. 前置条件（确认人类已具备）

- ✅ 有一个 Notion 账号
- ✅ 拿到了这套代码（这个仓库）
- ✅ 本机装了 **Node.js 18+**（`node -v` 验证；没有就让他去 https://nodejs.org 装 LTS）
- ⬜ 还没有 Vercel 账号 —— 第 6 步会注册（用 GitHub 登录最省事）

---

## 2. 在 Notion 里建数据库（人类操作，AI 给指令）

让人类在 Notion 新建一个 **Database - Full page**，然后建下面这些列。**列名要和这里完全一致**（包括大小写），这样就不用改配置。类型必须对上：

| 列名 | Notion 类型 | 说明 |
|------|-------------|------|
| `title` | Title | 文章标题（每个 Notion 库自带一个，把它改名成 `title`） |
| `slug` | Text | URL 里用的短名，如 `hello-world`；留空会用页面 id |
| `status` | Select | 文章状态，选项里要有 `Published`（见下方发布规则） |
| `summary` | Text | 摘要/简介 |
| `tags` | Multi-select | 标签 |
| `category` | Select | 分类 |
| `date` | Date | 发布日期 |
| `type` | Select | 内容类型，选项见下表 |
| `icon` | Text | 可选：FontAwesome 图标类名（给菜单/页面用） |
| `order` | Number | 可选：菜单排序用，不需要可以不建 |

**`status` 列的发布规则**：只有状态等于 `Published`、`Public` 或 `已发布` 的行才会显示在网站上（其余视为草稿）。这几个值定义在 `blog.config.js` 的 `publishedStatuses`，可改。

**`type` 列的选项**（决定每一行是什么）：

| `type` 的值 | 含义 |
|------|------|
| `Post` | 博客文章，路由 `/article/[slug]` |
| `Page` | 独立页面，路由 `/[slug]` |
| `Menu` | 顶部导航项 |
| `SubMenu` | 紧跟在某个 Menu 下面的下拉子项 |
| `Notice` | 站点公告 |
| `About` | 首页"关于我"区块 |
| `Friends` | 首页"友情链接"区块 |
| `Config` | 站点配置行（高级，可不用） |

让人类先建 1~2 行 `type=Post` 的测试文章，填上 `title` / `slug` / `status=Published` / `date`，方便后面验证。

---

## 3. 创建 Notion 集成并授权数据库（人类操作）

1. 打开 https://www.notion.so/my-integrations → **New integration** → 起个名（如 `myblog`）→ 创建。
2. 复制它的 **Internal Integration Secret**（形如 `secret_xxx` 或 `ntn_xxx`）。这就是 `NOTION_TOKEN`。
3. 回到刚建的数据库页面 → 右上角 `•••` → **Connections / 连接** → 添加刚创建的集成。
   > ⚠️ 这一步最容易漏。不授权的话 API 读不到数据，后面会报 403 / object_not_found。

**拿数据库 ID**：在浏览器打开数据库页，URL 形如
`https://www.notion.so/xxxx/260687f2b6dd80fb9812f1c474d67592?v=...`
其中 `?v=` **前面**那一长串就是 `NOTION_DATABASE_ID`（32 位十六进制，带不带连字符都行）。

---

## 4. 配置代码（AI 操作）

在仓库根目录：

```bash
cp .env.local.example .env.local
```

然后 AI 把人类给的两个值写进 `.env.local`：

```
NOTION_TOKEN=secret_把刚才复制的密钥粘这里
NOTION_DATABASE_ID=把数据库id粘这里
```

> 注意：`.env.local.example` 里预填的 `NOTION_DATABASE_ID` 是原作者的库，**必须换成朋友自己的**。

装依赖并核对数据库结构：

```bash
npm install
npm run notion:schema
```

`npm run notion:schema` 会打印出 Notion 数据库的真实列名和类型。**AI 拿这个输出和第 2 步的表对照**：
- 如果列名和上表完全一致 → 不用改 `blog.config.js`。
- 如果人类用了别的列名（比如标题列叫 `Name` 没改成 `title`）→ AI 去 `blog.config.js` 的 `properties` 里把右边的值改成实际列名。缺的列会优雅降级，不会崩。

顺手改一下 `blog.config.js` 顶部的站点信息：`title` / `description` / `author` / `lang` / `link`（`link` 填最终上线域名，先填占位也行，部署后再回来改）。

---

## 5. 本地验证（AI 操作）

```bash
npm run dev
```

打开 http://localhost:3000 ：
- 首页能看到第 2 步建的测试文章 → ✅ 通了。
- 报错或空白 → 按下面排查。

**常见错误：**

| 现象 | 原因 / 解决 |
|------|------|
| `Set NOTION_TOKEN and NOTION_DATABASE_ID` | `.env.local` 没填或没建 |
| 403 / `object_not_found` | 第 3 步没把集成连接到数据库 |
| 首页空的，没文章 | 文章 `status` 不在 `publishedStatuses` 里（改成 `Published`），或 `type` 不是 `Post` |
| 图片不显示 | 正常，Notion 图片走代理 `pages/api/notion-image`；线上没问题 |

---

## 6. 部署到 Vercel（人类操作为主，AI 给指令）

朋友**没有 Vercel 账号**，按这个顺序最顺：

### 6a. 先把代码推到 GitHub
1. 人类在 https://github.com/new 建一个**私有**空仓库（别勾任何初始化文件）。
2. AI 在本地执行（把 URL 换成新仓库的）：
   ```bash
   git remote remove origin 2>/dev/null; git remote add origin <新仓库URL>
   git add -A && git commit -m "init my notion blog"
   git push -u origin main
   ```
   > `.env.local` 已被 `.gitignore` 忽略，密钥**不会**进 git，放心推。

### 6b. 在 Vercel 导入
1. 人类打开 https://vercel.com/signup → 选 **Continue with GitHub** 注册登录。
2. **Add New… → Project** → 选刚推的那个仓库 → **Import**。
3. Framework 会自动识别成 **Next.js**，构建命令/输出目录都不用改。
4. 展开 **Environment Variables**，加两个（和 `.env.local` 里一模一样）：
   - `NOTION_TOKEN` = `secret_xxx`
   - `NOTION_DATABASE_ID` = 数据库 id
5. **Deploy**。等一两分钟，Vercel 给一个 `xxx.vercel.app` 域名，打开就是线上博客。

### 6c. 收尾
- 把上线域名填回 `blog.config.js` 的 `link`，commit + push，Vercel 会自动重新部署。
- 想用自己的域名：Vercel 项目 → **Settings → Domains** 添加并按提示配 DNS。

---

## 7. 日常使用（告诉人类）

- **写文章**：在 Notion 数据库新建一行，`type=Post`、`status=Published`、填 `title`/`slug`/`date`，正文直接写在该 Notion 页面里。
- **更新生效**：网站用 ISR，默认 60 秒（`blog.config.js` 的 `revalidate`）。改完 Notion 等一会儿刷新即可，**无需重新部署**。
- **改站点设置/加菜单/友链**：改 `blog.config.js` 或在 Notion 里加对应 `type` 的行。

---

## 给 AI 的执行清单（TL;DR）

1. 确认 Node 18+。
2. 指导人类在 Notion 建库（第 2 步的列）+ 建集成 + **连接集成到库**（第 3 步）。
3. 拿到 `NOTION_TOKEN` 和 `NOTION_DATABASE_ID`。
4. `cp .env.local.example .env.local` 并填值（**务必替换示例里的 database id**）。
5. `npm install && npm run notion:schema`，按输出核对/修正 `blog.config.js` 的 `properties`。
6. `npm run dev` 本地验证首页有文章。
7. 推 GitHub（私有库）→ Vercel 用 GitHub 登录导入 → 配两个环境变量 → Deploy。
8. 把上线域名写回 `blog.config.js` 的 `link`。
