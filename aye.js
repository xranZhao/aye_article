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
import { basename, dirname, extname, join, parse, relative } from 'path';
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
const OVERVIEW_FILE = join(ARTICLES, '文章总览.md');
const REVIEW_FILE = join(ARTICLES, '选题审阅.md');
const XIAOSHU_ROOT = join(ARTICLES, '5-小树觉察库');
const XIAOSHU_TYPES = {
  awareness: '觉察日记',
  reverse: '反向选择',
  happy: '快乐治愈',
};
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
    return { version: 1, updatedAt: now(), articles: {}, reviews: {}, ...data, articles: data.articles || {}, reviews: data.reviews || {} };
  } catch {
    return { version: 1, updatedAt: now(), articles: {}, reviews: {} };
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
    // 下载时保留正在本地修改的稿件，避免新稿同步被未提交改动阻断。
    execFileSync('git', ['pull', '--rebase', '--autostash'], { cwd: ARTICLES, stdio: 'pipe' });
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

function currentArticleFile(article) {
  if (article.status === 'pending' && article.pending?.path) return article.pending.path;
  if (article.published?.path) return article.published.path;
  if (article.pending?.path) return article.pending.path;
  if (article.raw?.path) return article.raw.path;
  return '';
}

function writeOverview(workflow) {
  const articles = Object.values(workflow.articles)
    .filter(article => article.raw || article.pending || article.published)
    .sort((a, b) => String(b.published?.updatedAt || b.pending?.updatedAt || b.raw?.updatedAt || '')
      .localeCompare(String(a.published?.updatedAt || a.pending?.updatedAt || a.raw?.updatedAt || '')));
  const lines = [
    '# 文章总览',
    '',
    '> 日常只打开这一页。它由 `workflow.json` 自动生成，不要手动修改。',
    '> 想直接打开当前稿：`./aye.ps1 open 文章ID`。',
    '',
    '| 文章 | 状态 | 当前文件 |',
    '|---|---|---|',
  ];
  for (const article of articles) {
    const target = currentArticleFile(article);
    const label = target ? basename(target) : '暂无可编辑文件';
    const link = target ? `[${label}](file:///${target.replace(/\\/gu, '/')})` : label;
    lines.push(`| ${article.id}｜${article.title || '未命名'} | ${STAGE_LABELS[article.status] || article.status} | ${link} |`);
  }
  if (articles.length === 0) lines.push('| 暂无文章 | — | — |');
  lines.push('', '## 文件夹说明', '', '- `0-原始文稿`：原稿存档，不直接改。', '- `1-优化待确认`：需要你手动修改时，通常打开这里。', '- `2-发布文稿`：已经确认的定稿。', '- `3-公众号排版`：可复制到公众号的预览页。', '- `4-素材与封面`：照片、插画和封面成品。', '');
  writeFileSync(OVERVIEW_FILE, lines.join('\n'), 'utf8');
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
  writeOverview(workflow);
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

function openArticle(id) {
  if (!id) throw new Error('请提供文章 ID');
  const workflow = upsertFromFiles();
  const article = workflow.articles[id];
  if (!article) throw new Error(`找不到文章：${id}`);
  const target = currentArticleFile(article);
  if (!target || !existsSync(target)) throw new Error(`这篇文章暂时没有可打开的稿件：${id}`);
  if (process.platform === 'win32') execFileSync('cmd', ['/c', 'start', '', target], { stdio: 'ignore' });
  else if (process.platform === 'darwin') execFileSync('open', [target], { stdio: 'ignore' });
  else execFileSync('xdg-open', [target], { stdio: 'ignore' });
  return { id, path: target };
}

// 将手机原稿和小树记录放进同一份可选清单，原文始终保留在各自的归档位置。
function listCandidates() {
  const mobile = listArticles().map(article => ({
    source: '手机原稿',
    sourceKey: 'article',
    id: article.id,
    title: article.title,
    createdAt: article.uploadedAt,
    words: article.words,
    status: article.status,
    path: loadWorkflow().articles[article.id]?.raw?.path || '',
  }));
  const xiaoshu = loadXiaoshuEntries().map(entry => ({
    source: entry.typeLabel,
    sourceKey: 'xiaoshu',
    id: entry.id,
    title: entry.title,
    createdAt: entry.createdAt,
    words: entry.words,
    status: '可改写',
    path: entry.path,
    body: entry.body,
  }));
  return [...mobile, ...xiaoshu]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const REVIEW_DECISIONS = {
  unreviewed: '待浏览',
  write: '可写',
  skip: '略过',
  published: '已发布',
};

function reviewKey(sourceKey, id) { return `${sourceKey}:${id}`; }

function normalizeReviewDecision(value) {
  const aliases = {
    '待浏览': 'unreviewed', unreviewed: 'unreviewed',
    '可写': 'write', write: 'write',
    '略过': 'skip', skip: 'skip',
    '已发布': 'published', published: 'published',
  };
  const result = aliases[value];
  if (!result) throw new Error('审阅结论只能是：待浏览、可写、略过、已发布');
  return result;
}

const TAG_RULES = [
  ['职场', /工作|领导|项目|公司|上班|交付|IT|裁员|同事|群里/u],
  ['亲密关系', /老公|对象|结婚|婚礼|伴侣|恋爱/u],
  ['家庭关系', /妈妈|爸爸|父母|家里人/u],
  ['焦虑', /焦虑|紧迫|着急|压力/u],
  ['恐惧', /恐惧|害怕|不敢|被抛弃/u],
  ['羞耻', /羞耻|丢人|不配|被看见/u],
  ['愤怒', /愤怒|生气|气愤|凭什么/u],
  ['边界', /边界|拒绝|不妥|不得体/u],
  ['背叛怀疑', /背叛|怀疑|出轨|瞎搞/u],
  ['表达恐惧', /发消息|表达.*需求|提需求|录屏|声音/u],
  ['躯体反应', /偏头痛|头痛|身体.*痛|太阳穴|失眠/u],
  ['睡眠', /睡觉|失眠|午睡|入睡|关灯/u],
  ['梦境', /做梦|梦里|考试|找座位/u],
  ['自我价值', /认可|自豪|成就感|不够好|对得起/u],
  ['觉察应用素材', /觉察应用|觉察日记|觉察即满足/u],
  ['日常工作记录', /加班|bug|交付|新项目/u],
];

function automaticTags(candidate, note = '') {
  const body = candidate.body || (candidate.path && existsSync(candidate.path) ? readFileSync(candidate.path, 'utf8') : '');
  const source = `${candidate.title || ''}\n${body}`;
  const noteTags = TAG_RULES.filter(([, pattern]) => pattern.test(note)).map(([tag]) => tag);
  const contentTags = TAG_RULES.filter(([, pattern]) => pattern.test(source)).map(([tag]) => tag);
  const tags = [...noteTags, ...contentTags];
  if (candidate.sourceKey === 'xiaoshu' && candidate.source === '反向选择') tags.push('反向选择');
  if (candidate.sourceKey === 'xiaoshu' && candidate.source === '快乐治愈') tags.push('正向体验');
  return [...new Set(tags)].slice(0, 5);
}

function inferMaterialUse(decision, note = '') {
  if (decision === 'published') return '已发布';
  if (/素材|合并|关联|一起写|不单独/u.test(note)) return '关联素材';
  if (decision === 'write') return '独立文章';
  return '暂不使用';
}

function excerpt(text, limit = 72) {
  return text.replace(/^---[\s\S]*?---\s*/u, '').replace(/[#>*_`\r\n]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, limit);
}

function reviewRows(includePublished = false) {
  const workflow = upsertFromFiles();
  return listCandidates().map((candidate, index) => {
    const key = reviewKey(candidate.sourceKey, candidate.id);
    const review = workflow.reviews[key];
    const article = candidate.sourceKey === 'article' ? workflow.articles[candidate.id] : null;
    const automatic = article?.status === 'pending' ? '进行中'
      : article?.status === 'wechat' || article?.status === 'cover' ? '待确认发布'
        : '';
    const decision = review?.decision || (automatic || '待浏览');
    const text = candidate.body || (candidate.path && existsSync(candidate.path) ? readFileSync(candidate.path, 'utf8') : '');
    return {
      ...candidate,
      number: index + 1,
      key,
      decision,
      reviewNote: review?.note || '',
      reviewedAt: review?.reviewedAt || '',
      materialUse: review?.materialUse || inferMaterialUse(review?.decision || 'unreviewed', review?.note || ''),
      tags: review?.tags || automaticTags(candidate, review?.note || ''),
      processStatus: article ? (STAGE_LABELS[article.status] || article.status) : '原始素材',
      summary: excerpt(text),
    };
  }).filter(row => includePublished || row.decision !== REVIEW_DECISIONS.published);
}

function writeReviewReport(includePublished = false) {
  const rows = reviewRows(includePublished);
  const groups = [
    ['待浏览', rows.filter(row => row.decision === '待浏览')],
    ['可写', rows.filter(row => row.decision === '可写')],
    ['进行中 / 待确认发布', rows.filter(row => row.decision === '进行中' || row.decision === '待确认发布')],
    ['略过', rows.filter(row => row.decision === '略过')],
  ];
  if (includePublished) groups.push(['已发布', rows.filter(row => row.decision === '已发布')]);
  const lines = [
    '# 选题审阅',
    '',
    '> 本页合并显示 `0-原始文稿` 与 `5-小树资料库`。默认隐藏已发布稿；用 `./aye.ps1 review all` 查看全部。',
    '> 在对话里说「第 N 篇可写 / 略过 / 已发布」即可记录结论。原稿不会被修改。',
    '',
  ];
  for (const [label, items] of groups) {
    lines.push(`## ${label}（${items.length}）`, '');
    if (items.length === 0) { lines.push('暂无。', ''); continue; }
    lines.push('| # | 来源 | 标题 | 字数 | 处理状态 | 摘要 | 用途 / 标签 | 结论 |', '|---:|---|---|---:|---|---|---|---|');
    for (const row of items) {
      const title = String(row.title || '未命名').replace(/\|/gu, '｜');
      const source = row.source.replace(/\|/gu, '｜');
      const link = row.path ? `[${title}](file:///${row.path.replace(/\\/gu, '/')})` : title;
      const note = row.reviewNote ? `（${row.reviewNote.replace(/\|/gu, '｜')}）` : '';
      const tags = row.tags.length ? row.tags.join('、') : '待生成';
      lines.push(`| ${row.number} | ${source} | ${link}<br><sub>${row.id}</sub> | ${row.words} | ${row.processStatus} | ${row.summary.replace(/\|/gu, '｜')} | ${row.materialUse}<br><sub>${tags}</sub> | ${row.decision}${note} |`);
    }
    lines.push('');
  }
  writeFileSync(REVIEW_FILE, lines.join('\n'), 'utf8');
  return { file: REVIEW_FILE, total: rows.length };
}

function setReviewDecision(sourceKey, id, decisionInput, note = '') {
  if (!['article', 'xiaoshu'].includes(sourceKey)) throw new Error('来源只能是 article 或 xiaoshu');
  const candidates = listCandidates();
  if (!candidates.some(item => item.sourceKey === sourceKey && item.id === String(id))) throw new Error(`找不到稿件：${sourceKey}:${id}`);
  const workflow = loadWorkflow();
  const decision = normalizeReviewDecision(decisionInput);
  workflow.reviews[reviewKey(sourceKey, id)] = {
    decision,
    reviewedAt: now(),
    note,
    materialUse: inferMaterialUse(decision, note),
    tags: automaticTags(candidate, note),
  };
  saveWorkflow(workflow);
  writeReviewReport(false);
  return { source: sourceKey, id: String(id), decision: REVIEW_DECISIONS[decision], note };
}

function listEditable() {
  return reviewRows(false)
    .filter(row => row.decision === '进行中' || (row.decision === '可写' && row.materialUse === '独立文章'))
    .map(({ source, sourceKey, id, title, words, processStatus, decision, tags, materialUse }) => ({ source, sourceKey, id, title, words, processStatus, decision, materialUse, tags }));
}

function backfillReviewTags() {
  const workflow = loadWorkflow();
  const candidates = listCandidates();
  let updated = 0;
  for (const candidate of candidates) {
    const key = reviewKey(candidate.sourceKey, candidate.id);
    const review = workflow.reviews[key];
    if (!review) continue;
    const tags = automaticTags(candidate, review.note || '');
    const materialUse = inferMaterialUse(review.decision, review.note || '');
    if (JSON.stringify(tags) !== JSON.stringify(review.tags || []) || materialUse !== review.materialUse) {
      workflow.reviews[key] = { ...review, tags, materialUse };
      updated += 1;
    }
  }
  saveWorkflow(workflow);
  writeReviewReport(false);
  return { updated };
}

function listMaterials(tags = []) {
  const needles = tags.filter(tag => tag !== '--json').map(tag => tag.trim()).filter(Boolean);
  return reviewRows(false)
    .filter(row => row.materialUse === '关联素材')
    .filter(row => needles.length === 0 || needles.every(tag => row.tags.includes(tag)))
    .map(({ source, sourceKey, id, title, words, tags: rowTags, reviewNote }) => ({ source, sourceKey, id, title, words, tags: rowTags, note: reviewNote }));
}

function downloadArticles() {
  const before = { raw: walkMarkdown(STAGES.raw).length, xiaoshu: walkMarkdown(XIAOSHU_ROOT).length };
  const pull = gitPull();
  const workflow = upsertFromFiles();
  const after = { raw: walkMarkdown(STAGES.raw).length, xiaoshu: walkMarkdown(XIAOSHU_ROOT).length };
  return { pull, added: { raw: after.raw - before.raw, xiaoshu: after.xiaoshu - before.xiaoshu }, total: after, articles: Object.keys(workflow.articles).length };
}

function prepareXiaoshu(id) {
  if (!id) throw new Error('请提供小树记录 ID');
  const entry = loadXiaoshuEntries().find(item => item.id === String(id));
  if (!entry) throw new Error(`找不到小树记录：${id}`);
  ensureLayout();
  const articleId = `小树_${entry.id}`;
  const target = stageFile('pending', articleId);
  copyFileSync(entry.path, target);
  const workflow = loadWorkflow();
  const article = workflow.articles[articleId] ||= { id: articleId, createdAt: now(), references: [], history: [] };
  article.title = entry.title;
  article.pending = fileInfo(target);
  article.status = 'pending';
  article.source = { type: 'xiaoshu', id: entry.id, path: entry.relativePath, typeLabel: entry.typeLabel };
  article.history.push({ at: now(), action: 'prepared_from_xiaoshu', sourceId: entry.id });
  saveWorkflow(workflow);
  return { id: articleId, pending: target, source: entry.relativePath };
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

function walkMarkdown(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdown(path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(path);
  }
  return files;
}

function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { meta: {}, body: normalized };
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) return { meta: {}, body: normalized };
  const meta = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/u);
    if (!match) continue;
    const [, key, raw] = match;
    try { meta[key] = JSON.parse(raw); } catch { meta[key] = raw; }
  }
  return { meta, body: normalized.slice(end + 5).trim() };
}

function normalizeXiaoshuType(value) {
  if (!value) return '';
  const aliases = {
    awareness: 'awareness', '觉察': 'awareness', '觉察日记': 'awareness',
    reverse: 'reverse', '反向': 'reverse', '反向选择': 'reverse',
    happy: 'happy', '快乐': 'happy', '快乐治愈': 'happy',
  };
  return aliases[value] || value;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function sinceTimestamp(value) {
  if (!value) return 0;
  const days = value.match(/^(\d+)d$/iu);
  if (days) return Date.now() - Number(days[1]) * 86400000;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`无法识别时间范围：${value}，请使用 30d 或 YYYY-MM-DD`);
  return parsed;
}

function loadXiaoshuEntries(args = []) {
  const requestedType = normalizeXiaoshuType(optionValue(args, '--type'));
  const since = sinceTimestamp(optionValue(args, '--since'));
  const entries = [];
  for (const path of walkMarkdown(XIAOSHU_ROOT)) {
    const text = readFileSync(path, 'utf8');
    const { meta, body } = parseFrontmatter(text);
    const inferredFolder = relative(XIAOSHU_ROOT, dirname(path)).split(/[\\/]/u)[0];
    const inferredType = Object.entries(XIAOSHU_TYPES).find(([, label]) => label === inferredFolder)?.[0] || '';
    const type = normalizeXiaoshuType(meta.type) || inferredType;
    const createdAt = meta.createdAt || statSync(path).mtime.toISOString();
    if (requestedType && type !== requestedType) continue;
    if (since && Date.parse(createdAt) < since) continue;
    entries.push({
      id: String(meta.id || parse(path).name),
      type,
      typeLabel: meta.typeLabel || XIAOSHU_TYPES[type] || inferredFolder,
      title: meta.title || body.match(/^#\s+(.+)$/mu)?.[1] || '未命名',
      createdAt,
      words: body.replace(/\s+/gu, '').length,
      path,
      relativePath: relative(ARTICLES, path).replace(/\\/gu, '/'),
      body,
      raw: text,
    });
  }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function xiaoshuList(args = []) {
  const entries = loadXiaoshuEntries(args);
  const rows = entries.map(({ id, type, typeLabel, title, createdAt, words, relativePath }) => ({
    id, type, typeLabel, title, createdAt, words, path: relativePath,
  }));
  if (args.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else if (rows.length === 0) console.log('暂无匹配的小树觉察记录');
  else console.table(rows);
  return rows;
}

function xiaoshuShow(id) {
  if (!id) throw new Error('请提供记录 ID');
  const entry = loadXiaoshuEntries().find(item => item.id === String(id));
  if (!entry) throw new Error(`找不到小树记录：${id}`);
  console.log(entry.raw);
}

function xiaoshuSearch(keyword, args = []) {
  if (!keyword) throw new Error('请提供搜索关键词');
  const needle = keyword.toLocaleLowerCase('zh-CN');
  const matches = loadXiaoshuEntries(args).filter(entry =>
    `${entry.title}\n${entry.body}`.toLocaleLowerCase('zh-CN').includes(needle)
  );
  const rows = matches.map(({ id, typeLabel, title, createdAt, relativePath }) => ({
    id, type: typeLabel, title, createdAt, path: relativePath,
  }));
  if (args.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else if (rows.length === 0) console.log(`没有找到包含“${keyword}”的小树记录`);
  else console.table(rows);
  return rows;
}

function xiaoshuCommand(args) {
  const [subcommand = 'list', ...rest] = args;
  if (subcommand === 'sync') {
    const pull = gitPull();
    if (!pull.ok) console.error(`同步失败：${pull.error}`);
    else console.log('小树资料库同步完成');
    xiaoshuList(rest);
    return;
  }
  if (subcommand === 'list') { xiaoshuList(rest); return; }
  if (subcommand === 'show') { xiaoshuShow(rest[0]); return; }
  if (subcommand === 'search') { xiaoshuSearch(rest[0], rest.slice(1)); return; }
  throw new Error(`未知的小树命令：${subcommand}`);
}

function reviewCommand(args) {
  const [subcommand = 'list', ...rest] = args;
  if (subcommand === 'list' || subcommand === 'all') {
    const report = writeReviewReport(subcommand === 'all');
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (subcommand === 'set') {
    const [sourceKey, id, decision, ...noteParts] = rest;
    console.log(JSON.stringify(setReviewDecision(sourceKey, id, decision, noteParts.join(' ')), null, 2));
    return;
  }
  if (subcommand === 'tag') {
    console.log(JSON.stringify(backfillReviewTags(), null, 2));
    return;
  }
  throw new Error('审阅命令：review [list|all|tag] 或 review set <article|xiaoshu> <ID> <待浏览|可写|略过|已发布> [备注]');
}

function help() {
  console.log(`\n🌿 阿野图文工作流\n\n  node aye.js download                     下载云端新增稿件并更新本地状态\n  node aye.js review [all]                 生成未发布稿件的合并审阅页\n  node aye.js review tag                   为已审稿件补齐自动标签\n  node aye.js review set <来源> <ID> <结论> 记录审阅结论、用途和自动标签\n  node aye.js edit [--json]                列出可独立修改、进行中的文章\n  node aye.js materials [标签...]          按自动标签查找关联素材\n  node aye.js sync                         兼容旧命令：拉取文章库并更新状态\n  node aye.js overview                     更新文章总览\n  node aye.js open <文章ID>                直接打开当前应编辑的稿件\n  node aye.js candidates [--json]          列出全部原始内容\n  node aye.js prepare xiaoshu <记录ID>     将小树记录复制为待确认稿\n  node aye.js list [--json]                列出文章队列\n  node aye.js migrate                      迁移旧文件到 0-4 阶段目录\n  node aye.js confirm <文章ID>             将待确认稿复制为发布文稿\n\n  审阅结论：待浏览、可写、略过、已发布；来源：article 或 xiaoshu\n`);
}

function main() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (!existsSync(ARTICLES)) throw new Error(`找不到文章库：${ARTICLES}`);
  if (command === 'download') { console.log(JSON.stringify(downloadArticles(), null, 2)); return; }
  if (command === 'review') { reviewCommand(args); return; }
  if (command === 'edit') { const items = listEditable(); if (args.includes('--json')) console.log(JSON.stringify(items, null, 2)); else console.table(items); return; }
  if (command === 'materials') { const items = listMaterials(args); if (args.includes('--json')) console.log(JSON.stringify(items, null, 2)); else console.table(items); return; }
  if (command === 'sync') { const pull = gitPull(); const workflow = upsertFromFiles(); console.log(JSON.stringify({ pull, articles: Object.keys(workflow.articles).length }, null, 2)); return; }
  if (command === 'candidates') { const items = listCandidates(); if (args.includes('--json')) console.log(JSON.stringify(items, null, 2)); else console.table(items); return; }
  if (command === 'prepare' && args[0] === 'xiaoshu') { console.log(JSON.stringify(prepareXiaoshu(args[1]), null, 2)); return; }
  if (command === 'migrate') { console.log(JSON.stringify(migrateLegacy(), null, 2)); return; }
  if (command === 'list') { const items = listArticles(); if (args.includes('--json')) console.log(JSON.stringify(items, null, 2)); else console.table(items); return; }
  if (command === 'overview') { upsertFromFiles(); console.log(OVERVIEW_FILE); return; }
  if (command === 'open') { console.log(JSON.stringify(openArticle(args[0]), null, 2)); return; }
  if (command === 'confirm') { console.log(JSON.stringify(confirmPublish(args[0]), null, 2)); return; }
  if (command === 'xiaoshu') { xiaoshuCommand(args); return; }
  help();
}

try { main(); } catch (error) { console.error(`❌ ${error.message}`); process.exitCode = 1; }
