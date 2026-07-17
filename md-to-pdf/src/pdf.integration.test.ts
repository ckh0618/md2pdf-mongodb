import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generatePdf } from './pdf.js';

test(
  'renders an actual PDF with the pinned Chromium runtime',
  { skip: process.env['RUN_PDF_INTEGRATION'] !== '1' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'runbook-pdf-integration-'));
    const output = join(directory, 'runbook.pdf');
    try {
      await generatePdf(
        '<!doctype html><html><body><h1>Runbook</h1><p>Verified output.</p></body></html>',
        output,
        { title: 'Runbook', customer: 'Example', stage: 'review' },
      );
      const bytes = await readFile(output);
      assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
      assert.ok(bytes.length > 1_000);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
