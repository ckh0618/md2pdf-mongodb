import { chromium, type Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePdf, headingPositions, openPdf, writePagePngs, type LayoutAnalysis } from './check.js';
import { BUNDLED_FONT_NAMES, buildFontFaceCss, FONT_FAMILY } from './fonts.js';
import {
  applyTocPageNumbers,
  collectBreakTargets,
  findHorizontalOverflow,
  findOverflowingCode,
  fitTables,
} from './layout.js';
import {
  CONTENT_WIDTH_PX,
  MM_TO_PX,
  PAGE_MARGIN_BOTTOM_MM,
  PAGE_MARGIN_SIDE_MM,
  PAGE_MARGIN_TOP_MM,
  PAGE_WIDTH_MM,
} from './layout-constants.js';
import type { DocumentMeta, PdfStage, RenderIssue } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Official MongoDB brand asset (leaf + wordmark). The slate-blue variant is
// used in the print header (white page); the cover uses the white variant.
const LOGO_PATH = resolve(__dirname, '../assets/mongodb-logo-slate-blue.svg');

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function logoDataUri(): string {
  try {
    return `data:image/svg+xml;base64,${readFileSync(LOGO_PATH).toString('base64')}`;
  } catch {
    return '';
  }
}

const CHROME_FONT = `'${FONT_FAMILY.sans}', '${FONT_FAMILY.sc}', '${FONT_FAMILY.tc}', sans-serif`;

function chromeFontCss(text: string, language?: string): string {
  try {
    return `<style>${buildFontFaceCss('', text, language).css}</style>`;
  } catch {
    return '';
  }
}

export function buildHeaderTemplate(stage: PdfStage): string {
  const review = stage === 'review'
    ? '<span style="display:inline-block; margin-left:6px; padding:3px 8px; border:1px solid #944F00; border-radius:3px; background:#FFF2CC; color:#5C2E00; font-size:7px; font-weight:700; letter-spacing:0.9px;">FOR REVIEW</span>'
    : '';
  const logoUri = logoDataUri();
  const logo = logoUri
    ? `<img src="${logoUri}" alt="MongoDB" style="height:20px; width:auto; display:block;" />`
    : '';
  return `${chromeFontCss('CONFIDENTIAL FOR REVIEW')}<div style="width:100%; padding:0 ${PAGE_MARGIN_SIDE_MM}mm; font-family:${CHROME_FONT}; line-height:1; display:flex; align-items:center; justify-content:space-between;">
  <span><span style="display:inline-block; padding:3px 8px; border:1px solid #B8E7D6; border-radius:3px; background:#E3FCF7; color:#00684A; font-size:7px; font-weight:700; letter-spacing:0.9px;">CONFIDENTIAL</span>${review}</span>
  ${logo}
</div>`;
}

export function buildFooterTemplate(
  meta: Pick<DocumentMeta, 'title' | 'customer' | 'copyrightYear'> & { language?: string },
): string {
  const year = meta.copyrightYear ?? String(new Date().getFullYear());
  const text = `Prepared for: ${meta.customer} ${meta.title} 0123456789 / · © ${year} MongoDB, Inc.`;
  return `${chromeFontCss(text, meta.language)}<div style="font-size:8px; width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0 ${PAGE_MARGIN_SIDE_MM}mm; color:#4A5860; font-family:${CHROME_FONT};">
  <span style="max-width:38%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Prepared for: ${escapeHtml(meta.customer)}</span>
  <span style="max-width:38%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center;">${escapeHtml(meta.title)}</span>
  <span style="white-space:nowrap;"><span class="pageNumber"></span> / <span class="totalPages"></span> &middot; &copy; ${escapeHtml(year)} MongoDB, Inc.</span>
</div>`;
}

export async function waitForContentReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolveImage, rejectImage) => {
          image.addEventListener('load', () => resolveImage(), { once: true });
          image.addEventListener('error', () => rejectImage(new Error(`Image failed to load: ${image.src}`)), { once: true });
        });
      }
      if (image.naturalWidth === 0) throw new Error(`Image failed to render: ${image.src}`);
      await image.decode();
    }));
  });
}

// ---------------------------------------------------------------------------
// Cover title (the only element that is ever resized)
// ---------------------------------------------------------------------------

const MIN_COVER_TITLE_PT = 16;
const MAX_COVER_TITLE_PT = 28;
const A4_WIDTH_PX = Math.round(PAGE_WIDTH_MM * MM_TO_PX);

async function coverTitleLines(page: Page): Promise<{ lines: number; text: string } | null> {
  return page.evaluate(() => {
    const el = document.querySelector('.cover-title');
    if (!el) return null;
    const style = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    return { lines: Math.round(range.getBoundingClientRect().height / lineHeight), text: (el as HTMLElement).innerText };
  });
}

/** Shrinks the cover title in 1pt steps (28pt -> 16pt) until it fits one line. */
export async function ensureCoverTitleFitsOneLine(page: Page): Promise<void> {
  let info = await coverTitleLines(page);
  let pt = MAX_COVER_TITLE_PT;
  while (info && info.lines > 1 && pt > MIN_COVER_TITLE_PT) {
    pt -= 1;
    await page.evaluate((size) => {
      const el = document.querySelector('.cover-title') as HTMLElement | null;
      if (el) el.style.fontSize = `${size}pt`;
    }, pt);
    info = await coverTitleLines(page);
  }
  if (info && info.lines > 1) {
    throw new Error(
      `Cover title still wraps to ${info.lines} lines even at ${MIN_COVER_TITLE_PT}pt. `
      + `Title: "${info.text}". Shorten the title in front matter.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Fallback font detection
// ---------------------------------------------------------------------------

interface CdpNode {
  nodeId: number;
  nodeType: number;
  nodeName: string;
  nodeValue?: string;
  children?: CdpNode[];
}

async function findFallbackFonts(page: Page): Promise<RenderIssue[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 }) as { root: CdpNode };
    const targets: Array<{ nodeId: number; text: string }> = [];
    const visitNode = (node: CdpNode): void => {
      if (node.nodeType === 1 && /^(HEAD|STYLE|SCRIPT|TITLE)$/.test(node.nodeName)) return;
      const text = (node.children ?? [])
        .filter((c) => c.nodeType === 3)
        .map((c) => c.nodeValue ?? '')
        .join('')
        .trim();
      if (node.nodeType === 1 && text) targets.push({ nodeId: node.nodeId, text });
      for (const child of node.children ?? []) visitNode(child);
    };
    visitNode(root);

    const offenders = new Map<string, Set<string>>();
    const batch = 64;
    for (let i = 0; i < targets.length; i += batch) {
      await Promise.all(targets.slice(i, i + batch).map(async ({ nodeId, text }) => {
        try {
          const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId }) as {
            fonts: Array<{ familyName: string; isCustomFont: boolean; glyphCount: number }>;
          };
          for (const font of fonts) {
            if (font.isCustomFont && BUNDLED_FONT_NAMES.some((n) => font.familyName.startsWith(n))) continue;
            const samples = offenders.get(font.familyName) ?? new Set<string>();
            if (samples.size < 5) samples.add(text.slice(0, 40));
            offenders.set(font.familyName, samples);
          }
        } catch {
          // Node detached (e.g. display:none); ignore.
        }
      }));
    }
    return [...offenders.entries()].map(([family, chars]) => ({
      severity: 'error' as const,
      code: 'fallback-font',
      message: `Glyphs were drawn with the non-bundled system font "${family}" `
        + `in: ${[...chars].map((s) => `"${s}"`).join(', ')}. `
        + 'Output would differ between machines. Remove or replace those characters (emoji/symbols) in the source.',
    }));
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** Run the PDF layout check (default true). */
  check?: boolean;
  /** Write rasterized PDF pages to this directory. */
  pagesDir?: string;
  /** TOC heading ids (used to locate body pages). */
  tocIds?: string[];
}

export interface RenderResult {
  html: string;
  pdf: Buffer;
  issues: RenderIssue[];
  analysis?: LayoutAnalysis;
  pageCount: number;
  pagePngs: string[];
}

async function printPdf(page: Page, meta: Pick<DocumentMeta, 'title' | 'customer' | 'stage' | 'copyrightYear'> & { language?: string }): Promise<Buffer> {
  return page.pdf({
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: buildHeaderTemplate(meta.stage),
    footerTemplate: buildFooterTemplate(meta),
    tagged: true,
    outline: true,
    margin: {
      top: `${PAGE_MARGIN_TOP_MM}mm`,
      bottom: `${PAGE_MARGIN_BOTTOM_MM}mm`,
      left: `${PAGE_MARGIN_SIDE_MM}mm`,
      right: `${PAGE_MARGIN_SIDE_MM}mm`,
    },
  });
}

/**
 * Renders the document once in Chromium and returns the PDF plus the HTML
 * serialized from the *same* laid-out DOM (fitted tables, TOC page numbers),
 * so both artifacts are identical in content.
 */
export async function renderDocument(
  htmlContent: string,
  meta: Pick<DocumentMeta, 'title' | 'customer' | 'stage' | 'copyrightYear'> & { language?: string },
  options: RenderOptions = {},
): Promise<RenderResult> {
  const issues: RenderIssue[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: A4_WIDTH_PX, height: 1123 });
    await page.setContent(htmlContent, { waitUntil: 'load' });
    await waitForContentReady(page);
    await ensureCoverTitleFitsOneLine(page);

    // Lay out body content at the exact printable text width.
    await page.setViewportSize({ width: Math.round(CONTENT_WIDTH_PX), height: 1123 });

    const tables = await page.evaluate(fitTables);
    for (const t of tables.filter((r) => r.overflow)) {
      issues.push({
        severity: 'error',
        code: 'table-overflow',
        message: `Table ${t.index + 1} ("${t.firstHeader.slice(0, 40)}") is wider than the page even with every cell wrapping. Reduce its columns.`,
      });
    }
    for (const line of await page.evaluate(findOverflowingCode)) {
      issues.push({ severity: 'error', code: 'code-overflow', message: `Code block still overflows the page: "${line}"` });
    }
    for (const what of await page.evaluate(findHorizontalOverflow)) {
      issues.push({ severity: 'error', code: 'content-overflow', message: `Content wider than the text column: ${what}` });
    }
    if (options.check !== false) issues.push(...await findFallbackFonts(page));
    const breakTargets = await page.evaluate(collectBreakTargets);

    // Up to three passes so TOC page numbers settle.
    let pdf = await printPdf(page, meta);
    for (let pass = 0; pass < 3; pass += 1) {
      const doc = await openPdf(pdf);
      const numbers: Record<string, number> = {};
      for (const h of await headingPositions(doc)) numbers[h.id] ??= h.page;
      await doc.destroy();
      const changed = await page.evaluate(applyTocPageNumbers, numbers);
      if (!changed) break;
      pdf = await printPdf(page, meta);
    }

    const html = `<!doctype html>\n${await page.evaluate(() => document.documentElement.outerHTML)}`;

    const doc = await openPdf(pdf);
    let analysis: LayoutAnalysis | undefined;
    if (options.check !== false) {
      analysis = await analyzePdf(doc, { breakTargets, tocIds: options.tocIds ?? [] });
      issues.push(...analysis.issues);
    }
    const pagePngs = options.pagesDir ? await writePagePngs(doc, options.pagesDir) : [];
    const pageCount: number = doc.numPages;
    await doc.destroy();

    return { html, pdf, issues, analysis, pageCount, pagePngs };
  } finally {
    await browser.close();
  }
}

/** Convenience wrapper: render and write only the PDF. */
export async function generatePdf(
  htmlContent: string,
  outputPath: string,
  meta: Pick<DocumentMeta, 'title' | 'customer' | 'stage' | 'copyrightYear'> & { language?: string },
): Promise<RenderResult> {
  const result = await renderDocument(htmlContent, meta, { check: false });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.pdf);
  return result;
}

export async function writeAiReviewPrompt(
  reviewDir: string,
  meta: Pick<DocumentMeta, 'title' | 'customer'>,
  pagePngs: string[],
): Promise<string> {
  await mkdir(reviewDir, { recursive: true });
  const files = pagePngs.map((p) => `screenshots/${basename(p)}`);
  const prompt = `# PDF layout review

The ${files.length} images below are the pages of the rendered PDF itself (rasterized from the PDF, so pagination is exact).
The automated layout check (layout-report.json next to the PDF) has already verified page fill, orphan headings,
overflow, unrendered Markdown markers, and fonts. Review what automation cannot judge.

- Title: ${meta.title}
- Customer: ${meta.customer}
- Pages: ${files.length}

For each page answer PASS or FAIL with a one-line reason for:

1. Density — no avoidable empty bands; spacing between blocks is even.
2. Tables — header distinct; short values on one line; only long prose/URIs wrap.
3. Code — readable, forced line breaks are at sensible points.
4. Hierarchy — H1/H2/H3 clearly distinct; badges, admonitions, Q&A render as boxes.
5. Text — no literal \`**\`, \`__\`, \`[!NOTE]\`, or raw HTML visible; no missing glyphs.
6. Cover (page 1) and TOC (page 2) — title on one line; TOC page numbers present and aligned.

Finish with the top 3 issues to fix in the Markdown source (never in the generated files).

## Pages

${files.map((f, i) => `- Page ${String(i + 1).padStart(2, '0')}: ${f}`).join('\n')}
`;
  const promptPath = join(reviewDir, 'REVIEW_PROMPT.md');
  await writeFile(promptPath, prompt, 'utf-8');
  return promptPath;
}
