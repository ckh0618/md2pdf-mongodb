import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDocument } from './pdf.js';

test(
  'renders an actual PDF and HTML from the same DOM with the pinned Chromium runtime',
  { skip: process.env['RUN_PDF_INTEGRATION'] !== '1' },
  async () => {
    const result = await renderDocument(
      '<!doctype html><html lang="en"><body><main class="content"><h1 id="a">Runbook</h1><p>Verified output.</p></main></body></html>',
      { title: 'Runbook', customer: 'Example', stage: 'review' },
      { check: true, tocIds: ['a'] },
    );
    assert.equal(result.pdf.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(result.pdf.length > 1_000);
    assert.match(result.html, /Verified output/);
    assert.equal(result.pageCount, 1);
  },
);
