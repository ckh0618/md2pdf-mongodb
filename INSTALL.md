# md2pdf Agent Installation Contract

This document is an executable installation procedure for Agents. When an Agent is asked to
install md2pdf, it must read this file, choose the requested installation scope, run the
canonical installer, verify the result, and report the installed targets.

The repository works with Codex, OpenCode, and Claude Code. Install the complete repository as a
**git clone** — the Agent needs SKILL.md, the renderer, and CONVENTIONS.md, and a clone lets the
renderer detect local modifications (`WARNING renderer-modified`). Install **one** clone and link
every Agent to it so all Agents render with exactly the same code, stylesheet, and fonts.

## Agent execution rules

1. Preserve the source Markdown and all files outside the exact md2pdf skill target.
2. Install only into a target whose final directory name is md2pdf.
3. Never delete or overwrite an existing md2pdf directory that is not a clean clone of this
   repository. Move it aside (for example to `md2pdf.bak-<date>`) and report it.
4. If the clone has uncommitted changes, do not run git pull; report the condition first.
5. Run the verification commands before reporting success.
6. If a required command fails, stop and report the failed command and its output.

## Requirements

- Git
- Node.js 20 or later
- npm
- A POSIX shell such as Bash, Zsh, or WSL
- Chromium installation support for Playwright

~~~bash
node --version
npm --version
git --version
~~~

## 1. Targets

| Agent | Global skill path | Project skill path |
| --- | --- | --- |
| Codex | $HOME/.agents/skills/md2pdf | $PROJECT_ROOT/.agents/skills/md2pdf |
| OpenCode | $HOME/.agents/skills/md2pdf (also reads $HOME/.config/opencode/skills) | $PROJECT_ROOT/.agents/skills/md2pdf |
| Claude Code | $HOME/.claude/skills/md2pdf | $PROJECT_ROOT/.claude/skills/md2pdf |

The canonical clone is `$HOME/.agents/skills/md2pdf` (global) or
`$PROJECT_ROOT/.agents/skills/md2pdf` (project). The Claude Code path is a symlink to it.

## 2. Canonical installer

~~~bash
#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ckh0618/md2pdf-mongodb.git}"
INSTALL_SCOPE="${INSTALL_SCOPE:-global}"
LINK_CLAUDE="${LINK_CLAUDE:-1}"

case "$INSTALL_SCOPE" in
  global)  BASE="$HOME" ;;
  project) BASE="${PROJECT_ROOT:-$(git rev-parse --show-toplevel)}" ;;
  *) echo "ERROR: INSTALL_SCOPE must be global or project" >&2; exit 1 ;;
esac
TARGET="$BASE/.agents/skills/md2pdf"

if [ -d "$TARGET/.git" ]; then
  if [ -n "$(git -C "$TARGET" status --porcelain)" ]; then
    echo "ERROR: $TARGET has local changes; resolve them before updating" >&2
    exit 1
  fi
  git -C "$TARGET" pull --ff-only
elif [ -e "$TARGET" ]; then
  BACKUP="$TARGET.bak-$(date +%Y%m%d%H%M%S)"
  mv "$TARGET" "$BACKUP"
  echo "Moved non-git copy aside: $BACKUP"
  git clone "$REPO_URL" "$TARGET"
else
  mkdir -p "$(dirname "$TARGET")"
  git clone "$REPO_URL" "$TARGET"
fi

(
  cd "$TARGET/md-to-pdf"
  npm ci
  npm run build
  npx playwright install chromium
  node dist/cli.js --help >/dev/null
)

if [ "$LINK_CLAUDE" = "1" ]; then
  CLAUDE_LINK="$BASE/.claude/skills/md2pdf"
  mkdir -p "$(dirname "$CLAUDE_LINK")"
  if [ -L "$CLAUDE_LINK" ] || [ ! -e "$CLAUDE_LINK" ]; then
    ln -sfn "$TARGET" "$CLAUDE_LINK"
  else
    echo "WARNING: $CLAUDE_LINK exists and is not a symlink; left untouched" >&2
  fi
fi

echo "Installed md2pdf at $TARGET ($(git -C "$TARGET" rev-parse --short HEAD))"
~~~

The installer is repeatable: it fast-forwards a clean clone, reinstalls locked dependencies
(including the bundled fonts), and rebuilds the renderer.

## 3. Verify the installation

~~~bash
test -f "$TARGET/SKILL.md"
test -f "$TARGET/md-to-pdf/dist/cli.js"
git -C "$TARGET" status --porcelain          # must print nothing
node "$TARGET/md-to-pdf/dist/cli.js" --help
~~~

## 4. Expected layout

~~~text
<skill-target>/
├── SKILL.md
├── INSTALL.md
├── agents/openai.yaml
└── md-to-pdf/
    ├── CONVENTIONS.md
    ├── package.json
    ├── assets/styles.css
    ├── src/
    └── dist/cli.js
~~~

## 5. Activate the skill

### Codex

Restart Codex or refresh its skill list. For a project installation, launch Codex from the
project directory or one of its subdirectories. Confirm that the available skill is named
md2pdf.

### Claude Code

Restart Claude Code. The skill is discovered through the `~/.claude/skills/md2pdf` symlink.

### OpenCode

Restart OpenCode or reload the session. OpenCode should list md2pdf in its native skill tool.
The Agent can load it with:

~~~text
skill({ name: "md2pdf" })
~~~

If OpenCode does not list the skill, confirm that SKILL.md is located at
$HOME/.agents/skills/md2pdf/SKILL.md (or the project equivalent).

## 6. Use the installed renderer

After activation, run the renderer from the installed skill directory:

~~~bash
node <skill-target>/md-to-pdf/dist/cli.js /absolute/path/document.md --stage customer --pages /absolute/path/document-pages
~~~

The default outputs are:

~~~text
document.customer.html
document.customer.pdf
document.customer.layout.json
~~~

For a review release:

~~~bash
node <skill-target>/md-to-pdf/dist/cli.js \
  /absolute/path/document.md \
  --stage review \
  --review-appendix /absolute/path/review.md
~~~

Markdown is always the source of truth. Never edit generated HTML or PDF files directly.

## Updating an existing installation

Run the canonical installer again with the same INSTALL_SCOPE. It refuses to update a clone with
local changes — layout must be fixed in Markdown, never by editing the installed renderer.
node_modules and dist are generated inside the clone and are git-ignored.

## References

- [Codex: Build skills](https://developers.openai.com/codex/build-skills)
- [OpenCode: Agent Skills](https://opencode.ai/docs/skills/)
- [Renderer conventions](md-to-pdf/CONVENTIONS.md)
- [Renderer CLI README](md-to-pdf/README.md)
