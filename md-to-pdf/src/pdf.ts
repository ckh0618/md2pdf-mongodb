import { chromium, type Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DocumentMeta, PdfStage } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Official MongoDB brand asset (leaf + wordmark) from
// https://www.mongodb.com/company/newsroom/brand-resources. The slate-blue
// variant is used here because the print header sits on a white page
// background; the cover page uses the white variant instead (see
// template.ts), since its background is dark.
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
  let svg: string;
  try {
    svg = readFileSync(LOGO_PATH, 'utf-8');
  } catch {
    return '';
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function buildHeaderTemplate(stage: PdfStage): string {
  const review = stage === 'review'
    ? '<span style="display:inline-block; margin-left:6px; padding:3px 8px; border:1px solid #944F00; border-radius:3px; background:#FFF2CC; color:#5C2E00; font-size:7px; font-weight:700; letter-spacing:0.9px;">FOR REVIEW</span>'
    : '';
  const logoUri = logoDataUri();
  const logo = logoUri
    ? `<img src="${logoUri}" alt="MongoDB" style="height:22px; width:auto; display:block;" />`
    : '';
  return `<div style="width:100%; padding:0 20mm; font-family:'Pretendard Variable', Pretendard, Inter, Arial, sans-serif; line-height:1; display:flex; align-items:center; justify-content:space-between;">
  <span><span style="display:inline-block; padding:3px 8px; border:1px solid #B8E7D6; border-radius:3px; background:#E3FCF7; color:#00684A; font-size:7px; font-weight:700; letter-spacing:0.9px;">CONFIDENTIAL</span>${review}</span>
  ${logo}
</div>`;
}

export function buildFooterTemplate(
  meta: Pick<DocumentMeta, 'title' | 'customer' | 'copyrightYear'>,
): string {
  const year = meta.copyrightYear ?? String(new Date().getFullYear());
  return `<div style="font-size:8px; width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0 20mm; color:#4A5860; font-family:'Pretendard Variable', Pretendard, Inter, Arial, sans-serif;">
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
      if (image.naturalWidth === 0) {
        throw new Error(`Image failed to render: ${image.src}`);
      }
      await image.decode();
    }));
  });
}

interface CoverTitleMeasurement {
  text: string;
  height: number;
  lineHeight: number;
  lineCount: number;
  fontSize: string;
}

function measureCoverTitle(page: Page): Promise<CoverTitleMeasurement | null> {
  return page.evaluate(() => {
    const el = document.querySelector('.cover-title');
    if (!el) return null;
    const style = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.2);
    const lineCount = Math.round(rect.height / lineHeight);
    return {
      text: (el as HTMLElement).innerText,
      height: rect.height,
      lineHeight,
      lineCount,
      fontSize: style.fontSize,
    };
  });
}

const MIN_COVER_TITLE_PT = 16;
const MAX_COVER_TITLE_PT = 28;

/**
 * Auto-shrinks the .cover-title font size in 1pt steps, against the real A4
 * print width (794 CSS px @ 210mm), until the title fits on a single line.
 * Mutates the live DOM so both PDF rendering and screenshot capture reflect
 * the adjusted size. Throws if even the minimum readable size still wraps.
 */
export async function ensureCoverTitleFitsOneLine(page: Page): Promise<void> {
  let info = await measureCoverTitle(page);
  let pt = MAX_COVER_TITLE_PT;
  while (info && info.lineCount > 1 && pt > MIN_COVER_TITLE_PT) {
    pt -= 1;
    await page.evaluate((size) => {
      const el = document.querySelector('.cover-title') as HTMLElement | null;
      if (el) el.style.fontSize = `${size}pt`;
    }, pt);
    info = await measureCoverTitle(page);
  }
  if (info && info.lineCount > 1) {
    throw new Error(
      `Cover title still wraps to ${info.lineCount} lines even at the minimum ${MIN_COVER_TITLE_PT}pt ` +
      `(height=${info.height.toFixed(1)}px, lineHeight=${info.lineHeight.toFixed(1)}px). ` +
      `Title: "${info.text}". Shorten the title in front matter.`,
    );
  }
}

const MIN_CODE_FONT_PX = 6;
const CODE_FONT_STEP_PX = 0.5;

// Must match the `@page { margin: 25mm 20mm 20mm 20mm; }` rule in
// styles.css (only the left/right values matter here).
const A4_WIDTH_PX = 794;
const PAGE_MARGIN_LEFT_MM = 20;
const PAGE_MARGIN_RIGHT_MM = 20;
const mmToPx = (mm: number): number => (mm / 25.4) * 96;
const PRINTABLE_CONTENT_WIDTH_PX = Math.round(
  A4_WIDTH_PX - mmToPx(PAGE_MARGIN_LEFT_MM) - mmToPx(PAGE_MARGIN_RIGHT_MM),
);

interface CodeBlockShrinkResult {
  shrunkCount: number;
  stillOverflowing: string[];
}

/**
 * Code blocks use `white-space: pre` (see styles.css) so a line is never
 * soft-wrapped by the browser. Chromium's print-to-PDF pipeline has no
 * concept of a "soft wrap": any visual line break it draws is baked into the
 * PDF's text layer as a hard line break, and `word-break` can split a break
 * mid-token. That means a wrapped code line pastes back as multiple broken
 * lines (or a word split in half) instead of the original single line.
 *
 * To preserve exact copy-paste fidelity, long lines are shrunk in-place
 * (font-size only, same technique as ensureCoverTitleFitsOneLine) until they
 * fit the block's width without wrapping, rather than letting them wrap.
 *
 * The measurement has to happen at the *printable* content width, not the
 * live viewport width: the `.content`/`.toc` side padding that carves out
 * the visible page margin only exists under `@media screen` (see
 * styles.css), and the `@page` margin used for print pagination is applied
 * by Chromium during the print pass itself, invisible to a plain
 * `getBoundingClientRect`/`clientWidth` read beforehand. Left unaccounted
 * for, blocks measure ~150px wider than what will actually be available at
 * print time, so lines that fit here still clip in the final PDF. The
 * viewport is temporarily narrowed to the real printable width for this
 * measurement and restored afterward.
 */
export async function ensureCodeBlocksFitWithoutWrapping(page: Page): Promise<CodeBlockShrinkResult> {
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: PRINTABLE_CONTENT_WIDTH_PX, height: originalViewport?.height ?? 1123 });

  try {
    return await page.evaluate(({ minFontPx, stepPx }) => {
      const blocks = Array.from(document.querySelectorAll<HTMLElement>('pre'));
      const stillOverflowing: string[] = [];
      let shrunkCount = 0;

      for (const pre of blocks) {
        let fontSize = parseFloat(getComputedStyle(pre).fontSize);
        let guard = 0;
        let shrunk = false;
        while (pre.scrollWidth > pre.clientWidth + 1 && fontSize > minFontPx && guard < 400) {
          fontSize -= stepPx;
          pre.style.fontSize = `${fontSize}px`;
          shrunk = true;
          guard++;
        }
        if (shrunk) shrunkCount++;
        if (pre.scrollWidth > pre.clientWidth + 1) {
          stillOverflowing.push((pre.innerText || '').split('\n')[0]?.slice(0, 80) ?? '');
        }
      }

      return { shrunkCount, stillOverflowing };
    }, { minFontPx: MIN_CODE_FONT_PX, stepPx: CODE_FONT_STEP_PX });
  } finally {
    if (originalViewport) await page.setViewportSize(originalViewport);
  }
}

export async function generatePdf(
  htmlContent: string,
  outputPath: string,
  meta: Pick<DocumentMeta, 'title' | 'customer' | 'stage' | 'copyrightYear'>,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();

    await page.emulateMedia({ media: 'print' });
    // A4 width at 96 CSS px/inch (210mm) so cover-title wrap checks match the
    // actual print layout used by page.pdf({ format: 'A4' }).
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.setContent(htmlContent, { waitUntil: 'load' });
    await waitForContentReady(page);
    await ensureCoverTitleFitsOneLine(page);
    const codeShrink = await ensureCodeBlocksFitWithoutWrapping(page);
    for (const line of codeShrink.stillOverflowing) {
      console.warn(`Code line still exceeds page width at the minimum font size and may wrap: "${line}"`);
    }

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: buildHeaderTemplate(meta.stage),
      footerTemplate: buildFooterTemplate(meta),
      tagged: true,
      outline: true,
      margin: {
        top: '25mm',
        bottom: '20mm',
        left: '20mm',
        right: '20mm',
      },
    });
  } finally {
    await browser.close();
  }
}

export async function generateReviewShots(
  htmlContent: string,
  shotsDir: string,
  meta: Pick<DocumentMeta, 'title' | 'customer' | 'stage' | 'copyrightYear'>,
): Promise<string[]> {
  await mkdir(shotsDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const paths: string[] = [];
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ media: 'print' });

    const a4WidthPx = 794;
    const a4HeightPx = 1123;
    const marginTopMm = 25;
    const marginBottomMm = 20;
    const printableHeightPx = a4HeightPx - Math.round(((marginTopMm + marginBottomMm) / 297) * a4HeightPx);

    await page.setViewportSize({ width: a4WidthPx, height: printableHeightPx });
    await page.setContent(htmlContent, { waitUntil: 'load' });
    await waitForContentReady(page);
    await ensureCoverTitleFitsOneLine(page);
    await ensureCodeBlocksFitWithoutWrapping(page);

    const totalHeight = await page.evaluate(() => document.body.scrollHeight);
    const pageCount = Math.ceil(totalHeight / printableHeightPx);

    for (let i = 0; i < pageCount; i++) {
      const y = i * printableHeightPx;
      await page.evaluate((yPos) => window.scrollTo(0, yPos), y);
      await page.waitForTimeout(100);
      const isLast = i === pageCount - 1;
      const remaining = totalHeight - y;
      const clipHeight = isLast && remaining < printableHeightPx ? remaining : printableHeightPx;
      const filePath = join(shotsDir, `page-${String(i + 1).padStart(2, '0')}.png`);
      await page.screenshot({
        path: filePath,
        clip: { x: 0, y: 0, width: a4WidthPx, height: clipHeight },
        type: 'png',
      });
      paths.push(filePath);
    }
  } finally {
    await browser.close();
  }
  return paths;
}

export async function generateAiReviewPackage(
  htmlContent: string,
  reviewDir: string,
  meta: Pick<DocumentMeta, 'title' | 'customer' | 'stage' | 'copyrightYear'>,
): Promise<{ shotsDir: string; promptPath: string; shotPaths: string[] }> {
  const shotsDir = join(reviewDir, 'screenshots');
  const shotPaths = await generateReviewShots(htmlContent, shotsDir, meta);

  const shotFilenames = shotPaths.map((p) => `screenshots/${basename(p)}`);
  const title = meta.title;
  const customer = meta.customer;
  const pageCount = shotPaths.length;

  const prompt = `# PDF 렌더링 미학 리뷰 요청

아래 스크린샷 ${pageCount}장은 MongoDB 컨설팅 리포트 PDF의 각 페이지를 캡처한 것입니다.
Vision 능력을 가진 AI 모델이 아래 스크린샷들을 검토하고 미학적 품질을 평가해 주세요.

## 문서 정보
- 제목: ${title}
- 고객사: ${customer}
- 총 페이지 수: ${pageCount}

## 평가 기준

각 페이지를 다음 기준으로 1-5점 척도로 평가하고, 구체적 개선점을 제시해 주세요.

### 1. 레이아웃 & 여백 (Layout & Whitespace)
- 페이지 여백이 균형 잡혀 있는가?
- 콘텐츠가 페이지에 과도하게 빽빽하거나 너무 여백이 많지 않은가?
- 헤딩과 본문 사이 간격이 적절한가?

### 2. 타이포그래피 (Typography)
- 헤딩 계층(h1/h2/h3)이 시각적으로 명확히 구분되는가?
- 폰트 크기가 본문 대비 적절한 비율을 유지하는가?
- 줄 간격(line-height)이 읽기 편한가?
- 코드 블록과 본문의 시각적 구분이 명확한가?

### 3. 표 & 이미지 (Tables & Images)
- 표가 페이지 너비에 맞게 렌더링되는가?
- 표 헤더 행이 명확히 구분되는가?
- 이미지가 적절한 크기와 여백을 가지는가?
- 표나 이미지가 페이지 경계에서 잘리는가?

### 4. 페이지 분할 (Page Break)
- 헤딩이 페이지 하단에 혼자 남아있지 않은가? (orphan heading)
- 표가 페이지 경계에서 헤더 없이 이어지지 않는가?
- 단락이 페이지 경계에서 자연스럽게 나뉘는가?

### 5. 표지 (Cover Page) — page-01만 해당
- 제목이 한 줄에 표시되는가?
- 브랜드, 제목, 부제, 메타 정보의 시각적 위계가 명확한가?
- 전체적인 컬러와 대비가 조화로운가?

### 6. 목차 (Table of Contents) — page-02만 해당
- 항목과 페이지 번호 사이 점 리더가 정렬되어 있는가?
- 헤딩 계층이 들여쓰기로 명확히 표현되는가?

## 출력 형식

각 페이지별로 다음 형식으로 평가해 주세요:

\`\`\`
## Page N
- Layout: X/5 — (한줄 코멘트)
- Typography: X/5 — (한줄 코멘트)
- Tables/Images: X/5 — (한줄 코멘트 또는 N/A)
- Page Break: X/5 — (한줄 코멘트)
- 개선 제안: (구체적 액션 아이템 또는 "이슈 없음")
\`\`\`

마지막에 전체 요약과 우선 수정이 필요한 상위 3개 이슈를 제시해 주세요.

## 스크린샷 파일 목록

${shotFilenames.map((f, i) => `- Page ${String(i + 1).padStart(2, '0')}: ${f}`).join('\n')}
`;

  const promptPath = join(reviewDir, 'REVIEW_PROMPT.md');
  await writeFile(promptPath, prompt, 'utf-8');

  return { shotsDir, promptPath, shotPaths };
}
