# md2pdf Markdown Conventions (canonical)

This is the single source of truth for how Markdown must be written so that `md-to-pdf` produces a
consistent, dense, customer-ready document. It applies to every agent (Codex, OpenCode, Claude
Code, …) and to humans. The renderer enforces most rules itself and fails the build
(`LAYOUT CHECK FAILED`, exit code 2) when a rule is broken, so the same input always produces the
same output on every machine.

Principles:

- **Markdown is the only thing you edit.** Never edit generated HTML/PDF, and never edit the
  renderer (`md-to-pdf/assets`, `md-to-pdf/src`) during a render task. The renderer prints
  `WARNING renderer-modified` when its files differ from git; that output is not reproducible.
- **One layout profile.** There is no density preset or per-document CSS. Layout differences are
  expressed only through the front matter options listed below.
- **Fonts never shrink.** Tables wrap cells, code gets real line breaks; text size is fixed.

---

## 1. Converting a raw draft

When the input is not already written for this renderer (meeting notes, exports, drafts), write a
new file `<basename>.convention.md` next to the source (never overwrite the original) and apply
sections 2–12. Preserve meaning; change only structure and syntax. Report what changed per rule.

Do not invent content, a manual TOC, a manual Priority Legend, or `<figure>` wrappers.

---

## 2. Front matter

```yaml
---
title: Customer A - Game Platform Optimization   # required, one line on the cover
subtitle: MongoDB Consulting Report
customer: Customer A                             # required
project: Game Platform DB Optimization
brand: MongoDB
version: "1.0"
date: "2026-07-14"                               # required (quote it)
language: ko                                     # required BCP 47: ko, en, ja, zh-Hans, zh-Hant
audience: customer
copyright_year: "2026"
chapter_break: none                              # none (default) | page
references: true                                 # default true; false keeps URLs inline only
author:
  name: Consultant A
  title: Consulting Engineer
  org: MongoDB
  email: consultant@example.com
participants:                                    # shown in exactly this order
  - name: Customer Contact A
    title: DB Team Lead
    org: Customer A
    email: customer-a@example.com
---
```

| Field | Required | Used for |
| --- | --- | --- |
| `title` | yes | Cover, `<title>`, footer. Plain text only — no `**`, backticks. |
| `customer` | yes | Cover "Prepared for", footer. Ask the user if unknown. |
| `date` | yes | Cover. Defaults to today. |
| `language` | yes | `<html lang>`, fonts, word breaking, references title. |
| `subtitle`, `project`, `version`, `brand` | recommended | Cover. `app` is a synonym of `project`. |
| `author`, `participants` | recommended | Cover participants block. `author` is appended if absent from the list. |
| `chapter_break` | no | `page` starts every H1 on a new page. Default `none` (dense flow). |
| `references` | no | `false` disables numbered link references. |
| `audience` | stage | `customer` for customer output; review appendices use `internal-review`. |

Research missing metadata (project documents, kickoff notes, Glean) instead of guessing. CLI flags
(`--title`, `--customer`, `--chapter-break`, …) override front matter.

---

## 3. Headings

- The document title lives in front matter only. Remove a duplicate top-level title from the body.
- Chapters are `#` (H1), sections `##`, subsections `###`. Number them manually:
  `# 1 Background`, `## 1.1 Application`, `### 1.1.1 Detail`.
- Use at most H1–H3 (the TOC collects H1–H3). Turn deeper levels into bold lead-ins, lists, or tables.
- Do not write a manual TOC; the renderer builds one with PDF page numbers.
- A heading must be followed by content. Never end a section with a heading.
- Chapters flow continuously by default. Use `chapter_break: page` only when the customer
  explicitly wants one chapter per page.

---

## 4. Emphasis (bold / italic)

The parser is CJK-aware, so `**중요(필수)**입니다`, `**100%**를`, `**注意（重要）**的` all render
bold. Still follow these rules; the renderer reports `residual-markdown-marker` as an **error** if a
literal `**`, `__`, or `~~` reaches the output:

- Use `**bold**` and `*italic*`. Do not use `__bold__` or `_italic_` (they do not work inside
  words, e.g. `__밑줄__도`).
- No spaces just inside the markers: `**bold**`, not `** bold **`.
- Latin text: a closing `**` that follows punctuation needs a space or punctuation after it:
  `x **(bold)** y`, not `x **(bold)**y`.
- Markdown is not parsed inside block-level raw HTML (`<div>…</div>`, `<table>…</table>`). Use
  `<strong>` there, or avoid raw HTML.
- Italic in Korean/Chinese/Japanese is rendered as an underline (CJK fonts have no italic).
- Do not use bold for whole paragraphs; use an admonition instead.

---

## 5. Tables

Standard GFM pipe tables with a header row. The renderer fits every table without shrinking text:

1. If the table fits with every cell on one line, nothing wraps.
2. Otherwise prose columns (cells with spaces) wrap, longest first; identifiers, numbers and short
   values stay on one line.
3. Then long unbreakable strings (URIs, long identifiers) break, longest first.
4. A table that still does not fit fails with `table-overflow`.

Authoring rules:

- Keep tables to about 6 columns. Split wide tables or move long explanations into prose below.
- Keep cells short; one idea per cell. Avoid `<br>` in cells.
- Right-align numeric columns: `| --- | ---: |`.
- Put identifiers, parameters and values in `` `code` `` — they stay on one line when possible.
- Tables with ≤ 12 body rows stay on one page; longer tables continue on the next page with the
  header repeated (rows never split).

---

## 6. Code blocks

- Always fence with a language: ` ```bash `, ` ```javascript `, ` ```json `, ` ```python `,
  ` ```yaml `, ` ```sql `, or ` ```text `. Indented code blocks are not allowed.
- Add a file/purpose tab when useful: ` ```javascript title="create-index.js" `
  (`filename=` and `file=` also work).
- The code font is fixed (9pt, no ligatures). Lines longer than the page (≈ 89 columns; ≈ 86
  inside a list or admonition) receive **real newlines** chosen per language:
  - bash/sh/zsh/Dockerfile: `␠\` at an argument boundary; a bare `\` mid-token for a single token
    that is longer than the line (bash removes backslash-newline, so pasted commands still run);
  - PowerShell: `␠` + backtick;
  - Python: implicit continuation inside brackets, `␠\` outside;
  - JavaScript/TypeScript/JSON/Java/Go/C#/CSS…: after `,` `(` `[` `{` or a binary operator, and
    before `.method(` chains in JS/TS;
  - SQL/text/YAML: at whitespace.
- A forced break that may change meaning (inside a string literal, YAML scalar, single-quoted shell
  string) is reported as `code-wrap-unsafe`. Fix it in the source: shorten the line, split the
  string, or break the command yourself.
- Prefer writing long shell commands with your own `\` continuations — you choose the break points.
- Blocks of ≤ 20 lines stay on one page; longer blocks may continue on the next page.

---

## 7. Admonitions and Q&A

```markdown
> [!NOTE]
> Background information.

> [!TIP] / [!WARNING] / [!CAUTION] / [!IMPORTANT]
```

- Use admonitions for notes, risks and must-read items; keep them short (they never split across pages).
- Plain `>` quotes are only for genuine quotations.
- Q&A pairs are paragraphs starting with `**Question:**` / `**Answer:**` (`:` or `：`).

---

## 8. Recommendations and Priority badges

- Append `[Priority: 1]`, `[Priority: 2]` or `[Priority: 3]` to a recommendation heading:
  `## 4.1 Create a compound index [Priority: 1]`.
- A heading named `Recommendations` / `N Recommendations` / `권장 사항` / `권고 사항` / `推荐` /
  `建议` / `建議` (H1 or H2) gets the Priority Legend inserted directly **below** it. Never write a
  legend by hand.

---

## 9. Images and figures

- `![alt text](./images/diagram.svg)` with a **local** path only; remote URLs are rejected. Download
  remote images into `images/` next to the document. If that is impossible, draw a placeholder SVG
  and tell the user it must be replaced.
- Formats: png, jpg/jpeg, gif, svg, webp, avif, apng.
- Caption: an italic line directly below the image, `*Figure 1: Read path*`. It is centered and
  kept with the image.
- Images are limited to the page width and 125 mm height. Text inside diagrams must stay ≥ 7pt after
  scaling (`tiny-font` warning otherwise) — design SVGs at roughly the printed width (~170 mm).

---

## 10. Links

- Write inline links `[MongoDB indexes](https://www.mongodb.com/docs/manual/indexes/)`.
- External links get a superscript number `[1]` and are listed under a final **References**
  section (localized: 참고 링크 / 参考链接 / 參考連結), so the body stays compact and printed copies
  keep the address. Bare URLs (`<https://…>`) are shown as-is and not numbered.
- Do not write the URL twice.

---

## 11. Lists, task lists, page breaks

- Use `-` for bullets, `1.` for ordered lists; keep nesting ≤ 3 levels.
- Task lists: `- [ ]` / `- [x]`.
- `<div class="page-break"></div>` only before a real appendix. Never put it next to a heading in
  `chapter_break: page` mode (that produces an empty page).

---

## 12. Characters and fonts

All text is drawn with bundled fonts (Pretendard, Noto Sans SC/TC, JetBrains Mono — SIL OFL 1.1).
Any glyph that falls back to a system font fails with `fallback-font`, because it would look different
on another machine.

- Do not use emoji (🚀 ✅ ❌ …) or dingbats (✔ ✗ ►).
- Common symbols are fine: → ← ↑ ↓ ⇒ • ※ ① ✓ ★ ☆ ⚠ ▶ ◆ ■ □ ○ ● … – — · © ® ™ ± × ÷ ≤ ≥ ≠ ∞ ° ℃.

---

## 13. Review / customer release

```bash
node md-to-pdf/dist/cli.js doc.md --stage review --review-appendix review.md
node md-to-pdf/dist/cli.js doc.md --stage customer --review-source-sha256 <sha256-from-review>
```

- Review output requires an appendix (`audience: internal-review`) and is marked FOR REVIEW.
- Customer output after review requires the exact source SHA-256; a changed source is rejected.

---

## 14. What the renderer does automatically

| Element | Behavior |
| --- | --- |
| Cover | Dark MongoDB cover; title auto-fits one line (28 → 16 pt) or fails. |
| TOC | H1–H3 with PDF page numbers. |
| Header / footer | CONFIDENTIAL badge, logo, customer, title, page x / y, © year MongoDB, Inc. |
| Page | A4, margins 20 / 15 / 15 / 15 mm (top / side / bottom / side). |
| Body | 10 pt, line height 1.5; Korean breaks between words, not syllables. |
| Keep together | Headings stay with the next block; tables ≤ 12 rows, code ≤ 20 lines, admonitions, Q&A, images. |
| HTML | Serialized from the same laid-out DOM as the PDF, self-contained (fonts and images inlined). |
| Layout report | `<output>.layout.json` with per-page fill and every issue. |

## 15. Layout check codes

| Code | Severity | Meaning / fix |
| --- | --- | --- |
| `residual-markdown-marker` | error | Literal `**`/`__`/`~~` in output. Fix per §4. |
| `fallback-font` | error | Glyph not in bundled fonts. Remove emoji/dingbats (§12). |
| `page-fill` | error < 50 %, warning < 70 % | Page ends early because the next block must stay together. Split/shorten the table or code, move the image, or reorder. |
| `orphan-heading` | error | Heading at the bottom of a page. Usually caused by a keep-together block after it; shorten or split that block. |
| `table-overflow` | error | Table too wide even fully wrapped. Reduce columns (§5). |
| `code-overflow` / `content-overflow` | error | Something wider than the text column. |
| `code-wrap-unsafe` | warning | Forced newline inside a literal (§6). |
| `tiny-font` | warning | Text < 7 pt, usually inside an image (§9). |
| `code-line-wrapped` | info | Lines received forced newlines; confirm the break points read well. |
