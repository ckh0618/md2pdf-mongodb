import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildHtml } from './template.js';

test('renders escaped metadata, classification, and nested TOC', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md-to-pdf-template-'));
  try {
    const cssPath = join(directory, 'styles.css');
    await writeFile(cssPath, 'body { color: black; }');
    const html = buildHtml(
      '<h1 id="start">Start</h1>',
      [{ id: 'start', text: 'Start & Go', depth: 1, children: [{ id: 'child', text: 'Child', depth: 2, children: [] }] }],
      { title: '<Runbook>', customer: 'ACME <Lab>', brand: 'Docs', language: 'ko', subtitle: 'Safe & repeatable', date: '2026-07-10', classification: 'Confidential', stage: 'review' },
      cssPath,
    );

    assert.match(html, /&lt;Runbook&gt;/);
    assert.match(html, /<html lang="ko">/);
    assert.match(html, /Safe &amp; repeatable/);
    assert.match(html, /Prepared for/);
    assert.match(html, /ACME &lt;Lab&gt;/);
    assert.match(html, /cover-classification-badge confidential/);
    assert.match(html, /cover-stage-review">FOR REVIEW/);
    assert.match(html, /href="#start"><span class="toc-label">Start &amp; Go<\/span>/);
    assert.match(html, /<span class="toc-page" data-toc-target="start"><\/span>/);
    assert.match(html, /href="#child"><span class="toc-label">Child<\/span>/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('splits a leading manual chapter number into a TOC badge, leaving unnumbered headings plain', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md-to-pdf-template-'));
  try {
    const cssPath = join(directory, 'styles.css');
    await writeFile(cssPath, 'body { color: black; }');
    const html = buildHtml(
      '<h1 id="s1">1 Executive Summary</h1>',
      [
        {
          id: 's1',
          text: '1 Executive Summary',
          depth: 1,
          children: [{ id: 's21', text: '2.1 Application', depth: 2, children: [] }],
        },
        { id: 'qa', text: 'Q&A', depth: 1, children: [] },
        { id: 'appendix', text: '부록', depth: 1, children: [] },
      ],
      { title: 'Runbook', customer: 'ACME', brand: 'Docs', language: 'en', date: '2026-07-12', classification: 'Confidential', stage: 'customer' },
      cssPath,
    );

    assert.match(html, /<span class="toc-num">1<\/span><span class="toc-label">Executive Summary<\/span>/);
    assert.match(html, /<span class="toc-num">2\.1<\/span><span class="toc-label">Application<\/span>/);
    // Non-numbered headings render without a toc-num badge at all.
    assert.match(html, /href="#qa"><span class="toc-label">Q&amp;A<\/span>/);
    assert.doesNotMatch(html, /href="#qa"><span class="toc-num">/);
    assert.match(html, /href="#appendix"><span class="toc-label">부록<\/span>/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('does not mark a customer release as review material', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md-to-pdf-template-'));
  try {
    const cssPath = join(directory, 'styles.css');
    await writeFile(cssPath, 'body { color: black; }');
    const html = buildHtml(
      '<h1 id="start">Start</h1>',
      [],
      { title: 'Runbook', customer: 'ACME', brand: 'Docs', language: 'en', date: '2026-07-12', classification: 'Confidential', stage: 'customer' },
      cssPath,
    );
    assert.doesNotMatch(html, /FOR REVIEW/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('renders participants in the exact front matter declaration order, not author-first', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md-to-pdf-template-'));
  try {
    const cssPath = join(directory, 'styles.css');
    await writeFile(cssPath, 'body { color: black; }');
    const html = buildHtml(
      '<h1 id="start">Start</h1>',
      [],
      {
        title: 'Runbook',
        customer: 'ACME',
        brand: 'Docs',
        language: 'en',
        date: '2026-07-12',
        classification: 'Confidential',
        stage: 'customer',
        author: { name: 'Han Choi', title: 'Consulting Engineer', org: 'MongoDB' },
        participants: [
          { name: 'Customer Person A', title: 'Lead', org: 'ACME' },
          { name: 'Customer Person B', title: 'Engineer', org: 'ACME' },
          { name: 'Han Choi', title: 'Consulting Engineer', org: 'MongoDB' },
          { name: 'Han PM', title: 'PM', org: 'MongoDB' },
        ],
      },
      cssPath,
    );
    const participantsBlock = /<div class="cover-participants">.*?<\/div>/s.exec(html)?.[0] ?? '';
    const order = [...participantsBlock.matchAll(/·\s*([^,<]+)/g)].map((m) => m[1].trim());
    assert.deepEqual(order, ['Customer Person A', 'Customer Person B', 'Han Choi', 'Han PM']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('appends author to participants only when missing from the declared list', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md-to-pdf-template-'));
  try {
    const cssPath = join(directory, 'styles.css');
    await writeFile(cssPath, 'body { color: black; }');
    const html = buildHtml(
      '<h1 id="start">Start</h1>',
      [],
      {
        title: 'Runbook',
        customer: 'ACME',
        brand: 'Docs',
        language: 'en',
        date: '2026-07-12',
        classification: 'Confidential',
        stage: 'customer',
        author: { name: 'Han Choi', title: 'Consulting Engineer', org: 'MongoDB' },
        participants: [
          { name: 'Customer Person A', title: 'Lead', org: 'ACME' },
        ],
      },
      cssPath,
    );
    const participantsBlock = /<div class="cover-participants">.*?<\/div>/s.exec(html)?.[0] ?? '';
    const order = [...participantsBlock.matchAll(/·\s*([^,<]+)/g)].map((m) => m[1].trim());
    assert.deepEqual(order, ['Customer Person A', 'Han Choi']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('starts every chapter on a new page unless chapter_break is none', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md-to-pdf-template-'));
  try {
    const cssPath = join(directory, 'styles.css');
    await writeFile(cssPath, 'body { color: black; }');
    const base = { title: 'T', customer: 'C', brand: 'B', language: 'en', date: '2026-01-01', classification: 'Confidential' as const, stage: 'customer' as const };
    assert.match(buildHtml('<h1>A</h1>', [], base, cssPath), /<body class="md2pdf chapter-break-page">/);
    assert.match(buildHtml('<h1>A</h1>', [], { ...base, chapterBreak: 'none' }, cssPath), /<body class="md2pdf chapter-break-none">/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
