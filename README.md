# 阿野本地文章工作流

这是一个以电脑本地文件为中心的文章工作流：保存原稿、优化、确认定稿、公众号排版与封面都在同一个项目中完成。

## 日常只用两个入口

```powershell
./aye.ps1 overview
./aye.ps1 open <文章ID>
```

- `overview`：更新并打开 `articles/文章总览.md`，从一页中查看全部文章的标题、状态和当前文件。
- `open`：直接打开一篇文章当前应编辑的 Markdown，不需要逐层查找文件夹。

也可以在 Codex 或 Claude Code 中直接说「开始改文章」。

## 推荐流程

```powershell
./aye.ps1 download  # 下载云端新增稿件
./aye.ps1 review    # 打开合并后的选题审阅页
./aye.ps1 edit      # 列出可写、正在修改的文章
```

聊天时对应说「下载文章」「开始审稿」「修改文章」。审阅结论可用“可写 / 略过 / 已发布”，独立记录在状态文件中，不会修改原稿。

## 文件结构

```text
articles/
├─ 文章总览.md        自动生成的查找入口
├─ 0-原始文稿/        不覆盖的原文存档
├─ 1-优化待确认/      可继续修改的优化稿
├─ 2-发布文稿/        确认后的定稿
├─ 3-公众号排版/      可复制到公众号的预览 HTML
├─ 4-素材与封面/      图片、封面成品和元数据
├─ 5-小树觉察库/      写作素材库
└─ workflow.json      文章状态的唯一来源
```

完整规则见 [WORKFLOW.md](WORKFLOW.md)，具体操作见 [使用说明.md](使用说明.md)。

## 小树觉察资料库

```powershell
./aye.ps1 xiaoshu
node aye.js xiaoshu search 边界
node aye.js xiaoshu show <记录ID>
```

小树资料只作为写作素材，不会自动进入文章处理队列，也不会覆盖原始记录。
