import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Blockquote,
  Code,
  Heading,
  Html,
  Image,
  Link,
  Paragraph,
  Root,
  Table,
  Text,
} from 'mdast';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkCjkFriendlyGfmStrikethrough from 'remark-cjk-friendly-gfm-strikethrough';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { codeToHtml } from 'shiki';
import type { Node, Parent } from 'unist';
import { unified } from 'unified';
import { wrapCode } from './codewrap.js';
import {
  CODE_CHAR_WIDTH_PX,
  CODE_KEEP_TOGETHER_MAX_LINES,
  CODE_TEXT_WIDTH_PX,
  NESTED_BLOCK_INDENT_PX,
  TABLE_KEEP_TOGETHER_MAX_ROWS,
} from './layout-constants.js';
import type { ConvertOptions, MarkdownResult, RenderIssue, TocItem } from './types.js';

interface MutableParent extends Parent {
  children: Node[];
}

const ADMONITION_LABELS: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  caution: 'Caution',
  important: 'Important',
};

const MIME_TYPES: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const REFERENCES_TITLE: Record<string, string> = {
  ko: '참고 링크',
  en: 'References',
  ja: '参考リンク',
  'zh-hans': '参考链接',
  'zh-cn': '参考链接',
  zh: '参考链接',
  'zh-hant': '參考連結',
  'zh-tw': '參考連結',
  'zh-hk': '參考連結',
};

export function referencesTitle(language: string): string {
  const tag = language.toLocaleLowerCase();
  return REFERENCES_TITLE[tag] ?? REFERENCES_TITLE[tag.split('-')[0]!] ?? REFERENCES_TITLE['en']!;
}

function isParent(node: Node): node is MutableParent {
  return 'children' in node && Array.isArray((node as MutableParent).children);
}

function textContent(node: Node): string {
  if (node.type === 'html') return '';
  if ('value' in node && typeof node.value === 'string') {
    return node.value;
  }
  if ('alt' in node && typeof node.alt === 'string') {
    return node.alt;
  }
  return isParent(node) ? node.children.map(textContent).join('') : '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Depth-first walk that exposes the ancestor chain (nearest last). */
function walk(
  node: Node,
  visitor: (node: Node, ancestors: MutableParent[], index: number | undefined) => void,
  ancestors: MutableParent[] = [],
  index?: number,
): void {
  visitor(node, ancestors, index);
  if (!isParent(node)) return;
  const chain = [...ancestors, node];
  for (let i = 0; i < node.children.length; i += 1) {
    walk(node.children[i]!, visitor, chain, i);
  }
}

// ---------------------------------------------------------------------------
// Priority badges and legend
// ---------------------------------------------------------------------------

const PRIORITY_PATTERN = /\s*\[Priority:\s*([123])\]\s*$/i;
const RECOMMENDATIONS_PATTERN = /^(\d+(?:\.\d+)*\.?\s*)?(recommendations|권장\s*사항|권고\s*사항|推荐|推薦|建议|建議)$/i;

function transformPriorityHeadings(root: Root): void {
  walk(root, (node) => {
    if (node.type !== 'heading') return;
    const heading = node as Heading;
    const fullText = textContent(heading);
    const match = PRIORITY_PATTERN.exec(fullText);
    if (!match) return;

    const level = match[1]!;
    const last = heading.children[heading.children.length - 1];
    if (last && last.type === 'text') {
      const text = last as Text;
      const idx = text.value.search(PRIORITY_PATTERN);
      if (idx >= 0) {
        text.value = text.value.slice(0, idx).trimEnd();
        if (text.value.length === 0) heading.children.pop();
      }
    } else {
      heading.children = [{ type: 'text', value: fullText.replace(PRIORITY_PATTERN, '').trim() }];
    }

    heading.children.push({
      type: 'html',
      value: `<span class="priority-badge priority-${level}">Priority ${level}</span>`,
    } as Html);
  });
}

function priorityLegendHtml(): string {
  return `<div class="priority-legend">
  <p class="priority-legend-title">Priority Legend</p>
  <table class="priority-legend-table keep-together">
    <thead>
      <tr><th>Priority</th><th>Meaning</th></tr>
    </thead>
    <tbody>
      <tr><td><span class="priority-badge priority-1">Priority 1</span></td>
        <td>Implement immediately. Not implementing incurs risk of data loss, system unavailability, or other significant problems that may cause outages.</td></tr>
      <tr><td><span class="priority-badge priority-2">Priority 2</span></td>
        <td>Implement as soon as possible. Significant problems that could affect a production system; consider these issues promptly.</td></tr>
      <tr><td><span class="priority-badge priority-3">Priority 3</span></td>
        <td>Consider this recommendation. Not critical; may reflect a larger change and may be part of the next revision.</td></tr>
    </tbody>
  </table>
  <p class="priority-legend-notice"><strong>Important:</strong> All recommendations in this report should be tested in a pre-production environment before being applied to production.</p>
</div>`;
}

/**
 * Inserts the legend directly *after* the Recommendations heading so it
 * always opens that section (inserting it before the heading attached it to
 * the tail of the previous chapter).
 */
function injectPriorityLegend(root: Root): boolean {
  const children = (root as unknown as MutableParent).children;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i]!;
    if (child.type !== 'heading') continue;
    const heading = child as Heading;
    if (heading.depth > 2) continue;
    if (!RECOMMENDATIONS_PATTERN.test(textContent(heading).trim())) continue;

    children.splice(i + 1, 0, { type: 'html', value: priorityLegendHtml() } as Html);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Headings and TOC
// ---------------------------------------------------------------------------

function slugBase(value: string): string {
  const slug = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}_-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'section';
}

function buildToc(flatItems: Omit<TocItem, 'children'>[]): TocItem[] {
  const roots: TocItem[] = [];
  const stack: TocItem[] = [];

  for (const flatItem of flatItems) {
    const item: TocItem = { ...flatItem, children: [] };
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= item.depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(item);
    else roots.push(item);
    stack.push(item);
  }
  return roots;
}

function addHeadingIdsAndBuildToc(root: Root): TocItem[] {
  const slugCounts = new Map<string, number>();
  const items: Omit<TocItem, 'children'>[] = [];

  walk(root, (node) => {
    if (node.type !== 'heading') return;
    const heading = node as Heading;
    if (heading.depth > 3) return;

    const text = textContent(heading).trim();
    if (!text) return;

    const base = slugBase(text);
    const count = (slugCounts.get(base) ?? 0) + 1;
    slugCounts.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;

    heading.data = {
      ...heading.data,
      hProperties: { ...heading.data?.hProperties, id },
    };
    items.push({ id, text, depth: heading.depth });
  });

  return buildToc(items);
}

// ---------------------------------------------------------------------------
// Admonitions and Q&A
// ---------------------------------------------------------------------------

function stripAdmonitionMarker(paragraph: Paragraph, marker: RegExp): string {
  for (const child of paragraph.children) {
    if (child.type !== 'text') continue;
    const text = child as Text;
    const match = marker.exec(text.value);
    if (!match) continue;
    text.value = text.value.slice(match[0].length).trimStart();
    return match[1]!.toLocaleLowerCase();
  }
  return '';
}

function transformAdmonitions(root: Root): void {
  const marker = /^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*/i;

  walk(root, (node) => {
    if (node.type !== 'blockquote') return;
    const blockquote = node as Blockquote;
    const first = blockquote.children[0];
    if (!first || first.type !== 'paragraph' || !marker.test(textContent(first))) return;

    const kind = stripAdmonitionMarker(first, marker);
    if (!kind) return;

    const title: Paragraph = {
      type: 'paragraph',
      data: {
        hName: 'div',
        hProperties: { className: ['admonition-title'] },
      },
      children: [{ type: 'text', value: ADMONITION_LABELS[kind] ?? kind }],
    };

    const body = textContent(first).trim() ? blockquote.children : blockquote.children.slice(1);
    blockquote.children = [title, ...body];
    blockquote.data = {
      hName: 'div',
      hProperties: { className: ['admonition', `admonition-${kind}`] },
    };
  });
}

const QA_PATTERN = /^\*\*(Question|Answer)[:：]\*\*\s*/i;
const QA_NODE_PATTERN = /^(Question|Answer)[:：]\s*$/i;
const QA_LABELS: Record<string, string> = { question: 'Q', answer: 'A' };

function transformQaPairs(root: Root): void {
  walk(root, (node) => {
    if (node.type !== 'paragraph') return;
    const paragraph = node as Paragraph;
    const first = paragraph.children[0];
    if (!first) return;

    let kind: string | undefined;
    if (first.type === 'strong') {
      const m = QA_NODE_PATTERN.exec(textContent(first).trim());
      if (m) {
        kind = m[1]!.toLocaleLowerCase();
        paragraph.children.shift();
        const next = paragraph.children[0];
        if (next && next.type === 'text') {
          (next as Text).value = (next as Text).value.replace(/^\s+/, '');
        }
      }
    } else if (first.type === 'text') {
      const m = QA_PATTERN.exec((first as Text).value);
      if (m) {
        kind = m[1]!.toLocaleLowerCase();
        (first as Text).value = (first as Text).value.slice(m[0]!.length);
      }
    }
    if (!kind) return;

    paragraph.children.unshift({
      type: 'html',
      value: `<span class="qa-label qa-label-${kind}">${QA_LABELS[kind] ?? kind.toUpperCase()}</span>`,
    } as Html);
    paragraph.data = {
      hName: 'div',
      hProperties: { className: ['qa-block', `qa-${kind}`] },
    };
  });
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Short tables are kept on one page; long tables may split between rows. */
function classifyTables(root: Root): void {
  walk(root, (node) => {
    if (node.type !== 'table') return;
    const table = node as Table;
    const bodyRows = Math.max(0, table.children.length - 1);
    const className = bodyRows <= TABLE_KEEP_TOGETHER_MAX_ROWS ? 'keep-together' : 'table-long';
    table.data = {
      ...table.data,
      hProperties: { ...(table.data?.hProperties ?? {}), className: [className] },
    };
  });
}

// ---------------------------------------------------------------------------
// External links -> numbered references
// ---------------------------------------------------------------------------

function collectReferences(root: Root, language: string): void {
  const numbers = new Map<string, number>();
  const entries: Array<{ n: number; url: string; label: string }> = [];

  walk(root, (node, ancestors, index) => {
    if (node.type !== 'link' || index === undefined) return;
    const link = node as Link;
    if (!/^https?:\/\//i.test(link.url)) return;
    const label = textContent(link).trim();
    // Bare URLs / autolinks already show the address; no reference needed.
    if (!label || label === link.url || label === link.url.replace(/^https?:\/\//i, '')) return;

    let n = numbers.get(link.url);
    if (n === undefined) {
      n = entries.length + 1;
      numbers.set(link.url, n);
      entries.push({ n, url: link.url, label });
    }
    const parent = ancestors[ancestors.length - 1]!;
    // Insert right after the link; the walker visits the new node next and
    // ignores it (it is not a link).
    parent.children.splice(index + 1, 0, {
      type: 'html',
      value: `<sup class="ref-mark"><a href="#ref-${n}">[${n}]</a></sup>`,
    } as Html);
  });

  if (entries.length === 0) return;

  const items = entries.map(({ n, url, label }) => (
    `<li id="ref-${n}"><span class="ref-num">[${n}]</span> <span class="ref-label">${escapeHtml(label)}</span> <a class="ref-url" href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`
  )).join('\n');

  const children = (root as unknown as MutableParent).children;
  children.push(
    {
      type: 'heading',
      depth: 1,
      data: { hProperties: { className: ['references-title'] } },
      children: [{ type: 'text', value: referencesTitle(language) }],
    } as Heading,
    { type: 'html', value: `<ol class="references">\n${items}\n</ol>` } as Html,
  );
}

// ---------------------------------------------------------------------------
// Figure captions: an italic-only paragraph right after an image paragraph
// ---------------------------------------------------------------------------

function markFigureCaptions(root: Root): void {
  walk(root, (node) => {
    if (!isParent(node)) return;
    const children = node.children;
    for (let i = 1; i < children.length; i += 1) {
      const prev = children[i - 1]!;
      const cur = children[i]!;
      if (prev.type !== 'paragraph' || cur.type !== 'paragraph') continue;
      const prevKids = (prev as Paragraph).children.filter((c) => !(c.type === 'text' && !(c as Text).value.trim()));
      const curKids = (cur as Paragraph).children;
      if (prevKids.length !== 1 || prevKids[0]!.type !== 'image') continue;
      if (curKids.length !== 1 || curKids[0]!.type !== 'emphasis') continue;
      (cur as Paragraph).data = { ...(cur as Paragraph).data, hProperties: { className: ['figure-caption'] } };
    }
  });
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function imagePath(url: string, basePath: string): string | undefined {
  if (/^(?:https?:|data:)/i.test(url)) return undefined;
  if (url.startsWith('file:')) return fileURLToPath(url);
  const pathOnly = decodeURIComponent(url.split(/[?#]/, 1)[0]!);
  return isAbsolute(pathOnly) ? pathOnly : resolve(basePath, pathOnly);
}

async function embedLocalImages(root: Root, basePath: string): Promise<void> {
  const images: Image[] = [];
  walk(root, (node) => {
    if (node.type === 'image') images.push(node as Image);
  });

  await Promise.all(images.map(async (image) => {
    const path = imagePath(image.url, basePath);
    if (!path) return;

    const mimeType = MIME_TYPES[extname(path).toLocaleLowerCase()];
    if (!mimeType) throw new Error(`Unsupported local image type: ${path}`);

    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot read local image "${image.url}": ${message}`);
    }
    image.url = `data:${mimeType};base64,${bytes.toString('base64')}`;
  }));
}

// ---------------------------------------------------------------------------
// Code blocks
// ---------------------------------------------------------------------------

function normalizeLanguage(language?: string | null): string {
  const normalized = (language ?? 'text').toLocaleLowerCase();
  const aliases: Record<string, string> = {
    console: 'bash',
    js: 'javascript',
    md: 'markdown',
    mongosh: 'javascript',
    plaintext: 'text',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    ts: 'typescript',
    txt: 'text',
    yml: 'yaml',
    zsh: 'bash',
  };
  return aliases[normalized] ?? normalized;
}

function codeTitle(meta?: string | null): string | undefined {
  if (!meta) return undefined;
  return /(?:^|\s)(?:title|filename|file)=(?:"([^"]+)"|'([^']+)'|([^\s]+))/.exec(meta)?.slice(1).find(Boolean);
}

/** Printable text width available to a code block at this nesting level. */
function codeColumns(ancestors: MutableParent[]): number {
  const nested = ancestors.filter((a) => a.type === 'listItem' || a.type === 'blockquote').length;
  const width = CODE_TEXT_WIDTH_PX - nested * NESTED_BLOCK_INDENT_PX;
  // One column of slack absorbs sub-pixel rounding.
  return Math.max(20, Math.floor(width / CODE_CHAR_WIDTH_PX) - 1);
}

async function highlightedCode(value: string, lang: string): Promise<string> {
  try {
    return await codeToHtml(value, { lang, theme: 'github-light' });
  } catch {
    return codeToHtml(value, { lang: 'text', theme: 'github-light' });
  }
}

async function transformCodeBlocks(root: Root, issues: RenderIssue[]): Promise<void> {
  const codeNodes: Array<{ node: Code; parent: MutableParent; index: number; cols: number }> = [];
  walk(root, (node, ancestors, index) => {
    if (node.type === 'code' && index !== undefined) {
      codeNodes.push({ node: node as Code, parent: ancestors[ancestors.length - 1]!, index, cols: codeColumns(ancestors) });
    }
  });

  await Promise.all(codeNodes.map(async ({ node, parent, index, cols }) => {
    const lang = normalizeLanguage(node.lang);
    const wrapped = wrapCode(node.value, (node.lang ?? lang).toLocaleLowerCase(), cols);
    if (wrapped.wrappedLines > 0) {
      issues.push({
        severity: 'info',
        code: 'code-line-wrapped',
        message: `${wrapped.wrappedLines} code line(s) exceeded ${cols} columns and were broken with forced newlines (${lang}).`,
      });
    }
    for (const line of wrapped.unsafe) {
      issues.push({
        severity: 'warning',
        code: 'code-wrap-unsafe',
        message: `A forced code line break may change meaning (inside a string or literal). Shorten this line in the source: "${line}"`,
      });
    }

    const lineCount = wrapped.text.split('\n').length;
    const keep = lineCount <= CODE_KEEP_TOGETHER_MAX_LINES ? ' keep-together' : '';
    const title = codeTitle(node.meta);
    const titleHtml = title ? `<span class="code-title">${escapeHtml(title)}</span>` : '';
    const highlighted = await highlightedCode(wrapped.text, lang);
    parent.children[index] = {
      type: 'html',
      value: `<div class="code-block${title ? ' has-title' : ''}${keep}">${titleHtml}${highlighted}</div>`,
    } as Html;
  }));
}

// ---------------------------------------------------------------------------
// CJK soft line breaks
// ---------------------------------------------------------------------------

// A source line break inside Chinese/Japanese text must not become a space
// ("以及 任务清单"). Korean uses spaces between words, so Hangul is excluded.
const CJK_CHAR = '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\u3000-\\u303f\\uff00-\\uffef]';
const CJK_SOFT_BREAK = new RegExp(`(${CJK_CHAR})[ \\t]*\\n[ \\t]*(?=${CJK_CHAR})`, 'gu');

function joinCjkSoftBreaks(root: Root): void {
  walk(root, (node) => {
    if (node.type === 'text') {
      const text = node as Text;
      text.value = text.value.replace(CJK_SOFT_BREAK, '$1');
    }
  });
}

// ---------------------------------------------------------------------------
// Task list checkboxes -> static spans (no PDF form fields, no native widget)
// ---------------------------------------------------------------------------

function replaceCheckboxes(tree: HastLike): void {
  const visitNode = (node: HastLike): void => {
    for (const child of node.children ?? []) {
      const el = child as HastLike & { properties?: Record<string, unknown> };
      if (el.type === 'element' && el.tagName === 'input' && el.properties?.['type'] === 'checkbox') {
        const checked = Boolean(el.properties['checked']);
        el.tagName = 'span';
        el.properties = {
          className: ['task-list-item-checkbox', ...(checked ? ['checked'] : [])],
          role: 'img',
          ariaLabel: checked ? 'done' : 'not done',
        };
        el.children = [];
      }
      visitNode(child);
    }
  };
  visitNode(tree);
}

// ---------------------------------------------------------------------------
// Residual Markdown markers
// ---------------------------------------------------------------------------

interface HastLike extends Node {
  tagName?: string;
  value?: string;
  children?: HastLike[];
}

const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'kbd', 'samp']);
const RESIDUAL_PATTERN = /\*\*|(?<![\w/])__(?=\S)|(?<=\S)__(?![\w/])|~~/;

function findResidualMarkers(tree: HastLike, issues: RenderIssue[]): void {
  const visitNode = (node: HastLike): void => {
    if (node.type === 'element' && node.tagName && SKIP_TAGS.has(node.tagName)) return;
    if (node.type === 'text' && typeof node.value === 'string' && RESIDUAL_PATTERN.test(node.value)) {
      const m = RESIDUAL_PATTERN.exec(node.value)!;
      const from = Math.max(0, m.index - 30);
      const snippet = node.value.slice(from, m.index + 40).replace(/\s+/g, ' ').trim();
      issues.push({
        severity: 'error',
        code: 'residual-markdown-marker',
        message: `Unrendered Markdown marker "${m[0]}" in output text: "${snippet}". `
          + 'Put a space outside the marker, avoid emphasis inside raw HTML, or use <strong>…</strong>.',
      });
    }
    for (const child of node.children ?? []) visitNode(child);
  };
  visitNode(tree);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function convertMarkdown(
  markdown: string,
  basePath: string,
  options: ConvertOptions = {},
): Promise<MarkdownResult> {
  const issues: RenderIssue[] = [];
  // singleTilde: false — otherwise a lone "~" (Korean ranges like "1~10초",
  // or "~/workspace") is misparsed as strikethrough. "~~text~~" still works.
  // remark-cjk-friendly relaxes CommonMark's flanking rules so that
  // "**중요(필수)**입니다" / "**注意（重要）**的" render as bold instead of
  // leaking literal asterisks.
  const parser = unified()
    .use(remarkParse)
    .use(remarkGfm, { singleTilde: false })
    .use(remarkCjkFriendly)
    .use(remarkCjkFriendlyGfmStrikethrough, { singleTilde: false });
  const root = await parser.run(parser.parse(markdown)) as Root;

  joinCjkSoftBreaks(root);
  transformPriorityHeadings(root);
  if (options.references !== false) collectReferences(root, options.language ?? 'en');
  const toc = addHeadingIdsAndBuildToc(root);
  transformAdmonitions(root);
  transformQaPairs(root);
  injectPriorityLegend(root);
  classifyTables(root);
  markFigureCaptions(root);
  await embedLocalImages(root, basePath);
  await transformCodeBlocks(root, issues);

  const hast = await unified()
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .run(root);
  replaceCheckboxes(hast as unknown as HastLike);
  findResidualMarkers(hast as unknown as HastLike, issues);
  const html = unified()
    .use(rehypeStringify, { allowDangerousHtml: true })
    .stringify(hast);

  const externalImage = /<img\b[^>]*\bsrc=["'](?!data:)([^"']+)["']/i.exec(String(html));
  if (externalImage) {
    throw new Error(
      `Rendered HTML images must be embedded data URLs; unsupported image source: ${externalImage[1]}`,
    );
  }

  return { html: String(html), toc, issues };
}
