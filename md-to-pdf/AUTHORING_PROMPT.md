# Markdown 작성/변환 지시문 (Authoring Directive)

이 문서는 `md-to-pdf` 렌더러에 넣을 Markdown을 **처음부터 작성**하거나, **기존 raw
Markdown/문서를 변환**할 때 따라야 하는 절차다. 렌더러가 올바르게 해석하도록
`CONVENTIONS.md`의 규칙을 소스 단계에서 적용하는 것이 목적이며, 렌더링 후 HTML/PDF를
직접 고치는 것은 금지된다(Markdown이 항상 source of truth).

## 0. 사용 시점

- 사용자가 raw markdown(회의록, 초안, 다른 포맷에서 변환된 문서 등)을 렌더링해 달라고
  요청했을 때
- 새 컨설팅 리포트/문서를 처음부터 작성할 때
- 기존 렌더링 결과의 레이아웃이 어색해서 소스를 다시 다듬어야 할 때

## 0-1. 표준 vs 비표준 문법 (먼저 인지할 것)

`CONVENTIONS.md` §0에 전체 표가 있다. 요약하면 다음 문법은 **이 렌더러 밖에서는
의미가 없는 비표준 확장**이며, 사용할 때 그 사실을 인지하고 있어야 한다 (다른 뷰어에
공유될 문서라면 특히 중요):

| 비표준 문법 | 다른 뷰어에서 보이는 모습 |
| --- | --- |
| YAML front matter의 `customer`/`participants` 등 필드 | 일부 뷰어는 YAML 블록 자체를 그대로 텍스트로 노출 |
| 헤딩 끝 `[Priority: N]` | 배지가 아니라 글자 그대로 `[Priority: 1]` |
| `## Recommendations` 헤딩 감지 → Legend 자동 삽입 | Legend 없이 헤딩만 보임 |
| `**Question:**` / `**Answer:**` | 그냥 볼드체 텍스트 |
| 코드블록 ` ```lang title="..." ` | 속성이 무시되거나 언어 인식이 깨질 수 있음 |
| 이미지 로컬 전용 제약 | 순수 Markdown에서는 원격 이미지도 정상 동작하므로 이 제약 자체가 없음 |
| `<div class="page-break"></div>` | HTML은 보이지만 실제로 페이지가 나뉘지는 않음 (이 스타일시트 밖에서는) |

반면 헤딩(`#`), GFM 표, GFM 체크리스트, 하이퍼링크, 이미지 문법 자체, raw HTML 삽입은
표준이라 어디서나 동일하게 동작한다. `> [!NOTE]` 계열 admonition은 GitHub.com에서는
유사하게 표시되지만(GitHub Alerts) CommonMark 표준은 아니라는 점도 참고한다.

이 구분이 필요한 이유: raw markdown을 변환할 때 위 비표준 패턴을 **새로 만들어 넣는
것**이므로, 원본에 없던 렌더러 전용 문법을 도입한다는 것을 명확히 인지하고 작업해야
한다. 사용자가 "이 문서를 다른 곳에도 그대로 쓸 것"이라고 하면 이 표를 근거로
비표준 문법 사용을 최소화하거나 별도 안내를 해야 한다.

## 1. Front Matter 확정 (가장 먼저)

다음 필드를 채운다. 원본 문서에 없으면 **추측하지 말고 조사**한다 (Glean 검색, 프로젝트
문서, 사용자에게 직접 질문 등).

| 필드 | 확보 방법 |
| --- | --- |
| `title` | 원본의 최상위 제목(H1) 텍스트를 그대로 이동. 본문에는 남기지 않는다. |
| `customer` | 고객사명. 명확하지 않으면 사용자에게 확인. |
| `project` | 프로젝트/엔게이지먼트명. Glean에서 프로젝트 계획서, WBS, Kickoff 문서를 검색해 확인 가능. |
| `subtitle` | 컨설팅 리포트라면 `MongoDB Consulting Report` 고정값 사용. |
| `version` | 명시 안 되어 있으면 `"1.0"`. |
| `date` | 원본에 날짜가 없으면 오늘 날짜 또는 참여자에게 확인. |
| `language` | 본문 언어의 BCP 47 태그 (`ko`, `en`, `ja`). |
| `author` | 리포트 작성자(주로 담당 컨설턴트). `{name, title, org, email}`. |
| `participants` | **실제 회의/엔게이지먼트 참여자 목록**. 원본에 없으면 Glean에서 관련 프로젝트 문서(Kickoff, Checkpoint, WBS 등)를 검색해 이름·직함·이메일을 찾는다. **작성한 순서가 곧 표지에 표시되는 순서**이므로, 고객 참석자를 먼저 적을지 MongoDB 참석자를 먼저 적을지는 작성자가 의도적으로 정한다. |
| `audience` | `customer` 단계 문서면 `customer`, 생략 가능. |
| `copyright_year` | 생략시 현재 연도 자동 적용. |

메타데이터 조사가 필요하면 다음을 검색한다 (Glean 사용 가능 시):
- `<프로젝트명> Kickoff`, `<프로젝트명> Checkpoint`, `<프로젝트명> Project Plan`
- 참여자 이메일 도메인으로 회사 소속 구분

## 2. 헤딩 계층 재배열

- 원본 최상위 제목(H1, 문서 제목)은 **front matter `title`로 이동**하고 본문에서 제거한다.
- 원본의 챕터급 섹션(원래 H2였다면)은 **H1로 승격**한다. `# N 제목` 형태로 번호를 수동
  기입한다 (자동 번호 없음).
- 하위 절은 그다음 레벨로 내린다: 챕터 H1 → 절 H2 → 소절 H3.
- 번호는 계층을 반영한다: `# 1 배경`, `## 1.1 세부...`, `### 1.1.1 더 세부...`.
- Recommendation 섹션이면 헤딩 끝에 `[Priority: N]`을 붙인다 (N=1/2/3). `## Recommendations`
  또는 `## N Recommendations` 패턴 헤딩 앞에는 Priority Legend가 자동 삽입되므로 별도 작성
  불필요.

## 3. 이미지 처리

- 원본에 `[Image: 설명](원격 URL)` 같은 비표준 문법이 있으면 **표준 이미지 문법**
  `![대체텍스트](경로)`로 변환한다.
- **원격 URL은 렌더러가 거부한다.** 반드시 로컬 파일 경로여야 한다. 처리 순서:
  1. 원본 이미지가 실제로 다운로드 가능한지 확인한다 (`webfetch`, `mongo-glean_read_document`
     `mode: raw_bytes` 등).
  2. 다운로드에 성공하면 문서 옆 `images/` 폴더에 저장하고 상대 경로로 참조한다.
  3. 다운로드가 불가능하면(예: 접근 권한 없는 채팅 첨부파일, 만료된 링크) **플레이스홀더
     SVG를 새로 제작**해 같은 내용을 도식으로 표현하고, 사용자에게 원본 이미지로 교체가
     필요하다고 명시적으로 알린다.
- 지원 포맷: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.avif`, `.apng`.
- Figure 캡션은 이미지 다음 줄에 `*Figure N: 설명*` 형태로 이탤릭 문단을 추가한다
  (자동 생성되지 않음).

## 4. 코드 블록

- 커맨드/쿼리/설정 예시가 있는 코드 블록에는 가능하면 `title="파일명 또는 설명"`을
  붙인다: ` ```javascript title="create-index.js" `.
- 언어 태그는 실제 언어로 지정한다 (`javascript`, `bash`, `json` 등). 모르면 `text`.

## 5. 강조 박스와 Q&A

- 경고/주의/팁 성격의 문단은 GitHub 스타일 admonition으로 변환한다:
  `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!CAUTION]`, `> [!IMPORTANT]`.
- 질의응답 형식의 문단은 `**Question:**` / `**Answer:**`로 시작하도록 정리한다.

## 6. 표와 체크리스트

- 표는 표준 GFM 파이프 테이블로 작성한다. 헤더 행은 필수.
- 할 일 목록은 GFM task list(`- [ ]`, `- [x]`)로 작성한다.

## 7. 페이지 브레이크

- 부록처럼 명확히 별도 섹션으로 시작해야 하는 곳 앞에 `<div class="page-break"></div>`를
  넣을지 판단한다. **단, 스타일시트가 이미 모든 H1 앞에 자동 페이지 브레이크
  (`page-break-before: always`)를 적용하므로, H1 헤딩 바로 앞에는 수동 page-break를
  중복으로 넣지 않는다** (중복 시 빈 페이지가 생긴다).

## 8. 링크

- 본문 링크는 인라인 하이퍼링크 `[텍스트](URL)`로 작성한다. PDF에서는 외부 링크 뒤에
  URL이 자동으로 덧붙는다.

## 9. 변환 후 자체 점검 체크리스트

소스를 다 고쳤으면 렌더링 전에 다음을 확인한다:

- [ ] Front matter에 `title`, `customer`, `date`, `language`가 채워져 있는가
- [ ] 본문에 중복된 제목/요약 문단이 없는가 (front matter로 옮긴 제목이 본문에도 남아있지
      않은가)
- [ ] H1이 챕터 레벨과 일치하는가 (문서 제목이 아니라 챕터 제목인가)
- [ ] 모든 이미지가 로컬 경로인가 (원격 URL이 남아있지 않은가)
- [ ] 부록 앞 수동 page-break와 자동 H1 page-break가 중복되지 않는가
- [ ] 코드 블록에 언어 태그가 있는가

## 10. 렌더링 및 검증

```bash
node md-to-pdf/dist/cli.js input.md --stage customer
```

렌더링 후 다음으로 실제 페이지 단위 검증을 수행한다 (HTML 스크롤 캡처는 실제 PDF
페이지네이션과 다를 수 있으므로 지양한다):

```bash
python3 -c "
import fitz
doc = fitz.open('output.customer.pdf')
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=150)
    pix.save(f'pdf-pages/page-{i+1:02d}.png')
"
```

생성된 페이지 이미지를 Vision 가능한 모델(Claude Sonnet 등)로 직접 읽어 다음을 확인한다:

- 표지 제목이 한 줄에 들어가는가 (렌더러가 자동 축소하지만 확인 필요)
- 빈 페이지가 없는가
- 표/이미지가 페이지 경계에서 어색하게 잘리지 않는가
- 헤딩 계층, TOC, 배지, 코드블록이 의도대로 표시되는가

문제가 있으면 **생성된 HTML/PDF가 아니라 Markdown 소스나 스타일시트를 고치고 재렌더링**한다.
