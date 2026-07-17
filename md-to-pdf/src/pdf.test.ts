import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFooterTemplate, buildHeaderTemplate } from './pdf.js';

test('renders a Confidential badge on the left side of the page header', () => {
  const header = buildHeaderTemplate('customer');

  assert.match(header, />CONFIDENTIAL<\/span>/);
  assert.match(header, /padding:0 20mm/);
  assert.match(header, /background:#E3FCF7/);
  assert.match(header, /color:#00684A/);
  assert.doesNotMatch(header, /#DB3030/);
  assert.doesNotMatch(header, /FOR REVIEW/);
});

test('adds a review marker only to review headers', () => {
  assert.match(buildHeaderTemplate('review'), /FOR REVIEW/);
  assert.doesNotMatch(buildHeaderTemplate('customer'), /FOR REVIEW/);
});

test('renders an escaped customer name, title, and page counters in the footer', () => {
  const footer = buildFooterTemplate({
    customer: 'ACME <Lab>',
    title: 'Migration & Operations',
  });

  assert.match(footer, /Prepared for: ACME &lt;Lab&gt;/);
  assert.match(footer, /Migration &amp; Operations/);
  assert.match(footer, /class="pageNumber"/);
  assert.match(footer, /class="totalPages"/);
});
