# PWA 部署说明

## 当前工作流

手机端填写原稿（标题可留空，AI 会生成后让你确认）、选择「需要优化」或「已定稿，直接排版」，并可附加 1–3 张候选封面照片。文章上传到 `articles/0-原始文稿/`，照片上传到 `articles/4-素材与封面/`。

电脑端在 Codex 或 Claude Code 中打开本项目后说「处理新文章」。完整规则见 [WORKFLOW.md](WORKFLOW.md)：Agent 会拉取文章、在聊天中列出队列、检索风格 DNA 与历史材料、展示完整优化稿，并在你确认后完成公众号排版和封面。

历史文件首次整理可运行：

```powershell
node aye.js migrate
```

## 调用小树觉察记录

小树觉察室可以将单条记录或全部未同步记录上传到私人内容仓库的 `5-小树觉察库/`。电脑端运行：

```powershell
node aye.js xiaoshu sync
node aye.js xiaoshu list --type reverse --since 30d
node aye.js xiaoshu search 边界
node aye.js xiaoshu show <记录ID>
```

小树记录不会进入文章待处理队列，也不会写入 `workflow.json`。日记只能上传到 Private 仓库，不能放进公开的 `aye_article` 代码仓库。

## 部署到 GitHub Pages

1. 在本仓库根目录创建 `pwa/` 目录（已完成）
2. 推送到 GitHub：

```bash
cd D:\CLAUDE\aye-article
git init
git add -A
git commit -m "初始化阿野写作 PWA + 工作流"

# 创建 GitHub 远程仓库（手动在 github.com 创建，或在命令行用 gh CLI）
# 然后推送：
git remote add origin https://github.com/xranZhao/aye_article.git
git push -u origin main
```

3. 启用 GitHub Pages：
   - 打开仓库 → Settings → Pages
   - Source: "Deploy from a branch"
   - Branch: `main`，文件夹: `/ (root)`
   - 点击 Save
   - 等几分钟后，访问 `https://xranzhao.github.io/aye_article/`

## 手机端使用

1. Safari（iPhone）或 Chrome（Android）打开上面的 URL
2. 点击分享按钮 → 「添加到主屏幕」
3. 打开主屏幕上的「阿野写作」
4. 首次使用：点击 ⚙️ 设置 → 填入 DeepSeek Key、GitHub Token、仓库名
5. 开始写作！

## 配置说明

| 配置项 | 说明 | 获取方式 |
|--------|------|----------|
| DeepSeek API Key | AI 标题生成 | https://platform.deepseek.com → API Keys |
| GitHub Token | 上传文章 | GitHub → Settings → Developer settings → Personal access tokens → 选 repo 权限 |
| GitHub 仓库 | 文章同步仓库 | 如 `sagehh/aye-articles` |
| 子目录(可选) | 文章存放路径 | 如 `articles`（留空默认根目录） |
