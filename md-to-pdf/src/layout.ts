/**
 * Browser-side layout passes. Every function here is serialized into the
 * page with `page.evaluate`, so it must be self-contained (no imports, no
 * references to module scope).
 */

export interface TableFitResult {
  index: number;
  /** 1 = everything on one line, 2 = prose columns wrap, 3 = long tokens break, 4 = fallback. */
  step: number;
  overflow: boolean;
  firstHeader: string;
}

/**
 * Fits every body table to the text column without changing font size:
 *
 * 1. all cells nowrap — kept if the table fits;
 * 2. otherwise prose columns (cells containing spaces) are released one at a
 *    time, longest text first, until it fits; identifiers/numbers stay on
 *    one line;
 * 3. then long unbreakable strings (URIs, long identifiers) may break
 *    anywhere;
 * 4. finally every cell may wrap/break.
 */
export function fitTables(): TableFitResult[] {
  const results: TableFitResult[] = [];
  const tables = Array.from(document.querySelectorAll<HTMLTableElement>('main.content table'));

  tables.forEach((table, index) => {
    const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>('th, td'));
    cells.forEach((cell) => cell.classList.remove('nw', 'brk'));

    const container = table.parentElement ?? document.body;
    const style = getComputedStyle(container);
    const avail = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const fits = (): boolean => table.getBoundingClientRect().width <= avail + 0.5;
    const text = (cell: HTMLElement): string => (cell.textContent ?? '').replace(/\s+/g, ' ').trim();
    const isProse = (cell: HTMLElement): boolean => /\s/.test(text(cell));
    const isLongToken = (cell: HTMLElement): boolean => longestToken(cell) > 24;
    function longestToken(cell: HTMLElement): number {
      return Math.max(0, ...text(cell).split(' ').map((w) => w.length));
    }
    const firstHeader = text(table.querySelector('th') ?? table);

    cells.forEach((cell) => cell.classList.add('nw'));
    if (fits()) {
      results.push({ index, step: 1, overflow: false, firstHeader });
      return;
    }

    const columnCount = Math.max(...Array.from(table.rows).map((row) => row.cells.length));
    const columns: HTMLTableCellElement[][] = Array.from({ length: columnCount }, () => []);
    for (const row of Array.from(table.rows)) {
      Array.from(row.cells).forEach((cell, j) => columns[j]?.push(cell));
    }
    const proseScore = (col: HTMLTableCellElement[]): number => Math.max(
      0,
      ...col.filter((cell) => cell.tagName === 'TD' && isProse(cell)).map((cell) => text(cell).length),
    );
    const order = columns
      .map((col, j) => ({ j, score: proseScore(col) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    for (const { j } of order) {
      columns[j]!.forEach((cell) => { if (isProse(cell)) cell.classList.remove('nw'); });
      if (fits()) {
        results.push({ index, step: 2, overflow: false, firstHeader });
        return;
      }
    }
    // Headers of released prose columns may wrap too.
    for (const { j } of order) {
      columns[j]!.forEach((cell) => cell.classList.remove('nw'));
    }
    if (fits()) {
      results.push({ index, step: 2, overflow: false, firstHeader });
      return;
    }

    // Release long unbreakable strings one cell at a time, longest first, so
    // a single URI breaks before shorter identifiers do.
    const longCells = cells
      .filter(isLongToken)
      .sort((a, b) => longestToken(b) - longestToken(a));
    for (const cell of longCells) {
      cell.classList.remove('nw');
      cell.classList.add('brk');
      if (fits()) {
        results.push({ index, step: 3, overflow: false, firstHeader });
        return;
      }
    }

    cells.forEach((cell) => {
      cell.classList.remove('nw');
      cell.classList.add('brk');
    });
    results.push({ index, step: 4, overflow: !fits(), firstHeader });
  });

  return results;
}

/** First line of every code block that is wider than its box. */
export function findOverflowingCode(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('pre'))
    .filter((pre) => pre.scrollWidth > pre.clientWidth + 1)
    .map((pre) => (pre.innerText || '').split('\n')[0]!.slice(0, 80));
}

/** Elements (other than pre) whose right edge sticks out of the text column. */
export function findHorizontalOverflow(): string[] {
  const main = document.querySelector('main.content');
  if (!main) return [];
  const right = main.getBoundingClientRect().right + 1;
  const out: string[] = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('p, li, table, img, figure, .admonition, .qa-block, h1, h2, h3, h4'))) {
    if (el.getBoundingClientRect().right > right) {
      out.push(`${el.tagName.toLowerCase()}: ${(el.textContent ?? '').trim().slice(0, 60)}`);
    }
  }
  return out;
}

/**
 * Ids of headings that intentionally start a new page (chapter-break mode,
 * or right after an explicit .page-break). Pages before them are exempt
 * from the page-fill check.
 */
export function collectBreakTargets(): string[] {
  const ids: string[] = [];
  const chapterMode = document.body.classList.contains('chapter-break-page');
  if (chapterMode) {
    document.querySelectorAll<HTMLElement>('main.content > h1[id]').forEach((h) => ids.push(h.id));
  }
  document.querySelectorAll<HTMLElement>('.page-break').forEach((el) => {
    let next = el.nextElementSibling as HTMLElement | null;
    while (next && !next.id && !/^H[1-6]$/.test(next.tagName)) next = next.nextElementSibling as HTMLElement | null;
    if (next?.id) ids.push(next.id);
  });
  return ids;
}

/** Writes PDF page numbers into the TOC; returns true when anything changed. */
export function applyTocPageNumbers(pages: Record<string, number>): boolean {
  let changed = false;
  document.querySelectorAll<HTMLElement>('.toc-page[data-toc-target]').forEach((el) => {
    const n = pages[el.dataset['tocTarget'] ?? ''];
    const value = n ? String(n) : '';
    if (el.textContent !== value) {
      el.textContent = value;
      changed = true;
    }
  });
  return changed;
}
