import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FILL_ERROR_BELOW,
  FILL_WARNING_BELOW,
  MIN_FONT_PT,
  PAGE_HEIGHT_MM,
  PAGE_MARGIN_BOTTOM_MM,
  PAGE_MARGIN_SIDE_MM,
  PAGE_MARGIN_TOP_MM,
  PAGE_WIDTH_MM,
} from './layout-constants.js';
import type { RenderIssue } from './types.js';

/*
 * PDF-side analysis with pdf.js: named destinations (TOC page numbers,
 * heading positions), text sizes, and rasterized pages for fill measurement
 * and visual review. Pure Node — no Python/PyMuPDF needed, so every agent
 * runs the exact same check.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDFJS_ROOT = resolve(__dirname, '../node_modules/pdfjs-dist');
const PT_PER_MM = 72 / 25.4;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJs = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

let pdfjsPromise: Promise<PdfJs> | undefined;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

export async function openPdf(bytes: Uint8Array): Promise<PdfDoc> {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    standardFontDataUrl: `${PDFJS_ROOT}/standard_fonts/`,
    cMapUrl: `${PDFJS_ROOT}/cmaps/`,
    cMapPacked: true,
    isEvalSupported: false,
  }).promise;
}

export interface HeadingPosition {
  id: string;
  page: number;
  /** Distance from the top of the page, in pt. */
  top: number;
}

/** Heading ids (named destinations) -> 1-based page and vertical position. */
export async function headingPositions(doc: PdfDoc): Promise<HeadingPosition[]> {
  const dests: Record<string, unknown[]> = await doc.getDestinations();
  const out: HeadingPosition[] = [];
  for (const [name, dest] of Object.entries(dests)) {
    if (!Array.isArray(dest) || !dest[0]) continue;
    const pageIndex: number = await doc.getPageIndex(dest[0]);
    const page = await doc.getPage(pageIndex + 1);
    const height: number = page.view[3] - page.view[1];
    const y = typeof dest[3] === 'number' ? dest[3] : height;
    let id = name;
    try {
      id = decodeURIComponent(name);
    } catch {
      // keep raw name
    }
    out.push({ id, page: pageIndex + 1, top: Math.max(0, height - y) });
  }
  return out.sort((a, b) => a.page - b.page || a.top - b.top);
}

interface CanvasLike {
  toBuffer(mime: 'image/png'): Buffer;
}

async function renderPage(doc: PdfDoc, pageNumber: number, scale: number): Promise<{
  canvas: CanvasLike;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const factory = doc.canvasFactory;
  const { canvas, context } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, width: canvas.width, height: canvas.height, data: image.data };
}

/** Fraction of the printable content box (below the header, above the footer) that is used. */
function contentFill(data: Uint8ClampedArray, width: number, height: number): number {
  const top = Math.round((PAGE_MARGIN_TOP_MM / PAGE_HEIGHT_MM) * height);
  const bottom = Math.round(((PAGE_HEIGHT_MM - PAGE_MARGIN_BOTTOM_MM) / PAGE_HEIGHT_MM) * height);
  const left = Math.round((PAGE_MARGIN_SIDE_MM / PAGE_WIDTH_MM) * width);
  const right = Math.round(((PAGE_WIDTH_MM - PAGE_MARGIN_SIDE_MM) / PAGE_WIDTH_MM) * width);
  for (let y = bottom - 1; y >= top; y -= 1) {
    for (let x = left; x < right; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i]! < 245 || data[i + 1]! < 245 || data[i + 2]! < 245) {
        return (y - top + 1) / (bottom - top);
      }
    }
  }
  return 0;
}

export async function writePagePngs(doc: PdfDoc, dir: string, dpi = 110): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const { canvas } = await renderPage(doc, n, dpi / 72);
    const path = join(dir, `page-${String(n).padStart(2, '0')}.png`);
    await writeFile(path, canvas.toBuffer('image/png'));
    paths.push(path);
  }
  return paths;
}

export interface PageMetric {
  page: number;
  fill: number;
  minFontPt: number | null;
}

export interface LayoutAnalysis {
  pages: PageMetric[];
  issues: RenderIssue[];
}

/**
 * Checks the finished PDF:
 * - page-fill: a body page (not cover/TOC/last, not followed by an
 *   intentional break) that leaves too much of its content box empty;
 * - orphan-heading: a TOC heading that sits at the very bottom of a page;
 * - tiny-font: text smaller than MIN_FONT_PT inside the content box.
 */
export async function analyzePdf(
  doc: PdfDoc,
  options: { breakTargets: string[]; tocIds: string[] },
): Promise<LayoutAnalysis> {
  const issues: RenderIssue[] = [];
  const pages: PageMetric[] = [];
  const headings = await headingPositions(doc);
  const tocIdSet = new Set(options.tocIds);
  const bodyHeadings = headings.filter((h) => tocIdSet.has(h.id) || tocIdSet.size === 0);
  const firstBodyPage = bodyHeadings.length > 0 ? Math.min(...bodyHeadings.map((h) => h.page)) : 2;
  const breakPages = new Set(
    headings.filter((h) => options.breakTargets.includes(h.id)).map((h) => h.page),
  );

  const pageHeightPt = PAGE_HEIGHT_MM * PT_PER_MM;
  const contentTopPt = PAGE_MARGIN_TOP_MM * PT_PER_MM;
  const contentBottomPt = pageHeightPt - PAGE_MARGIN_BOTTOM_MM * PT_PER_MM;

  for (let n = 1; n <= doc.numPages; n += 1) {
    const { data, width, height } = await renderPage(doc, n, 0.5);
    const fill = contentFill(data, width, height);

    const page = await doc.getPage(n);
    const text = await page.getTextContent();
    let minFont: number | null = null;
    for (const item of text.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str.trim()) continue;
      const size = Math.hypot(item.transform[2]!, item.transform[3]!);
      const yTop = pageHeightPt - item.transform[5]!;
      if (yTop < contentTopPt || yTop > contentBottomPt + 2) continue;
      minFont = minFont === null ? size : Math.min(minFont, size);
    }
    pages.push({ page: n, fill, minFontPt: minFont });

    if (n >= firstBodyPage && minFont !== null && minFont < MIN_FONT_PT - 0.05) {
      issues.push({
        severity: 'warning',
        code: 'tiny-font',
        page: n,
        message: `Text smaller than ${MIN_FONT_PT}pt (${minFont.toFixed(1)}pt) on page ${n}. `
          + 'The stylesheet never goes below 7pt, so this is usually text inside an SVG/image scaled down to fit; '
          + 'use a larger source font or a wider image.',
      });
    }

    const isBody = n >= firstBodyPage && n < doc.numPages;
    if (isBody && !breakPages.has(n + 1)) {
      if (fill < FILL_ERROR_BELOW || fill < FILL_WARNING_BELOW) {
        const severity = fill < FILL_ERROR_BELOW ? 'error' : 'warning';
        const nextHeading = bodyHeadings.find((h) => h.page === n + 1);
        issues.push({
          severity,
          code: 'page-fill',
          page: n,
          message: `Page ${n} is only ${(fill * 100).toFixed(0)}% filled before a page break`
            + (nextHeading ? ` (page ${n + 1} starts near "${nextHeading.id}")` : '')
            + '. A block that must stay together (short table/code, image, admonition) was pushed to the next page; '
            + 'split it, move it, or shorten the content before it.',
        });
      }
    }
  }

  for (const h of bodyHeadings) {
    const below = contentBottomPt - h.top;
    if (below < 48) {
      issues.push({
        severity: 'error',
        code: 'orphan-heading',
        page: h.page,
        message: `Heading "${h.id}" is stranded at the bottom of page ${h.page}.`,
      });
    }
  }

  return { pages, issues };
}
