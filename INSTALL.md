# md2pdf Agent Installation Contract

This document is an executable installation procedure for Agents. When an Agent is asked to
install md2pdf, it must read this file, choose the requested installation scope, run the
canonical installer, verify the result, and report the installed targets.

The repository is compatible with both Codex and OpenCode. Install the complete repository
directory because the Agent needs SKILL.md, the renderer source, and the renderer documentation.
Do not install only SKILL.md.

## Agent execution rules

1. Preserve the source Markdown and all files outside the exact md2pdf skill target.
2. Install only into a target whose final directory name is md2pdf.
3. Do not use rsync --delete, recursive deletion, or a broad directory as the target.
4. If the source clone has uncommitted changes, do not run git pull; report the condition first.
5. Run the verification commands before reporting success.
6. If a required command fails, stop and report the failed command and its output.

## Requirements

- Git
- Node.js 20 or later
- npm
- rsync
- A POSIX shell such as Bash, Zsh, or WSL
- Chromium installation support for Playwright

Check the runtime before installation:

~~~bash
node --version
npm --version
git --version
rsync --version
~~~

## 1. Obtain the source repository

The source directory must contain both SKILL.md and md-to-pdf/package.json.

For a new installation:

~~~bash
git clone https://github.com/ckh0618/md2pdf-mongodb.git
cd md2pdf-mongodb
~~~

For an existing clean clone:

~~~bash
git status --short
git pull --ff-only
~~~

Do not run git pull when git status --short reports changes. Use the existing source as-is or
ask the user how to handle the changes.

## 2. Select the installation scope

Set INSTALL_SCOPE=global to install for the current user, or INSTALL_SCOPE=project to install
inside the current project.

| Agent | Global target | Project target |
| --- | --- | --- |
| Codex | $HOME/.agents/skills/md2pdf | $PROJECT_ROOT/.agents/skills/md2pdf |
| OpenCode | $HOME/.config/opencode/skills/md2pdf | $PROJECT_ROOT/.opencode/skills/md2pdf |

Codex also discovers project skills under .agents/skills. OpenCode also supports the
Agent-compatible .agents/skills and Claude-compatible .claude/skills locations, but the
OpenCode-specific targets above are preferred for explicit installation.

## 3. Canonical installer

Run this Bash block from the source repository root. It installs both Codex and OpenCode skills by
default. Set INSTALL_CODEX=0 or INSTALL_OPENCODE=0 to install only one.

~~~bash
#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="\${SOURCE_DIR:-$(pwd)}"
INSTALL_SCOPE="\${INSTALL_SCOPE:-global}"
INSTALL_CODEX="\${INSTALL_CODEX:-1}"
INSTALL_OPENCODE="\${INSTALL_OPENCODE:-1}"

if [ ! -f "$SOURCE_DIR/SKILL.md" ] || [ ! -f "$SOURCE_DIR/md-to-pdf/package.json" ]; then
  echo "ERROR: SOURCE_DIR must be the md2pdf repository root: $SOURCE_DIR" >&2
  exit 1
fi

command -v rsync >/dev/null 2>&1 || {
  echo "ERROR: rsync is required" >&2
  exit 1
}

case "$INSTALL_SCOPE" in
  global)
    CODEX_TARGET="\${CODEX_TARGET:-$HOME/.agents/skills/md2pdf}"
    OPENCODE_TARGET="\${OPENCODE_TARGET:-$HOME/.config/opencode/skills/md2pdf}"
    ;;
  project)
    PROJECT_ROOT="\${PROJECT_ROOT:-$(git -C "$SOURCE_DIR" rev-parse --show-toplevel)}"
    CODEX_TARGET="\${CODEX_TARGET:-$PROJECT_ROOT/.agents/skills/md2pdf}"
    OPENCODE_TARGET="\${OPENCODE_TARGET:-$PROJECT_ROOT/.opencode/skills/md2pdf}"
    ;;
  *)
    echo "ERROR: INSTALL_SCOPE must be global or project" >&2
    exit 1
    ;;
esac

install_one() {
  local target="$1"
  local label="$2"

  case "$target" in
    */md2pdf) ;;
    *)
      echo "ERROR: refusing target that does not end in /md2pdf: $target" >&2
      exit 1
      ;;
  esac

  mkdir -p "$target"
  rsync -a \
    --exclude '.git' \
    --exclude '.agents' \
    --exclude '.claude' \
    --exclude '.opencode' \
    --exclude '.playwright-mcp' \
    --exclude 'md-to-pdf/node_modules' \
    --exclude 'md-to-pdf/dist' \
    "$SOURCE_DIR/" "$target/"

  test -f "$target/SKILL.md"
  test -f "$target/md-to-pdf/package.json"
  test -f "$target/md-to-pdf/src/cli.ts"

  (
    cd "$target/md-to-pdf"
    npm ci
    npm run build
    npx playwright install chromium
    node dist/cli.js --help >/dev/null
  )

  echo "Installed $label skill at $target"
}

if [ "$INSTALL_CODEX" = "1" ]; then
  install_one "$CODEX_TARGET" "Codex"
fi

if [ "$INSTALL_OPENCODE" = "1" ]; then
  install_one "$OPENCODE_TARGET" "OpenCode"
fi
~~~

The installer is repeatable. Running it again updates the same skill files, reinstalls locked npm
dependencies, rebuilds the renderer, and leaves unrelated skills untouched.

## 4. Verify the installation

For every target printed by the installer, verify:

~~~bash
test -f <skill-target>/SKILL.md
test -f <skill-target>/md-to-pdf/package.json
test -f <skill-target>/md-to-pdf/dist/cli.js
node <skill-target>/md-to-pdf/dist/cli.js --help
~~~

The final command must print the md-to-pdf usage text and exit successfully.

Expected skill layout:

~~~text
<skill-target>/
├── SKILL.md
├── INSTALL.md
├── md-to-pdf/
│   ├── package.json
│   ├── src/
│   └── dist/cli.js
└── agents/openai.yaml
~~~

## 5. Activate the skill

### Codex

Restart Codex or refresh its skill list. For a project installation, launch Codex from the
project directory or one of its subdirectories. Confirm that the available skill is named
md2pdf.

### OpenCode

Restart OpenCode or reload the session. OpenCode should list md2pdf in its native skill tool.
The Agent can load it with:

~~~text
skill({ name: "md2pdf" })
~~~

If OpenCode does not list the skill, confirm that SKILL.md is located at exactly
<project>/.opencode/skills/md2pdf/SKILL.md or
$HOME/.config/opencode/skills/md2pdf/SKILL.md.

## 6. Use the installed renderer

After activation, run the renderer from the installed skill directory:

~~~bash
node <skill-target>/md-to-pdf/dist/cli.js /absolute/path/document.md --stage customer
~~~

The default outputs are:

~~~text
document.customer.html
document.customer.pdf
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

1. Check the source clone with git status --short.
2. If it is clean, run git pull --ff-only.
3. Run the canonical installer again with the same INSTALL_SCOPE and target variables.
4. Repeat the verification and activation steps.

Do not remove old target files automatically. node_modules and dist are generated inside the
skill target and should not be committed to the source repository.

## References

- [Codex: Build skills](https://developers.openai.com/codex/build-skills)
- [OpenCode: Agent Skills](https://opencode.ai/docs/skills/)
- [Renderer conventions](md-to-pdf/CONVENTIONS.md)
- [Renderer CLI README](md-to-pdf/README.md)
