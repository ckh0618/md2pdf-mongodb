# md2pdf

`md2pdf` is an Agent skill (Codex, OpenCode, Claude Code) and command-line renderer that converts one
Markdown source document into a customer-ready PDF and a self-contained HTML file laid out from the
same DOM. The same Markdown produces the same pages on every machine and with every agent.

## Features

- Dense, consistent A4 layout: chapters flow continuously, short tables/code stay together, long ones
  continue on the next page
- Bundled fonts (Pretendard, Noto Sans SC/TC, JetBrains Mono) — no system-font differences
- CJK-aware emphasis: `**중요(필수)**입니다` and `**注意（重要）**的` render bold
- Tables fitted without shrinking text: short values stay on one line, only prose and long URIs wrap
- Over-long code lines receive real, language-aware line breaks (`\` for shell) — fonts never shrink
- Table of contents with PDF page numbers; external links collected as numbered references
- Automated layout check (page fill, orphan headings, overflow, literal `**`, fallback fonts) with a
  JSON report and page images rasterized from the PDF
- Customer and review output stages

## Quick start

### One-line Agent installation

For Codex, send this one-line instruction to the Agent:

~~~text
$skill-installer Install the md2pdf skill from https://github.com/ckh0618/md2pdf-mongodb
~~~

For OpenCode and Claude Code (one shared clone, see [INSTALL.md](INSTALL.md)):

~~~bash
T="$HOME/.agents/skills/md2pdf"; if [ -d "$T/.git" ]; then git -C "$T" pull --ff-only; else git clone https://github.com/ckh0618/md2pdf-mongodb.git "$T"; fi && (cd "$T/md-to-pdf" && npm ci && npm run build && npx playwright install chromium) && mkdir -p "$HOME/.claude/skills" && ln -sfn "$T" "$HOME/.claude/skills/md2pdf"
~~~

### Requirements

- Git
- Node.js 20 or later
- npm
- Chromium installed through Playwright

### Install the renderer

```bash
git clone https://github.com/ckh0618/md2pdf-mongodb.git
cd md2pdf-mongodb/md-to-pdf
npm ci
npm run build
npx playwright install chromium
```

Verify the installation:

```bash
node dist/cli.js --help
```

For complete Agent installation and update instructions, see
[`INSTALL.md`](INSTALL.md).

## Convert a Markdown document

From the repository root:

```bash
node md-to-pdf/dist/cli.js ./document.md --stage customer --pages ./document-pages
```

This produces:

```text
document.customer.html
document.customer.pdf
document.customer.layout.json
document-pages/page-01.png ...
```

The command exits with code 2 and prints `LAYOUT CHECK FAILED` when the layout rules in
[`md-to-pdf/CONVENTIONS.md`](md-to-pdf/CONVENTIONS.md) are violated; fix the Markdown and render again.

Use explicit output paths when needed:

```bash
node md-to-pdf/dist/cli.js ./document.md --stage customer --output ./build/document.pdf --html-output ./build/document.html
```

## Review workflow

Generate a review release with a sanitized review appendix:

```bash
node md-to-pdf/dist/cli.js ./document.md --stage review --review-appendix ./review.md
```

After the source has been reviewed, generate the customer release with the exact source hash
printed by the review conversion:

```bash
node md-to-pdf/dist/cli.js ./document.md --stage customer --review-source-sha256 <reviewed-source-sha256>
```

The renderer can also write the PDF pages plus a review prompt for a vision model:

```bash
node md-to-pdf/dist/cli.js ./document.md --stage customer --ai-review ./ai-review
```

## Multilingual samples

The [samples directory](samples/) contains Korean, Simplified Chinese, Traditional Chinese,
and English sample reports. Each sample includes the Markdown source and the customer-stage HTML
and PDF rendered from that source:

- [Korean sample](samples/sample-report-ko.md)
- [Simplified Chinese sample](samples/sample-report-zh-hans.md)
- [Traditional Chinese sample](samples/sample-report-zh-hant.md)
- [English sample](samples/sample-report-en.md)

Render all four sources from the repository root:

```bash
for source in samples/*.md; do node md-to-pdf/dist/cli.js "$source" --stage customer; done
```

## Document metadata

Metadata can be supplied through YAML front matter or CLI flags. Supported front matter fields
include:

```yaml
---
title: Example report
subtitle: Markdown to PDF
version: "1.0"
date: "2026-08-07"
language: en
brand: Example
customer: Example Customer
project: Example Project
author: Example Author
chapter_break: none   # or page
participants:
  - name: Example Participant
    org: Example Customer
---
```

CLI flags override front matter values. See
[`md-to-pdf/CONVENTIONS.md`](md-to-pdf/CONVENTIONS.md) for the complete format.

## Agent skills

Install one git clone and point every agent at it (Codex and OpenCode read `~/.agents/skills`,
Claude Code reads `~/.claude/skills` — use a symlink). A single copy guarantees identical output
across agents, and the renderer warns when that copy has local modifications.

See [INSTALL.md](INSTALL.md) for the executable installation contract and verification procedure.

The repository includes the skill definition in [`SKILL.md`](SKILL.md) and the Agent interface
metadata in [`agents/openai.yaml`](agents/openai.yaml). Install the repository as a complete
skill directory so the Agent can access both the instructions and the bundled renderer.

The renderer source of truth is the Markdown document. Do not edit generated HTML or PDF files
directly; update the Markdown or stylesheet and render again.

## Development

Run the deterministic test suite from `md-to-pdf/`:

```bash
cd md-to-pdf
npm test
```

The Chromium PDF integration test can be enabled with:

```bash
RUN_PDF_INTEGRATION=1 npm test
```

## Repository layout

```text
SKILL.md                    Agent skill: workflow and final Layout QA checklist
INSTALL.md                  Agent and renderer installation guide
agents/openai.yaml          Agent interface metadata
md-to-pdf/CONVENTIONS.md    The single Markdown authoring rulebook
md-to-pdf/                  Renderer source, tests, and package metadata
samples/                    Multilingual sample sources and rendered output
images/                     Local diagram assets
```

## License

No license has been declared yet. Treat the repository as all-rights-reserved unless a license
file is added by the project owner.
