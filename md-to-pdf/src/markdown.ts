import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Blockquote,
  Code,
  Heading,
  Html,
  Image,
  Paragraph,
  Root,
  Text,
} from 'mdast';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { codeToHtml } from 'shiki';
import type { Node, Parent } from 'unist';
import { unified } from 'unified';
import type { MarkdownResult, TocItem } from './types.js';

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

const PRIORITY_PATTERN = /\s*\[Priority:\s*([123])\]\s*$/i;
const RECOMMENDATIONS_PATTERN = /^(\d+\.?\s*)?recommendations$/i;

function priorityBadgeClass(level: string): string {
  return `priority-badge priority-${level}`;
}

function transformPriorityHeadings(root: Root): void {
  visit(root, (node) => {
    if (node.type !== 'heading') return;
    const heading = node as Heading;
    const fullText = textContent(heading);
    const match = PRIORITY_PATTERN.exec(fullText);
    if (!match) return;

    const level = match[1]!;
    const cleaned = fullText.replace(PRIORITY_PATTERN, '').trimEnd();

    const last = heading.children[heading.children.length - 1];
    if (last && last.type === 'text') {
      const text = last as Text;
      const idx = text.value.search(PRIORITY_PATTERN);
      if (idx >= 0) {
        text.value = text.value.slice(0, idx).trimEnd();
        if (text.value.length === 0) {
          heading.children.pop();
        }
      }
    } else {
      const remaining = fullText.replace(PRIORITY_PATTERN, '');
      rewriteHeadingText(heading, remaining);
    }

    const badge: Html = {
      type: 'html',
      value: `<span class="${priorityBadgeClass(level)}">Priority ${level}</span>`,
    };
    heading.children.push(badge);
    void cleaned;
  });
}

function rewriteHeadingText(heading: Heading, text: string): void {
  heading.children = [{ type: 'text', value: text.trim() }];
}

function priorityLegendHtml(): string {
  return `<div class="priority-legend">
  <h3 class="priority-legend-title">Priority Legend</h3>
  <table class="priority-legend-table">
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

function injectPriorityLegend(root: Root): boolean {
  const children = (root as unknown as MutableParent).children;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child.type !== 'heading') continue;
    const heading = child as Heading;
    if (heading.depth > 2) continue;
    if (!RECOMMENDATIONS_PATTERN.test(textContent(heading).trim())) continue;

    const legend: Html = { type: 'html', value: priorityLegendHtml() };
    children.splice(i, 0, legend);
    return true;
  }
  return false;
}

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
    if (parent) {
      parent.children.push(item);
    } else {
      roots.push(item);
    }
    stack.push(item);
  }

  return roots;
}

function addHeadingIdsAndBuildToc(root: Root): TocItem[] {
  const slugCounts = new Map<string, number>();
  const items: Omit<TocItem, 'children'>[] = [];

  visit(root, (node) => {
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

function visit(node: Node, visitor: (node: Node, parent?: MutableParent, index?: number) => void): void {
  visitor(node);
  if (!isParent(node)) return;

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]!;
    visitor(child, node, index);
    if (isParent(child)) {
      visitChildren(child, visitor);
    }
  }
}

function visitChildren(parent: MutableParent, visitor: (node: Node, parent?: MutableParent, index?: number) => void): void {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index]!;
    visitor(child, parent, index);
    if (isParent(child)) {
      visitChildren(child, visitor);
    }
  }
}

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

  visit(root, (node) => {
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

function imagePath(url: string, basePath: string): string | undefined {
  if (/^(?:https?:|data:)/i.test(url)) return undefined;
  if (url.startsWith('file:')) return fileURLToPath(url);

  const pathOnly = decodeURIComponent(url.split(/[?#]/, 1)[0]!);
  return isAbsolute(pathOnly) ? pathOnly : resolve(basePath, pathOnly);
}

const QA_PATTERN = /^\*\*(Question|Answer)[:：]\*\*\s*/i;
const QA_NODE_PATTERN = /^(Question|Answer)[:：]\s*$/i;
const QA_LABELS: Record<string, string> = { question: 'Q', answer: 'A' };

function transformQaPairs(root: Root): void {
  visit(root, (node) => {
    if (node.type !== 'paragraph') return;
    const paragraph = node as Paragraph;
    const first = paragraph.children[0];
    if (!first) return;

    let kind: string | undefined;

    // Case 1: "**Question:** rest..." → first child is strong containing "Question:"
    if (first.type === 'strong') {
      const strongText = textContent(first).trim();
      const m = QA_NODE_PATTERN.exec(strongText);
      if (m) {
        kind = m[1]!.toLocaleLowerCase();
        paragraph.children.shift();
        // Remove leading whitespace from the next text node
        const next = paragraph.children[0];
        if (next && next.type === 'text') {
          (next as Text).value = (next as Text).value.replace(/^\s+/, '');
        }
      }
    }
    // Case 2: plain text starting with "**Question:**" (shouldn't happen with remark, but fallback)
    else if (first.type === 'text') {
      const m = QA_PATTERN.exec((first as Text).value);
      if (m) {
        kind = m[1]!.toLocaleLowerCase();
        (first as Text).value = (first as Text).value.slice(m[0]!.length);
      }
    }

    if (!kind) return;

    const label: Html = {
      type: 'html',
      value: `<span class="qa-label qa-label-${kind}">${QA_LABELS[kind] ?? kind.toUpperCase()}</span>`,
    };

    paragraph.children.unshift(label);
    paragraph.data = {
      hName: 'div',
      hProperties: { className: ['qa-block', `qa-${kind}`] },
    };
  });
}

async function embedLocalImages(root: Root, basePath: string): Promise<void> {
  const images: Image[] = [];
  visit(root, (node) => {
    if (node.type === 'image') images.push(node as Image);
  });

  await Promise.all(images.map(async (image) => {
    const path = imagePath(image.url, basePath);
    if (!path) return;

    const mimeType = MIME_TYPES[extname(path).toLocaleLowerCase()];
    if (!mimeType) {
      throw new Error(`Unsupported local image type: ${path}`);
    }

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

function normalizeLanguage(language?: string | null): string {
  const normalized = (language ?? 'text').toLocaleLowerCase();
  const aliases: Record<string, string> = {
    console: 'bash',
    js: 'javascript',
    md: 'markdown',
    plaintext: 'text',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    ts: 'typescript',
    txt: 'text',
    yml: 'yaml',
  };
  return aliases[normalized] ?? normalized;
}

function codeTitle(meta?: string | null): string | undefined {
  if (!meta) return undefined;
  return /(?:^|\s)(?:title|filename|file)=(?:"([^"]+)"|'([^']+)'|([^\s]+))/.exec(meta)?.slice(1).find(Boolean);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function highlightedCode(node: Code): Promise<string> {
  const requestedLanguage = normalizeLanguage(node.lang);
  let highlighted: string;
  try {
    highlighted = await codeToHtml(node.value, {
      lang: requestedLanguage,
      theme: 'github-light',
    });
  } catch {
    highlighted = await codeToHtml(node.value, {
      lang: 'text',
      theme: 'github-light',
    });
  }

  const title = codeTitle(node.meta);
  if (!title) return highlighted;
  return `<div class="code-block-wrapper"><span class="code-title">${escapeHtml(title)}</span>${highlighted}</div>`;
}

async function transformCodeBlocks(root: Root): Promise<void> {
  const codeNodes: Array<{ node: Code; parent: MutableParent; index: number }> = [];
  visit(root, (node, parent, index) => {
    if (node.type === 'code' && parent && index !== undefined) {
      codeNodes.push({ node: node as Code, parent, index });
    }
  });

  await Promise.all(codeNodes.map(async ({ node, parent, index }) => {
    const htmlNode: Html = {
      type: 'html',
      value: await highlightedCode(node),
    };
    parent.children[index] = htmlNode;
  }));
}

export async function convertMarkdown(markdown: string, basePath: string): Promise<MarkdownResult> {
  // singleTilde: false — otherwise a lone "~" (common in Korean range
  // notation like "1~10초", "20~30개", or paths like "~/workspace") gets
  // misparsed as GFM strikethrough (<del>) instead of a literal tilde.
  // Proper strikethrough still works via the standard "~~text~~" syntax.
  const parser = unified().use(remarkParse).use(remarkGfm, { singleTilde: false });
  const root = parser.parse(markdown) as Root;

  transformPriorityHeadings(root);
  const toc = addHeadingIdsAndBuildToc(root);
  transformAdmonitions(root);
  transformQaPairs(root);
  injectPriorityLegend(root);
  await embedLocalImages(root, basePath);
  await transformCodeBlocks(root);

  const hast = await unified()
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .run(root);
  const html = unified()
    .use(rehypeStringify, { allowDangerousHtml: true })
    .stringify(hast);

  const externalImage = /<img\b[^>]*\bsrc=["'](?!data:)([^"']+)["']/i.exec(String(html));
  if (externalImage) {
    throw new Error(
      `Rendered HTML images must be embedded data URLs; unsupported image source: ${externalImage[1]}`,
    );
  }

  return { html: String(html), toc };
}
