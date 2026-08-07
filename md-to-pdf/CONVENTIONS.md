# Markdown → HTML/PDF 매핑 규약 (CONVENTIONS)

이 문서는 `md-to-pdf` 렌더러가 Markdown 입력을 HTML/PDF로 변환할 때 인식하는
모든 매핑 규약을 정의한다. 작성자는 이 규약에 맞춰 Markdown을 작성하면 된다.

---

## 0. 표준 vs 비표준 문법 요약

아래 규약 중 일부는 CommonMark/GFM(GitHub Flavored Markdown) **표준 문법**이고, 일부는
**이 렌더러(`md-to-pdf`)만 해석하는 비표준/커스텀 문법**이다. 비표준 문법은 GitHub,
VS Code 미리보기, Notion 등 다른 Markdown 뷰어에서 열면 의도한 대로 표시되지 않고
그냥 평문(plain text)이나 일반 blockquote/코드블록으로 보인다. 다른 곳에도 공유할
Markdown이라면 이 차이를 알고 있어야 한다.

| # | 규약 | 표준 여부 | 비고 |
| - | --- | --- | --- |
| 1 | YAML Front Matter | 비표준 | CommonMark 자체엔 없음. Jekyll/Hugo류 정적 사이트 생성기 관행을 차용했으나, 여기서 쓰는 필드(`customer`, `participants` 등)는 이 렌더러 전용 |
| 2 | 헤딩(`#`, `##`)과 수동 번호 | 표준 | 헤딩 문법 자체는 CommonMark. 번호를 텍스트에 직접 쓰는 것도 그냥 텍스트라 표준 |
| 3 | `[Priority: N]` 배지 | **비표준** | 이 렌더러가 헤딩 텍스트 끝의 이 패턴을 감지해 배지로 치환. 다른 뷰어에서는 `[Priority: 1]`이라는 글자 그대로 보임 |
| 4 | Priority Legend 자동 삽입 | **비표준** | `## Recommendations` 같은 특정 헤딩 텍스트를 매직 스트링으로 감지. 다른 뷰어에서는 아무 일도 일어나지 않음(Legend 없음) |
| 5 | `> [!NOTE]` 등 Admonition | 준표준 | GitHub가 2023년부터 README 등에서 지원하는 "Alerts" 문법이라 GitHub.com에서는 유사하게 렌더링되지만 CommonMark/원래 GFM 스펙엔 없음. 다른 뷰어(VS Code 기본 미리보기 등)에서는 그냥 blockquote 안에 `[!NOTE]`라는 글자가 보임 |
| 6 | `**Question:**` / `**Answer:**` Q&A | **비표준** | 볼드 텍스트 자체는 표준이지만, 이 특정 키워드로 시작하는 문단을 Q/A 박스로 바꾸는 것은 이 렌더러만의 동작. 다른 곳에서는 그냥 볼드 텍스트로 보임 |
| 7 | 코드블록 ` ```lang title="..." ` 속성 | **비표준** | 언어 식별자는 CommonMark 표준이지만 `title=`/`filename=`/`file=` 속성은 스펙 밖. 다른 뷰어에서는 이 속성이 무시되거나 언어 인식이 깨질 수 있음 |
| 8 | GFM 테이블 | 표준 | 순수 GFM |
| 9 | GFM Task List (`- [ ]`) | 표준 | 순수 GFM |
| 10 | 이미지 `![]()`  | 표준 문법 / **비표준 제약** | 문법 자체는 표준이나, "원격 URL 금지, 로컬 파일만 허용"이라는 제약은 이 렌더러 전용. 순수 Markdown에서는 원격 이미지가 오히려 일반적 |
| 11 | `<div class="page-break"></div>` | 표준 문법 / **비표준 의미** | Markdown 안에 raw HTML을 쓰는 것 자체는 CommonMark 표준이지만, `page-break` 클래스가 실제 페이지 나누기로 작동하는 것은 이 스타일시트(`styles.css`)에 종속 |
| 12 | TOC 자동 생성 | 비표준 동작 | 특별한 문법이 필요하지는 않지만(그냥 h1–h3를 쓰면 됨), TOC를 자동으로 만들어주는 것 자체가 이 렌더러의 기능 |
| 13 | 하이퍼링크 `[text](url)` | 표준 | 순수 CommonMark |

**요약**: 헤딩, 표, 체크리스트, 링크, 이미지 문법, raw HTML 자체는 표준이다. 반면
**Priority 배지, Priority Legend, Q&A 패턴, 코드블록 title 속성, "로컬 이미지만 허용"
제약**은 이 렌더러 밖에서는 의미가 없는 비표준 확장이므로, 문서를 이 렌더러 **이외의
용도**(예: GitHub 저장소 README, Notion 붙여넣기)로도 재사용할 계획이면 이 표를 참고해
어떤 부분이 깨질 수 있는지 미리 확인해야 한다.

---

## 1. Front Matter (YAML 메타데이터) — 비표준

문서 최상단에 YAML front matter를 작성한다. 모든 표지 정보와 메타데이터는
여기서 제공한다.

```yaml
---
title: 고객사 A - 게임 인프라 최적화
subtitle: MongoDB Consulting Report
customer: 고객사 A
project: 게임 플랫폼 DB 최적화
brand: MongoDB
version: "1.0"
date: "2026-07-14 ~ 2026-07-29"
language: ko
audience: customer
copyright_year: "2026"
author:
  name: 컨설턴트 A
  title: Consulting Engineer
  org: MongoDB
  email: consultant@example.com
participants:
  - name: 고객 담당자 A
    title: DB팀 책임
    org: 고객사 A
    email: customer-a@example.com
  - name: 컨설턴트 A
    title: Consulting Engineer
    org: MongoDB
    email: consultant@example.com
---
```

### 필드 상세

| 필드              | 필수 | 매핑 위치                    | 비고                                  |
| ----------------- | ---- | ---------------------------- | ------------------------------------- |
| `title`           | ✓    | 표지 제목, `<title>`, 푸터   |                                       |
| `subtitle`        | 권장 | 표지 부제                    | Consulting Report면 "MongoDB Consulting Report" |
| `customer`        | ✓    | 표지 "Prepared for", 푸터    |                                       |
| `project`         | 권장 | 표지 "Project" 블록          | `app`도 동의어로 인식                 |
| `brand`           | 자동 | 표지 브랜드명                | 생략시 "Markdown Document"            |
| `version`         | 권장 | 표지 메타 "Version:"         |                                       |
| `date`            | ✓    | 표지 메타 "Date:"            | 생략시 오늘 날짜                      |
| `language`        | ✓    | `<html lang>`                | BCP 47 태그 (`ko`, `en`, `ja`)        |
| `author`          | 권장 | 표지 "Author:" 라인          | 객체: `{name, title, org, email}`     |
| `participants`    | 권장 | 표지 Participants 블록      | 배열: `[{name, title, org, email}]`. 표시 순서는 이 배열에 **작성한 순서 그대로** 반영된다 (예: 고객 참석자를 먼저, MongoDB 참석자를 뒤에 적으면 그 순서대로 표시). `author`와 이름이 같은 항목이 배열에 이미 있으면 중복 표시되지 않는다. `author`가 배열에 없으면 맨 뒤에 자동으로 추가된다. |
| `audience`        | 단계별 | 검증 로직                  | `customer` 단계: `customer`, `review` 단계: `internal-review` |
| `copyright_year`  | 자동 | 푸터 `© YYYY MongoDB, Inc.`  | 생략시 현재 연도                      |

### CLI 플래그로 덮어쓰기

모든 front matter 필드는 CLI 플래그로 덮어쓸 수 있다:

```bash
node dist/cli.js input.md --stage customer \
  --title "Override Title" --customer "Other Corp" --project "New App"
```

---

## 2. 헤딩 번호 — 표준

헤딩 번호는 **작성자가 수동으로 입력**한다. 자동 번호 부여가 아니다.

```markdown
# 1 Executive Summary
## 2.1 Application
## 4.1 인덱스 생성 [Priority: 1]
```

TOC는 h1–h3를 자동 수집하며, 헤딩 ID는 텍스트에서 슬러그화된다.

---

## 3. Priority 배지 (Recommendation 헤딩) — 비표준

헤딩 끝에 `[Priority: N]` (N = 1, 2, 3)을 붙이면 색상 배지로 변환된다.

```markdown
## 4.1 인덱스 생성 [Priority: 1]    → 빨간 배지 (즉시 구현)
## 4.2 백업 테스트 [Priority: 2]    → 주황 배지 (빠른 구현)
## 4.3 TTL 인덱스 [Priority: 3]     → 초록 배지 (고려)
```

- TOC에는 배지 텍스트가 제외된 깨끗한 제목만 표시된다.
- `[Priority: N]`은 헤딩 텍스트의 일부가 아니므로 슬러그에 영향을 주지 않는다.

---

## 4. Priority Legend (자동 삽입) — 비표준

`## Recommendations` 또는 `## N Recommendations` 패턴의 헤딩을 감지하면,
그 **앞에** Priority 1/2/3 정의 테이블과 "pre-production 테스트 권고" 경고문이
자동으로 삽입된다. 작성자가 직접 작성할 필요가 없다.

```markdown
# 4 Recommendations      ← 이 헤딩 앞에 Legend가 자동 삽입됨

## 4.1 첫 번째 권장 사항 [Priority: 1]
...
```

---

## 5. Admonition (강조 박스) — 준표준 (GitHub Alerts)

GitHub 스타일 blockquote 마커를 사용한다. 5종이 지원된다:

```markdown
> [!NOTE]
> 일반적인 참고 사항 (파란색)

> [!TIP]
> 유용한 팁 (초록색)

> [!WARNING]
> 주의 필요 (노란색)

> [!CAUTION]
> 위험 — 즉시 조치 필요 (빨간색)

> [!IMPORTANT]
> 중요 — 반드시 읽을 것 (보라색)
```

각 종류별로 고유한 색상과 아이콘이 렌더링된다.

---

## 6. Q&A 페어 — 비표준

`**Question:**` 또는 `**Answer:**` (콜론은 `:` 또는 `：` 모두 가능)로 시작하는
문단은 자동으로 Q/A 블록으로 변환된다.

```markdown
**Question:** 권장된 인덱스를 프로덕션에 바로 적용해도 되는가?

**Answer:** 아니오. 스테이징에서 먼저 검증하라.
```

- Question: 파란색 좌측 보더 + "Q" 원형 라벨
- Answer: 회색 좌측 보더 + "A" 원형 라벨

---

## 7. 코드 블록 with 제목 — 비표준 (title 속성)

펜스드 코드 블록의 info string에 `title=`, `filename=`, 또는 `file=` 속성을
넣으면 파일명 탭이 코드 블록 상단에 표시된다.

````markdown
```javascript title="create-index.js"
db.user_inventory.createIndex({ user_id: 1, item_id: 1 });
```
````

````markdown
```bash filename="verify.sh"
db.user_inventory.getIndexes()
```
````

구문 강조는 Shiki (`github-light` 테마)로 처리된다. 지원 언어:
`javascript`, `typescript`, `python`, `bash`, `shell`, `json`, `yaml`,
`sql`, `html`, `css`, `markdown` 등 (알려지지 않은 언어는 `text`로 폴백).

언어 별칭: `js` → `javascript`, `ts` → `typescript`, `py` → `python`,
`sh`/`shell`/`console` → `bash`, `yml` → `yaml`, `txt`/`plaintext` → `text`,
`md` → `markdown`.

---

## 8. 표 (GFM 테이블) — 표준

표준 GFM 파이프 테이블을 지원한다.

```markdown
| 지표    | 현재    | 목표    |
| ------- | ------- | ------- |
| p99     | 3200ms  | <500ms  |
| CPU     | 92%     | <70%    |
```

- 헤더행: 회색 배경 (`--color-table-header`)
- 짝수행: 스트라이프 (`--color-table-stripe`)
- 페이지 break 시 헤더 자동 반복
- 행 단위 페이지 break 방지

---

## 9. 체크리스트 (GFM Task List) — 표준

GFM task list 문법을 지원한다.

```markdown
- [ ] 인덱스 검증 (1주일 내)
- [ ] 샤드 키 리파인 스크립트 테스트
- [x] 완료된 항목
```

- 미체크: 빈 체크박스 (회색 보더)
- 체크됨: 초록 배경 + 흰색 ✓
- PDF에서도 색상이 보존된다

---

## 10. 이미지 임베드 — 문법은 표준 / 로컬 전용 제약은 비표준

로컬 이미지 경로는 자동으로 base64 data URL로 변환되어 self-contained PDF에
포함된다. 원격 URL은 허용되지 않는다.

```markdown
![아키텍처 다이어그램](./images/architecture.png)
```

지원 포맷: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.avif`, `.apng`

이미지는 자동으로 둥근 모서리, 얇은 보더, 그림자가 적용된다.
`figcaption`은 Markdown에 명시적으로 `<figure>`를 쓰지 않는 한 자동 생성되지 않는다.

---

## 11. 페이지 브레이크 — raw HTML은 표준 / 의미는 비표준

명시적 페이지 나누기:

```markdown
<div class="page-break"></div>
```

---

## 12. 인덱스 (Table of Contents) — 비표준 동작 (자동 생성)

TOC는 h1–h3 헤딩을 자동으로 수집하여 생성된다. 작성자가 별도로 작성할 필요가 없다.

- 1단계 (h1): 본문 크기, 굵게
- 2단계 (h2): 들여쓰기, 약간 작게
- 3단계 (h3): 더 들여쓰기, 회색

점 리더(dotted leader)가 항목과 페이지 번호 사이에 표시된다.
(단, 페이지 번호는 HTML에서는 미표기, PDF에서만 Playwright가 삽입)

---

## 13. 하이퍼링크 — 표준

본문 내 링크는 인텍스트 하이퍼링크로 작성한다:

```markdown
[복합 인덱스](https://www.mongodb.com/docs/manual/core/index-compound/)
```

PDF 인쇄 시 외부 링크(`http://`, `https://`)는 링크 텍스트 뒤에 URL이
자동으로 표시된다. 내부 앵커(`#section`)와 표지/TOC 링크는 제외된다.

---

## 14. 2단계 릴리스 흐름 (Review / Customer)

### Review 단계

```bash
node dist/cli.js input.md --stage review --review-appendix review.md
```

- `--review-appendix` 필수: 검토 부록 Markdown
- 부록이 본문 뒤에 페이지 브레이크와 함께 추가됨
- 헤더/표지에 "FOR REVIEW" 표시
- 원본 소스 SHA-256 출력

### Customer 단계 (검토 후)

```bash
node dist/cli.js input.md --stage customer \
  --review-source-sha256 <review-stage에서-출력된-SHA-256>
```

- `--review-source-sha256` 전달 시, 현재 원본과 해시를 비교
- 해시가 다르면 (검토 후 원본이 변경됨) 에러로 차단
- 검토되지 않은 문서의 배포를 방지

### Audience 검증

| Stage     | Document front matter `audience` | Review appendix `audience` |
| --------- | -------------------------------- | -------------------------- |
| `review`  | (생략 가능)                      | `internal-review`          |
| `customer`| `customer`                       | (사용 안 함)               |

---

## 15. MongoDB 브랜드 요소

렌더러가 자동으로 적용하는 MongoDB 브랜드 요소:

| 요소                | 위치              | 소스                          |
| ------------------- | ----------------- | ----------------------------- |
| MongoDB 로고 (표지) | 표지 상단         | `assets/mongodb-logo-white.svg` (다크 배경용) |
| MongoDB 로고 (본문) | PDF 헤더 우측     | `assets/mongodb-logo-slate-blue.svg` (밝은 배경용) |
| CONFIDENTIAL 배지   | PDF 헤더 좌측     | `pdf.ts` 인라인               |
| © MongoDB, Inc.     | PDF 푸터 우측     | `copyright_year` 기반         |
| Spring Green 액센트 | 표지, 헤딩, 배지  | `assets/styles.css` 커스텀 프로퍼티 |
| Slate 배경          | 표지              | `#001E2B`                     |


작성자가 브랜드 요소를 직접 Markdown에 넣을 필요는 없다.

---

## 16. 컬러 팔레트 (참고용)

| 이름              | Hex       | 용도                       |
| ----------------- | --------- | -------------------------- |
| Slate             | `#001E2B` | 본문 텍스트, 표지 배경     |
| Spring Green      | `#00ED64` | 장식 액센트, 배지          |
| Forest Green      | `#00684A` | AA-safe 본문용 (h1 밑줄)   |
| Mist              | `#E3FCF7` | tip 배경                   |
| White             | `#FFFFFF` | 페이지 배경                |
| Clear Blue        | `#016BF8` | 링크, note                 |

---

## 17. 전체 예제

```markdown
---
title: 고객사 - 프로젝트명
subtitle: MongoDB Consulting Report
customer: 고객사
project: 프로젝트명
version: "1.0"
date: "2026-07-14"
language: ko
audience: customer
author:
  name: 컨설턴트 A
  title: Consulting Engineer
  org: MongoDB
  email: consultant@example.com
participants:
  - name: 고객 담당자 A
    title: DB팀 책임
    org: 고객사
    email: customer-a@example.com
---

# 1 경영 요약

핵심 메시지를 1페이지 이내로 작성한다.

> [!IMPORTANT]
> 경영진이 즉시 검토해야 할 핵심 항목을 강조한다.

# 2 배경

## 2.1 애플리케이션

| 항목 | 값 |
| --- | --- |
| DAU | 180만 |

## 2.2 환경

> [!NOTE]
> 환경 정보를 기술한다.

# 3 목표

- 병목 식별
- 인덱스 최적화

# 4 권장 사항

## 4.1 인덱스 생성 [Priority: 1]

현재 상태를 설명한다.

### 해결 방법

\`\`\`javascript title="create-index.js"
db.collection.createIndex({ user_id: 1 });
\`\`\`

> [!CAUTION]
> 스테이징에서 먼저 검증하라.

# 5 Q&A

**Question:** 프로덕션에 바로 적용해도 되는가?

**Answer:** 아니오. 스테이징에서 먼저 검증하라.

# 6 다음 단계

- [ ] 인덱스 검증
- [ ] 백업 테스트 수행
```
