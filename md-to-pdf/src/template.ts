import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DocumentMeta, Participant, TocItem } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Official MongoDB brand assets (leaf + wordmark), downloaded from
// https://www.mongodb.com/company/newsroom/brand-resources. The white variant
// is used on the cover page, which has a dark background; the slate-blue
// variant is used in the print header on body pages, which have a white
// background (see pdf.ts).
const COVER_LOGO_PATH = resolve(__dirname, '../assets/mongodb-logo-white.svg');

function coverLogoDataUri(): string {
  try {
    const svg = readFileSync(COVER_LOGO_PATH, 'utf-8');
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  } catch {
    return '';
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function participantLine(p: Participant): string {
  const title = p.title ? `, ${escapeHtml(p.title)}` : '';
  const org = p.org ? `, ${escapeHtml(p.org)}` : '';
  const email = p.email ? ` &lt;${escapeHtml(p.email)}&gt;` : '';
  return `· ${escapeHtml(p.name)}${title}${org}${email}`;
}

function renderParticipants(meta: DocumentMeta): string {
  // Preserve the exact order declared in front matter's `participants` list
  // (e.g. customer attendees first, MongoDB attendees after, or whatever
  // order the author chose). `author` is only appended when absent from
  // that list, and never forced to the front.
  let all: Participant[];
  if (meta.participants && meta.participants.length > 0) {
    all = [...meta.participants];
    if (meta.author && !all.some((p) => p.name === meta.author!.name)) {
      all.push(meta.author);
    }
  } else if (meta.author) {
    all = [meta.author];
  } else {
    all = [];
  }
  if (all.length === 0) return '';
  const items = all.map(participantLine).join('<br>');
  return `<div class="cover-participants"><span class="cover-participants-label">Participants</span>${items}</div>`;
}

// Splits a leading manual chapter/section number (e.g. "1", "2.1", "5.3.1")
// from the rest of a heading's text so the number can be styled as a
// standalone badge in the TOC. Falls back to no badge when the heading
// doesn't start with a numeric token (e.g. "Q&A", "부록").
function splitTocNumber(text: string): { num: string | null; label: string } {
  const match = /^(\d+(?:\.\d+)*)\s+(.+)$/.exec(text);
  if (!match) return { num: null, label: text };
  return { num: match[1], label: match[2] };
}

function renderTocItems(items: TocItem[]): string {
  if (items.length === 0) return '';
  const entries = items.map((item) => {
    const children = renderTocItems(item.children);
    const { num, label } = splitTocNumber(item.text);
    const numSpan = num ? `<span class="toc-num">${escapeHtml(num)}</span>` : '';
    return `<li><span class="toc-entry"><a href="#${escapeHtml(item.id)}">${numSpan}<span class="toc-label">${escapeHtml(label)}</span></a></span>${children}</li>`;
  }).join('');
  return `<ul>${entries}</ul>`;
}

function renderCover(meta: DocumentMeta): string {
  const stage = meta.stage === 'review'
    ? '<div class="cover-stage cover-stage-review">FOR REVIEW</div>'
    : '';
  const subtitle = meta.subtitle ? `<p class="cover-subtitle">${escapeHtml(meta.subtitle)}</p>` : '';
  const project = meta.project ? `<p class="cover-project"><span>Project</span><strong>${escapeHtml(meta.project)}</strong></p>` : '';
  const customer = `<p class="cover-customer"><span>Prepared for</span><strong>${escapeHtml(meta.customer)}</strong></p>`;
  const version = meta.version ? `<p class="cover-version"><strong>Version:</strong> ${escapeHtml(meta.version)}</p>` : '';
  const date = `<p class="cover-date"><strong>Date:</strong> ${escapeHtml(meta.date)}</p>`;
  const participants = renderParticipants(meta);
  const classification = `<div class="cover-classification"><span class="cover-classification-badge confidential">${escapeHtml(meta.classification)}</span></div>`;
  const logoUri = coverLogoDataUri();
  const brand = logoUri
    ? `<img class="cover-logo" src="${logoUri}" alt="${escapeHtml(meta.brand)}" />`
    : `<div class="cover-brand" aria-label="${escapeHtml(meta.brand)}"><span>${escapeHtml(meta.brand)}</span></div>`;

  return `<section class="cover-page" aria-label="Document cover">
  ${stage}
  ${brand}
  <div class="cover-accent"></div>
  <h1 class="cover-title">${escapeHtml(meta.title)}</h1>
  ${subtitle}
  ${project}
  ${customer}
  <div class="cover-meta">${version}${date}</div>
  ${participants}
  ${classification}
</section>`;
}

export function buildHtml(
  contentHtml: string,
  toc: TocItem[],
  meta: DocumentMeta,
  cssPath: string,
): string {
  const css = readFileSync(cssPath, 'utf-8');
  const tocHtml = toc.length > 0
    ? `<nav class="toc" aria-label="Table of contents"><h2 class="toc-title">Table of Contents</h2>${renderTocItems(toc)}</nav>`
    : '';

  return `<!doctype html>
<html lang="${escapeHtml(meta.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(meta.title)}</title>
  <style>${css}</style>
</head>
<body>
  ${renderCover(meta)}
  ${tocHtml}
  <main class="content">${contentHtml}</main>
</body>
</html>`;
}
