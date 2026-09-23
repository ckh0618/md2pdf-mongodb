#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import matter from 'gray-matter';
import { convertMarkdown } from './markdown.js';
import { buildHtml } from './template.js';
import { renderDocument, writeAiReviewPrompt } from './pdf.js';
import { writeArtifactPair } from './artifacts.js';
import type { ChapterBreak, DocumentMeta, Participant, RenderIssue, TocItem } from './types.js';
import {
  defaultOutputPath,
  defaultHtmlOutputPath,
  parsePdfStage,
  requireAudience,
  validateStageInputs,
} from './workflow.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');
const CSS_PATH = resolve(PACKAGE_ROOT, 'assets/styles.css');

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function metadataValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function asParticipant(raw: unknown): Participant | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const rec = raw as Record<string, unknown>;
  const name = metadataValue(rec['name']);
  if (!name) return undefined;
  return {
    name,
    title: metadataValue(rec['title']),
    org: metadataValue(rec['org']) ?? metadataValue(rec['organization']),
    email: metadataValue(rec['email']),
  };
}

function asParticipants(raw: unknown): Participant[] | undefined {
  if (Array.isArray(raw)) {
    const list = raw.map(asParticipant).filter((p): p is Participant => Boolean(p));
    return list.length > 0 ? list : undefined;
  }
  const single = asParticipant(raw);
  return single ? [single] : undefined;
}

function parseChapterBreak(value: string | undefined): ChapterBreak {
  if (value === undefined || value === '' || value === 'page' || value === 'true') return 'page';
  if (value === 'none' || value === 'false') return 'none';
  throw new Error(`chapter_break must be "none" or "page" (got "${value}").`);
}

function flattenToc(items: TocItem[]): string[] {
  return items.flatMap((item) => [item.id, ...flattenToc(item.children)]);
}

/** Renderer identity plus a warning when the installed copy was edited locally. */
function rendererIdentity(): { version: string; commit?: string; modified: string[] } {
  const pkg = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf-8')) as { version: string };
  const repoRoot = resolve(PACKAGE_ROOT, '..');
  try {
    const commit = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const status = execFileSync(
      'git',
      ['-C', repoRoot, 'status', '--porcelain', '--', 'md-to-pdf/assets', 'md-to-pdf/src', 'md-to-pdf/package.json'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return { version: pkg.version, commit, modified: status ? status.split('\n').map((l) => l.trim()) : [] };
  } catch {
    return { version: pkg.version, modified: [] };
  }
}

function printIssues(issues: RenderIssue[]): void {
  const order = { error: 0, warning: 1, info: 2 } as const;
  for (const issue of [...issues].sort((a, b) => order[a.severity] - order[b.severity])) {
    const where = issue.page ? ` [page ${issue.page}]` : '';
    const line = `${issue.severity.toUpperCase()} ${issue.code}${where}: ${issue.message}`;
    if (issue.severity === 'error') console.error(line);
    else console.warn(line);
  }
}

const program = new Command();

program
  .name('md-to-pdf')
  .description('Convert a Markdown document to paired HTML and PDF artifacts')
  .argument('<input>', 'Input Markdown file path')
  .requiredOption('--stage <stage>', 'Output stage: review or customer')
  .option('-o, --output <path>', 'Output PDF path (default: stage-specific filename)')
  .option('--html-output <path>', 'Output HTML path (default: stage-specific filename)')
  .option('--review-appendix <path>', 'Sanitized validation-review Markdown; required for review')
  .option('--review-source-sha256 <hash>', 'Reviewed source SHA-256 (customer stage after review)')
  .option('-t, --title <title>', 'Document title')
  .option('-v, --version <version>', 'Document version')
  .option('-d, --date <date>', 'Document date (default: today)')
  .option('-s, --subtitle <subtitle>', 'Document subtitle')
  .option('--language <tag>', 'Document BCP 47 language tag (default: front matter or "en")')
  .option('--customer <name>', 'Name shown on the cover and footer (default: Document)')
  .option('--brand <name>', 'Cover brand (default: Markdown Document)')
  .option('--project <name>', 'Project or application name shown on the cover')
  .option('--copyright-year <year>', 'Copyright year in the footer (default: current year)')
  .option('--chapter-break <mode>', 'page (default): start every H1 on a new page; none: continuous flow')
  .option('--no-references', 'Keep external links inline instead of numbered references')
  .option('--no-check', 'Skip the layout check (not allowed for customer delivery)')
  .option('--pages <dir>', 'Write every PDF page as PNG (rasterized from the PDF) into the directory')
  .option('--review-shots <dir>', 'Alias of --pages')
  .option('--ai-review <dir>', 'Write PDF page PNGs plus REVIEW_PROMPT.md for a vision model')
  .action(async (input: string, opts: Record<string, string | boolean | undefined>) => {
    try {
      const str = (key: string): string | undefined => (typeof opts[key] === 'string' ? opts[key] as string : undefined);
      const identity = rendererIdentity();
      console.log(`md2pdf renderer ${identity.version}${identity.commit ? ` (${identity.commit})` : ''}`);
      if (identity.modified.length > 0) {
        console.warn(
          `WARNING renderer-modified: the installed renderer has local changes (${identity.modified.join(', ')}). `
          + 'Output will not match other agents/machines. Revert them; fix layout in the Markdown instead.',
        );
      }

      const inputPath = resolve(input);
      if (!existsSync(inputPath)) throw new Error(`Input Markdown file does not exist: ${inputPath}`);
      const raw = readFileSync(inputPath, 'utf-8');
      const { data: frontMatter, content } = matter(raw);
      const stage = parsePdfStage(str('stage') ?? '');
      validateStageInputs(stage, {
        reviewAppendix: str('reviewAppendix'),
        reviewSourceSha256: str('reviewSourceSha256'),
      });
      requireAudience(stage, 'document', frontMatter['audience']);
      const sourceSha256 = createHash('sha256').update(raw).digest('hex');
      const reviewedSha = str('reviewSourceSha256');
      if (stage === 'customer' && reviewedSha && sourceSha256.toLowerCase() !== reviewedSha.toLowerCase()) {
        throw new Error('Source changed after review. Generate and inspect new review artifacts before customer release.');
      }

      let renderedContent = content;
      if (stage === 'review') {
        const reviewAppendixPath = resolve(str('reviewAppendix')!);
        if (!existsSync(reviewAppendixPath)) throw new Error(`Review appendix does not exist: ${reviewAppendixPath}`);
        const { data: reviewFrontMatter, content: reviewContent } = matter(readFileSync(reviewAppendixPath, 'utf-8'));
        requireAudience(stage, 'review-appendix', reviewFrontMatter['audience']);
        renderedContent = `${content.trimEnd()}\n\n<div class="page-break"></div>\n\n${reviewContent.trimStart()}`;
      }

      const inputBase = basename(inputPath, extname(inputPath));
      const languageFromFilename = inputBase.startsWith('RUNBOOK.') ? inputBase.slice('RUNBOOK.'.length) : 'en';
      const language = str('language') ?? metadataValue(frontMatter['language']) ?? languageFromFilename;
      const customer = (str('customer') ?? metadataValue(frontMatter['customer']) ?? 'Document').trim();

      const { html, toc, issues: markdownIssues } = await convertMarkdown(renderedContent, dirname(inputPath), {
        language,
        references: opts['references'] !== false && frontMatter['references'] !== false,
      });

      const meta: DocumentMeta = {
        title: str('title') ?? metadataValue(frontMatter['title']) ?? toc[0]?.text ?? inputBase,
        customer,
        brand: str('brand') ?? metadataValue(frontMatter['brand']) ?? 'Markdown Document',
        language,
        version: str('version') ?? metadataValue(frontMatter['version']),
        date: str('date') ?? metadataValue(frontMatter['date']) ?? todayIso(),
        project: str('project') ?? metadataValue(frontMatter['project']) ?? metadataValue(frontMatter['app']),
        author: asParticipant(frontMatter['author']),
        participants: asParticipants(frontMatter['participants']),
        copyrightYear: str('copyrightYear')
          ?? metadataValue(frontMatter['copyrightYear'])
          ?? metadataValue(frontMatter['copyright_year'])
          ?? String(new Date().getFullYear()),
        classification: 'Confidential',
        subtitle: str('subtitle') ?? metadataValue(frontMatter['subtitle']),
        stage,
        chapterBreak: parseChapterBreak(str('chapterBreak') ?? metadataValue(frontMatter['chapter_break'])),
      };

      const issues: RenderIssue[] = [...markdownIssues];
      for (const [field, value] of Object.entries({ title: meta.title, subtitle: meta.subtitle, project: meta.project, customer: meta.customer })) {
        if (value && /\*\*|__|`/.test(value)) {
          issues.push({ severity: 'error', code: 'residual-markdown-marker', message: `Front matter "${field}" contains Markdown markup, which is shown literally: "${value}"` });
        }
      }

      const fullHtml = buildHtml(html, toc, meta, CSS_PATH);

      const outputPath = str('output') ? resolve(str('output')!) : defaultOutputPath(inputPath, stage);
      const htmlOutputPath = str('htmlOutput') ? resolve(str('htmlOutput')!) : defaultHtmlOutputPath(inputPath, stage);
      if (htmlOutputPath === outputPath) throw new Error('HTML and PDF output paths must be different.');
      if (htmlOutputPath === inputPath || outputPath === inputPath) {
        throw new Error('Rendered output paths must not overwrite the Markdown source.');
      }

      const aiReviewDir = str('aiReview') ? resolve(str('aiReview')!) : undefined;
      const pagesDir = aiReviewDir
        ? join(aiReviewDir, 'screenshots')
        : (str('pages') ?? str('reviewShots')) ? resolve((str('pages') ?? str('reviewShots'))!) : undefined;

      const check = opts['check'] !== false;
      const result = await renderDocument(fullHtml, meta, { check, pagesDir, tocIds: flattenToc(toc) });
      issues.push(...result.issues);

      await writeArtifactPair(
        htmlOutputPath,
        outputPath,
        async (temporaryPath) => writeFile(temporaryPath, result.html, 'utf-8'),
        async (temporaryPath) => writeFile(temporaryPath, result.pdf),
      );

      const errors = issues.filter((i) => i.severity === 'error');
      const warnings = issues.filter((i) => i.severity === 'warning');
      const reportPath = outputPath.replace(/\.pdf$/i, '') + '.layout.json';
      await writeFile(reportPath, JSON.stringify({
        renderer: identity,
        source: basename(inputPath),
        sourceSha256,
        pageCount: result.pageCount,
        checked: check,
        status: !check ? 'unchecked' : errors.length > 0 ? 'fail' : 'pass',
        pages: result.analysis?.pages ?? [],
        issues,
      }, null, 2), 'utf-8');

      console.log(`HTML generated: ${htmlOutputPath}`);
      console.log(`PDF generated: ${outputPath} (${result.pageCount} pages)`);
      console.log(`Layout report: ${reportPath}`);
      console.log(`Source SHA-256: ${sourceSha256}`);
      if (result.pagePngs.length > 0) console.log(`Page images: ${result.pagePngs.length} in ${pagesDir}`);
      if (aiReviewDir) {
        const promptPath = await writeAiReviewPrompt(aiReviewDir, meta, result.pagePngs);
        console.log(`AI review prompt: ${promptPath}`);
      }

      printIssues(issues);
      if (!check) {
        console.warn('WARNING layout check skipped (--no-check). Do not deliver this output to a customer.');
      } else if (errors.length > 0) {
        console.error(`LAYOUT CHECK FAILED: ${errors.length} error(s), ${warnings.length} warning(s). Fix the Markdown source and render again.`);
        process.exit(2);
      } else {
        console.log(`LAYOUT CHECK PASSED (${warnings.length} warning(s)).`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program.parse();
