import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  PAGE_MARGIN_BOTTOM_MM,
  PAGE_MARGIN_SIDE_MM,
  PAGE_MARGIN_TOP_MM,
  PRE_CHROME_PX,
} from './layout-constants.js';

const css = readFileSync(resolve(process.cwd(), 'assets/styles.css'), 'utf-8');

test('page margins match layout-constants.ts', () => {
  assert.match(
    css,
    new RegExp(`@page\\s*{[^}]*margin:\\s*${PAGE_MARGIN_TOP_MM}mm ${PAGE_MARGIN_SIDE_MM}mm ${PAGE_MARGIN_BOTTOM_MM}mm ${PAGE_MARGIN_SIDE_MM}mm`),
  );
  assert.match(css, new RegExp(`\\.toc,\\s*\\.content\\s*{[^}]*padding:\\s*${PAGE_MARGIN_SIDE_MM}mm`, 's'));
});

test('code block geometry matches the wrap width used by codewrap', () => {
  assert.equal(PRE_CHROME_PX, 2 * 12 + 2);
  assert.match(css, /pre,\s*pre\.shiki\s*{[^}]*font-size:\s*var\(--font-size-small\)[^}]*padding:\s*7px 12px/s);
  assert.match(css, /--font-size-small:\s*9pt/);
  assert.match(css, /white-space:\s*pre;/);
  assert.match(css, /font-variant-ligatures:\s*none/);
});

test('breaks pages only per chapter and never shrinks fonts', () => {
  assert.doesNotMatch(css, /^h1\s*{[^}]*break-before:\s*page/m);
  assert.match(css, /\.chapter-break-page \.content > h1\s*{[^}]*break-before:\s*page[^}]*margin-top:\s*0/s);
  assert.match(css, /\.page-break \+ h1\s*{[^}]*break-before:\s*auto/s);
  assert.doesNotMatch(css, /a\[href\^="http"\]::after/);
  assert.doesNotMatch(css, /^table\s*{[^}]*break-inside:\s*avoid/m);
  assert.match(css, /\.keep-together,[^{]*{[^}]*break-inside:\s*avoid/s);
});

test('uses only bundled font families', () => {
  assert.match(css, /--font-body:\s*"md2pdf Sans"/);
  assert.match(css, /--font-code:\s*"md2pdf Mono"/);
  assert.doesNotMatch(css, /Inter|Pretendard Variable|Source Code Pro/);
});

test('keeps GitHub-style table colors and Korean word-level breaking', () => {
  assert.match(css, /--color-table-header:\s+#DDE3E7/);
  assert.match(css, /--color-table-stripe:\s+#F6F8FA/);
  assert.match(css, /:lang\(ko\)\s*{[^}]*word-break:\s*keep-all/s);
  assert.match(css, /th\[align="right"\], td\[align="right"\]/);
});
