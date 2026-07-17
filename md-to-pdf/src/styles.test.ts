import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('uses a distinct medium-gray header with light GitHub-style striped rows', () => {
  const css = readFileSync(resolve(process.cwd(), 'assets/styles.css'), 'utf-8');

  assert.match(css, /--color-table-border:\s+#D0D7DE/);
  assert.match(css, /--color-table-header:\s+#DDE3E7/);
  assert.match(css, /--color-table-stripe:\s+#F6F8FA/);
  assert.match(css, /thead tr\s*{[^}]*background-color:\s*var\(--color-table-header\)[^}]*color:\s*var\(--color-text-primary\)/s);
  assert.match(css, /thead th\s*{[^}]*border:\s*1px solid var\(--color-table-border\)/s);
  assert.match(css, /tbody td\s*{[^}]*border:\s*1px solid var\(--color-table-border\)/s);
  assert.doesNotMatch(css, /thead tr\s*{[^}]*background-color:\s*var\(--color-text-primary\)/s);
  assert.match(css, /\.cover-classification-badge\.confidential\s*{[^}]*background-color:\s*#00ED64[^}]*color:\s*#001E2B/s);
  assert.doesNotMatch(css, /\.cover-classification-badge\.confidential\s*{[^}]*var\(--color-warning\)/s);
});

test('provides a centered responsive document layout for HTML output', () => {
  const css = readFileSync(resolve(process.cwd(), 'assets/styles.css'), 'utf-8');

  assert.match(css, /@media screen\s*{/);
  assert.match(css, /\.cover-page,\s*\.toc,\s*\.content\s*{[^}]*width:\s*min\(100%, 210mm\)/s);
  assert.match(css, /\.toc,\s*\.content\s*{[^}]*padding:\s*20mm/s);
  assert.match(css, /@media screen and \(max-width:\s*700px\)/);
});
