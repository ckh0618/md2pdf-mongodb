# md2pdf Agent 설치 안내

이 저장소는 Markdown을 self-contained HTML과 PDF로 변환하는 Agent 스킬입니다. Agent가 스킬로
사용하려면 저장소 전체를 Agent의 스킬 디렉터리에 설치해야 합니다. `SKILL.md`만 복사하면
렌더러 소스와 문서가 없어 동작하지 않습니다.

## 사전 요구 사항

- Git
- Node.js 20 이상
- npm
- Playwright Chromium을 설치할 수 있는 환경

Node.js 버전은 다음 명령으로 확인합니다.

```bash
node --version
```

## 1. 저장소 받기

```bash
git clone https://github.com/ckh0618/md2pdf-mongodb.git
cd md2pdf-mongodb
```

이미 clone한 경우에는 최신 커밋을 받은 뒤 설치합니다.

```bash
git pull --ff-only
```

## 2. Agent 스킬로 설치하기

Agent 호스트가 사용하는 스킬 루트를 먼저 확인합니다. 일반적인 Codex 환경에서는
`$CODEX_HOME/skills` 또는 `$HOME/.agents/skills`를 사용합니다. 호스트 설정에 지정된 경로가
있다면 그 경로를 우선합니다.

아래 예시는 스킬 루트를 `$HOME/.agents/skills`로 사용하는 Agent를 위한 명령입니다.

```bash
AGENT_SKILLS_ROOT="$HOME/.agents/skills"
SKILL_TARGET="$AGENT_SKILLS_ROOT/md2pdf"
mkdir -p "$SKILL_TARGET"
rsync -a --exclude '.git' --exclude 'md-to-pdf/node_modules' --exclude 'md-to-pdf/dist' ./ "$SKILL_TARGET/"
```

`$CODEX_HOME/skills`를 사용하는 Agent라면 `AGENT_SKILLS_ROOT`를
`$CODEX_HOME/skills`로 바꿉니다. 설치가 끝난 뒤 다음 파일이 있어야 합니다.

```text
<Agent 스킬 루트>/md2pdf/SKILL.md
<Agent 스킬 루트>/md2pdf/md-to-pdf/package.json
<Agent 스킬 루트>/md2pdf/md-to-pdf/src/cli.ts
```

Agent가 새 스킬을 검색하지 못하면 Agent를 다시 시작하거나 스킬 목록을 새로 고칩니다.

## 3. 렌더러 설치 및 빌드

스킬 디렉터리 안의 `md-to-pdf`에서 의존성을 설치하고 렌더러를 빌드합니다.

```bash
AGENT_SKILLS_ROOT="${AGENT_SKILLS_ROOT:-$HOME/.agents/skills}"
SKILL_TARGET="${SKILL_TARGET:-$AGENT_SKILLS_ROOT/md2pdf}"
cd "$SKILL_TARGET/md-to-pdf"
npm ci
npm run build
npx playwright install chromium
```

Linux에서 Chromium 시스템 의존성이 없는 경우에는 다음 명령을 사용할 수 있습니다.

```bash
npx playwright install --with-deps chromium
```

설치가 정상인지 확인합니다.

```bash
node dist/cli.js --help
```

## 사용 방법

Agent는 Markdown 원본을 보존한 상태에서 다음처럼 실행합니다.

```bash
AGENT_SKILLS_ROOT="${AGENT_SKILLS_ROOT:-$HOME/.agents/skills}"
SKILL_TARGET="${SKILL_TARGET:-$AGENT_SKILLS_ROOT/md2pdf}"
node "$SKILL_TARGET/md-to-pdf/dist/cli.js" /absolute/path/document.md --stage customer
```

기본적으로 입력 파일 옆에 다음 두 파일이 생성됩니다.

```text
document.customer.html
document.customer.pdf
```

검토용 산출물은 검토 부록과 함께 생성합니다.

```bash
AGENT_SKILLS_ROOT="${AGENT_SKILLS_ROOT:-$HOME/.agents/skills}"
SKILL_TARGET="${SKILL_TARGET:-$AGENT_SKILLS_ROOT/md2pdf}"
node "$SKILL_TARGET/md-to-pdf/dist/cli.js" \
  /absolute/path/document.md \
  --stage review \
  --review-appendix /absolute/path/review.md
```

자세한 Markdown 규칙과 메타데이터는 다음 문서를 참조합니다.

- [`SKILL.md`](SKILL.md): Agent 작업 절차와 명령
- [`md-to-pdf/CONVENTIONS.md`](md-to-pdf/CONVENTIONS.md): Markdown 및 front matter 규칙
- [`md-to-pdf/AUTHORING_PROMPT.md`](md-to-pdf/AUTHORING_PROMPT.md): 원시 Markdown 정리 규칙
- [`md-to-pdf/README.md`](md-to-pdf/README.md): 렌더러 CLI 사용법

## 업데이트

원본 clone에서 최신 커밋을 받은 뒤 다시 복사하고, 의존성과 빌드를 갱신합니다.

```bash
AGENT_SKILLS_ROOT="${AGENT_SKILLS_ROOT:-$HOME/.agents/skills}"
SKILL_TARGET="${SKILL_TARGET:-$AGENT_SKILLS_ROOT/md2pdf}"
cd /path/to/md2pdf-mongodb
git pull --ff-only
rsync -a --exclude '.git' --exclude 'md-to-pdf/node_modules' --exclude 'md-to-pdf/dist' ./ "$SKILL_TARGET/"
cd "$SKILL_TARGET/md-to-pdf"
npm ci
npm run build
npx playwright install chromium
```

`node_modules`와 `dist`는 설치 시 생성되는 파일이므로 저장소에 커밋하지 않습니다.
