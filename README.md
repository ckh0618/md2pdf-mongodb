# md2pdf

`md2pdf` is a Codex and OpenCode Agent skill and command-line renderer that converts one Markdown source
document into a self-contained HTML file and a PDF generated from that same rendered document.

## Features

- Self-contained HTML and PDF output
- GitHub-Flavored Markdown support
- Syntax-highlighted code blocks
- Local image embedding
- Table of contents and document metadata from YAML front matter
- Customer and review output stages
- Playwright-based PDF generation

## Quick start

### One-line Agent installation

For Codex, send this one-line instruction to the Agent:

~~~text
$skill-installer Install the md2pdf skill from https://github.com/ckh0618/md2pdf-mongodb
~~~

For OpenCode, run this one-line shell command:

~~~bash
OPENCODE_SKILL="$HOME/.config/opencode/skills/md2pdf"; if [ -d "$OPENCODE_SKILL/.git" ]; then git -C "$OPENCODE_SKILL" pull --ff-only; else git clone https://github.com/ckh0618/md2pdf-mongodb.git "$OPENCODE_SKILL"; fi; cd "$OPENCODE_SKILL/md-to-pdf" && npm ci && npm run build && npx playwright install chromium
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
node md-to-pdf/dist/cli.js ./document.md --stage customer
```

This produces:

```text
document.customer.html
document.customer.pdf
```

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

The renderer also supports AI-assisted visual review artifacts:

```bash
node md-to-pdf/dist/cli.js ./document.md --stage customer --ai-review ./ai-review
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
participants:
  - Example Participant
---
```

CLI flags override front matter values. See
[`md-to-pdf/CONVENTIONS.md`](md-to-pdf/CONVENTIONS.md) for the complete format.

## Codex and OpenCode Agent skills

The installation guide supports both Codex and OpenCode. Codex uses the .agents/skills location,
while OpenCode uses .opencode/skills for project installations and
$HOME/.config/opencode/skills for global installations.

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
SKILL.md                    Codex Agent skill instructions
INSTALL.md                  Agent and renderer installation guide
agents/openai.yaml          Agent interface metadata
md-to-pdf/                  Renderer source, tests, and package metadata
images/                     Local diagram assets
```

## License

No license has been declared yet. Treat the repository as all-rights-reserved unless a license
file is added by the project owner.
