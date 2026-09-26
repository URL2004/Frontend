---
version: 1
slug: "pages-detect-report-html"
primary_target: "pages/detect-report.html"
related_targets: ["pages/landing.html"]
---

## Scope and mode
/detect-report 안내 페이지(검색 유입 착지, 핵심 검색어 'AI 검사기'). Persuade. 앱 셸 안의 파셜이며 결과 화면(보고서)이 아니다.

## Audience, job, action
- 검색해서 처음 온 대학생·취업 준비생. 궁금한 것: 점수가 확률인지, 어디를 고쳐야 하는지, 표절 검사와 차이, 비용, 결과 다음 단계.
- 행동: 내 글 검사하기(openProductMode detect, 출처 detect_report_hero · detect_report_body 두 개만).
- 진입: 랜딩 상단 메뉴·랜딩 푸터 'AI 검사기', 앱 푸터 'AI 감지기', 연구노트 허브 버튼·본문 링크, 검색.

## Direction (2026-09-26, seed ff2c3575, 사장님 선택 '학생이 묻는 순서대로')
- 질문 다섯 개를 차례로 답하고 답마다 실제 보고서 부품으로 증명: 교수님 게이지(히어로) → 구간 눈금 → 네이비 띠 + 문장 행 + 원인 목록 → 비교표 → 크레딧 20칸 + 네이비 띠 → 문장 해부.
- 기억할 장면: 학생이 교수님(100)에게서 64점 자리까지 달아나는 게이지, 원인 이름을 누르면 그 표현만 남는 예시 보고서.
- 테두리 판은 Q5 문장 해부 하나뿐. 나머지 도식은 시트 위에 맨몸으로 둔다(겹카드 금지).

## Constraints
- 예시는 모두 '설명용 예시' 표시. 점수 하락·통과율·후기 금지. 문구 '작성 여부를 확정하는 판정이 아니며' 유지(테스트 계약).
- 해시 앵커 금지(라우터가 탭으로 읽음) → 목차는 gpScrollToSection. 원인 토글은 gpDetectPageCause.
- 빌드가 파셜의 HTML 주석을 지우므로 방향 계약은 소스(pages/detect-report.html 첫 주석)와 CSS 블록 머리에만 남는다.

## Open
- 구간 문구(낮음·중간·높음 설명)는 제품 해석 문구를 요약한 것. 제품 문구가 바뀌면 함께 맞출 것.
