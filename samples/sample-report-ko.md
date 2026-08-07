---
title: Markdown to PDF 샘플 리포트
subtitle: 다국어 렌더링 검증
customer: 샘플 고객사
project: 문서 자동화 PoC
brand: MongoDB
version: "1.0"
date: "2026-08-07"
language: ko
audience: customer
copyright_year: "2026"
author:
  name: md2pdf Team
  title: Documentation Engineering
  org: MongoDB
  email: docs@example.com
participants:
  - name: 김민서
    title: 플랫폼 엔지니어
    org: 샘플 고객사
    email: minseo@example.com
  - name: md2pdf Team
    title: Documentation Engineering
    org: MongoDB
    email: docs@example.com
---

# 1 요약

이 문서는 Markdown 원본 하나에서 self-contained HTML과 PDF를 함께 생성하는 문서 자동화
흐름을 검증하기 위한 한국어 샘플입니다. 표지 메타데이터, 본문 계층, 표, 코드 블록,
주의 박스와 체크리스트가 PDF에서도 읽기 쉽게 유지되는지 확인합니다.

> [!NOTE]
> 이 문서의 고객명과 수치는 렌더링 예시를 위한 가상 값입니다.

# 2 주요 관찰

## 2.1 문서 구조

문서 구조는 제목과 핵심 결과를 먼저 제시한 뒤, 관찰 결과와 실행 순서를 이어서 설명하는
방식으로 구성했습니다. 긴 문장이 페이지 경계를 넘어갈 때도 문단 간격과 줄바꿈이
자연스럽게 유지되어야 합니다.

| 검증 항목 | 현재 상태 | 권장 방향 |
| --- | --- | --- |
| 표지 메타데이터 | YAML front matter 사용 | 필수 필드 유지 |
| 검색 결과 표 | GFM 테이블 렌더링 | 열 너비와 줄바꿈 확인 |
| 코드 예시 | JavaScript 구문 강조 | 복사 가능한 텍스트 유지 |
| 다국어 본문 | 한국어 글리프 포함 | PDF에서 글자 누락 확인 |

다음 예시는 계약 상태를 조회하는 간단한 MongoDB 쿼리입니다.

~~~javascript
db.contracts.find(
  { status: "ACTIVE", region: "KR" },
  { _id: 0, contract_id: 1, customer_name: 1 }
).sort({ updated_at: -1 });
~~~

## 2.2 검증 결과

- [x] HTML 제목과 표지 제목이 일치함
- [x] 표 헤더와 본문 행이 페이지에서 구분됨
- [x] 한국어 문장과 숫자가 PDF에 표시됨
- [ ] 실제 운영 데이터 기반의 성능 측정은 별도 수행

# 3 권장 실행 순서

1. Markdown front matter와 제목 계층을 검토합니다.
2. HTML을 먼저 열어 링크, 표, 코드 블록을 확인합니다.
3. PDF의 모든 페이지를 실제 인쇄 결과로 검토합니다.
4. 문제가 있으면 생성된 파일이 아니라 Markdown 또는 스타일을 수정합니다.

이 샘플은 네 가지 언어 문서가 동일한 렌더링 파이프라인을 공유할 수 있음을 보여주는
기준 파일입니다.
