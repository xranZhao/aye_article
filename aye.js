#!/usr/bin/env node
/**
 * 阿野图文工作流的本地状态工具。
 * Agent 通过 WORKFLOW.md 调用本工具；所有用户决策留在对话框中。
 */

import { execFileSync } from 'child_process';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync,
  renameSync, rmSync, statSync, writeFileSync
} from 'fs';
import { basename, dirname, extname, join, parse } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ARTICLES = join(ROOT, 'articles');
const STAGES = {
  raw: join(ARTICLES, '0-原始文稿'),
  pending: join(ARTICLES, '1-优化待确认'),
  published: join(ARTICLES, '2-发布文稿'),
  wechat: join(ARTICLES, '3-公众号排版'),
  assets: join(ARTICLES, '4-素材与封面'),
};
const WORKFLOW_FILE = join(ARTICLES, 'workflow.json');
const STAGE_LABELS = {
  raw: '待优化', pending: '优化待确认', published: '已确认发布',
  wechat: '公众号排版完成', cover: '封面完成', final: '已定稿，直接排版'
};

function ensureLayout() {
  for (const path of Object.values(STAGES)) mkdirSync(path, { recursive: true });
  if (!existsSync(WORKFLOW_FILE)) {
    writeFileSync(WORKFLOW_FILE, JSON.stringify({ version: 1, updatedAt: now(), articles: {} }, null, 2) + '\n', 'utf8');
  }
}

function now() { return new Date().toISOString(); }
function loadWorkflow() {
  ensureLayout();
  try {
    const data = JSON.parse(readFileSync(WORKFLOW_FILE, 'utf8'));
    return { version: 1, updatedAt: now(), articles: {}, ...data, articles: data.articles || {} };
  } catch {
    return { version: 1, updatedAt: now(), articles: {} };
  }
}
function saveWorkflow(workflow) {
  workflow.updatedAt = now();
  writeFileSync(WORKFLOW_FILE, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
}
function articleId(fileName) {
  return parse(fileName).name
    .replace(/(?:[_-](?:优化版?|排版.*|封面提示词))$/u, '')
    .replace(/_预览$/u, '');
}
function fileInfo(filePath) {
  const stat = statSync(filePath);
  return { path: filePath, updatedAt: stat.mtime.toISOString(), size: stat.size };
}
function stageFile(stage, id, extension = '.md') { return join(STAGES[stage], `${id}${extension}`); }
function isContentFile(name) { return /\.(md|html|txt)$/iu.test(name); }

function gitPull() {
  try {
    execFileSync('git', ['pull', '--ff-only'], { cwd: ARTICLES, stdio: 'pipe' });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.stderr?.toString().trim() || error.message };
  }
}

function metaFor(id) {
  const candidates = [join(STAGES.raw, `${id}.meta.json`), join(STAGES.raw, `${id}.md.meta.json`)];
  for (const path of candidates) {
    if (existsSync(path)) {
      try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; }
    }
  }
  return {};
}

function upsertFromFiles() {
  const workflow = loadWorkflow();
  for (const [stage, directory] of Object.entries(STAGES)) {
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (!statSync(path).isFile() || !isContentFile(name) || name.endsWith('.meta.json')) continue;
      const id = articleId(name);
      if (!id) continue;
      const article = workflow.articles[id] ||= { id, createdAt: now(), references: [], history: [] };
      article.title = id.replace(/^\d{6}[_-]?/u, '');
      if (stage === 'raw' && /\.(md|txt)$/iu.test(name)) {
        article.raw = fileInfo(path);
        const meta = metaFor(id);
        article.mobileStatus = meta.status || article.mobileStatus || 'needs_optimization';
        article.photos = meta.photos || article.photos || [];
        article.status = article.mobileStatus === 'final' ? 'final' : (article.status || 'raw');
      }
      if (stage === 'pending' && /\.md$/iu.test(name)) { article.pending = fileInfo(path); article.status = 'pending'; }
      if (stage === 'published' && /\.md$/iu.test(name)) { article.published = fileInfo(path); article.status = article.status === 'cover' ? 'cover' : 'published'; }
      if (stage === 'wechat' && /_预览\.html$/iu.test(name)) { article.wechatPreview = fileInfo(path); article.status = article.status === 'cover' ? 'cover' : 'wechat'; }
      if (stage === 'assets') article.assets ??= [];
    }
  }
  saveWorkflow(workflow);
  return workflow;
}

function classifyLegacy(name) {
  if (/_排版_.*_预览\.html$/u.test(name)) return 'wechat';
  if (/_封面提示词\.(md|txt)$/u.test(name)) return 'assets';
  if (/(?:_优化版?|[-_]优化)\.(md|txt)$/u.test(name)) return 'pending';
  return 'raw';
}

function migrateLegacy() {
  ensureLayout();
  const moved = [];
  const removed = [];
  for (const name of readdirSync(ARTICLES)) {
    const source = join(ARTICLES, name);
    if (!statSync(source).isFile() || !isContentFile(name) || name === 'README.md') continue;
    if (name === 'workflow.json') continue;
    if (/_排版_.*\.html$/u.test(name) && !/_预览\.html$/u.test(name)) {
      const preview = join(ARTICLES, name.replace(/\.html$/u, '_预览.html'));
      if (existsSync(preview)) { rmSync(source); removed.push(name); continue; }
    }
    const stage = classifyLegacy(name);
    const normalizedName = stage === 'pending' ? `${articleId(name)}.md` : name;
    const destination = join(STAGES[stage], normalizedName);
    if (!existsSync(destination)) { renameSync(source, destination); moved.push({ from: name, to: `${basename(STAGES[stage])}/${normalizedName}` }); }
  }
  const workflow = upsertFromFiles();
  for (const item of moved) {
    const id = articleId(basename(item.from));
    const article = workflow.articles[id];
    if (article) article.history.push({ at: now(), action: 'migrated', detail: item });
  }
  saveWorkflow(workflow);
  return { moved, removed };
}

function listArticles() {
  const workflow = upsertFromFiles();
  return Object.values(workflow.articles)
    .filter(article => article.raw)
    .map(article => ({
      id: article.id,
      title: article.title,
      uploadedAt: article.raw.updatedAt,
      words: Math.ceil(article.raw.size / 3),
      status: STAGE_LABELS[article.status] || article.status,
      mobileStatus: article.mobileStatus === 'final' ? '已定稿，直接排版' : '需要优化',
      hasPhotos: article.photos?.length || 0
    }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

function confirmPublish(id) {
  ensureLayout();
  const source = stageFile('pending', id);
  if (!existsSync(source)) throw new Error(`找不到待确认稿：${source}`);
  const target = stageFile('published', id);
  copyFileSync(source, target);
  const workflow = loadWorkflow();
  const article = workflow.articles[id] ||= { id, createdAt: now(), references: [], history: [] };
  article.published = fileInfo(target);
  article.status = 'published';
  article.history.push({ at: now(), action: 'confirmed_publish' });
  saveWorkflow(workflow);
  return { id, published: target };
}

function help() {
  console.log(`\n🌿 阿野图文工作流\n\n  node aye.js sync              拉取文章库并更新状态\n  node aye.js list [--json]     列出待处理文章\n  node aye.js migrate           迁移旧文件到 0-4 阶段目录\n  node aye.js confirm <文章ID>  将待确认稿复制为发布文稿\n`);
}

function main() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (!existsSync(ARTICLES)) throw new Error(`找不到文章库：${ARTICLES}`);
  if (command === 'sync') { const pull = gitPull(); const workflow = upsertFromFiles(); console.log(JSON.stringify({ pull, articles: Object.keys(workflow.articles).length }, null, 2)); return; }
  if (command === 'migrate') { console.log(JSON.stringify(migrateLegacy(), null, 2)); return; }
  if (command === 'list') { const items = listArticles(); if (args.includes('--json')) console.log(JSON.stringify(items, null, 2)); else console.table(items); return; }
  if (command === 'confirm') { console.log(JSON.stringify(confirmPublish(args[0]), null, 2)); return; }
  help();
}

try { main(); } catch (error) { console.error(`❌ ${error.message}`); process.exitCode = 1; }
