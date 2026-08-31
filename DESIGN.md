---
name: 교수님 피하기
description: 원문을 존중하는 한국어 AI 작업실의 라이트 라벤더 인터페이스
colors:
  lavender-action: "#5a5bd8"
  lavender-action-strong: "#4b4cc6"
  lavender-wash: "#efeffd"
  canvas: "#f1f2f8"
  surface: "#ffffff"
  surface-soft: "#f7f8fc"
  surface-muted: "#eef0f8"
  border: "#e4e7f1"
  ink: "#1a1f2e"
  ink-secondary: "#525a6e"
  ink-muted-aa: "#626a7e"
  danger: "#c43f35"
  success: "#247a45"
  warning: "#9b6816"
typography:
  display:
    fontFamily: "Pretendard, Noto Sans KR, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(42px, 6.4vw, 84px)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Pretendard, Noto Sans KR, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(28px, 3.6vw, 46px)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Pretendard, Noto Sans KR, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.35
  body:
    fontFamily: "Pretendard, Noto Sans KR, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.65
  label:
    fontFamily: "Pretendard, Noto Sans KR, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.4
  caption:
    fontFamily: "Pretendard, Noto Sans KR, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  compact: "8px"
  control: "10px"
  action: "12px"
  card: "14px"
  panel: "16px"
  dialog: "18px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
  12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.lavender-action}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.lavender-action-strong}"
    textColor: "{colors.surface}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 13px"
    height: "44px"
---

# Design System: 교수님 피하기

## Overview

**Creative North Star: "라벤더 작업실"**

교수님 피하기는 차갑고 불투명한 AI 도구가 아니라, 사용자가 원문을 놓고 안심하며 작업하는 밝은 한국어 편집 작업실처럼 보여야 한다. 흰 종이 같은 표면, 옅은 라벤더 캔버스, 단단한 먹색 텍스트를 기본으로 두고 보라는 선택·진행·완료 상태에만 집중해서 사용한다.

화면은 정보가 많은 서비스 특성을 숨기지 않되 한 번에 필요한 행동을 우선한다. 공개 랜딩은 여백과 큰 제목으로 자신감을 만들고, 앱은 조밀한 작업 도구로 전환한다. 장식은 기능의 위계를 보조할 때만 사용하며, 모든 핵심 흐름은 320px 화면과 키보드만으로도 끝낼 수 있어야 한다.

**Key Characteristics:**

- 밝은 라벤더 캔버스와 흰 작업 표면
- 굵고 직접적인 한국어 제목, 차분한 본문
- 44px 이상의 실행 컨트롤과 명확한 포커스 링
- 카드 남발 대신 작업 단계와 실제 문서가 중심인 구성
- 모바일은 숨김이 아니라 우선순위 재배치

## Colors

보라는 행동과 상태를 표시하고, 대부분의 면적은 종이 같은 중립색이 맡는다.

### Primary

- **작업실 라벤더:** 주요 실행 버튼, 활성 탭, 선택 상태와 포커스에 사용한다.
- **깊은 라벤더:** 주요 버튼의 hover와 더 강한 상태 표현에만 사용한다.
- **라벤더 워시:** 선택 배경, 배지, 안내 영역처럼 조용한 강조에 사용한다.

### Neutral

- **종이 캔버스:** 앱 전체의 바탕이며 흰 표면과 구분되는 최소한의 깊이를 만든다.
- **깨끗한 표면:** 입력기, 카드, 모달, 표와 내비게이션의 기본 면이다.
- **먹색:** 제목과 핵심 수치에 사용한다.
- **본문 회색:** 설명과 메타 정보에 사용한다. 가장 옅은 보조문자도 실제 흰색·라벤더 표면에서 WCAG AA 대비를 지켜야 한다.

**The One Accent Rule.** 한 화면의 경쟁하는 행동을 모두 보라색으로 만들지 않는다. 보라는 현재 선택 또는 가장 중요한 다음 행동 한 축에만 집중한다.

**The Verified State Rule.** 성공·경고·오류 색은 실제 상태를 전달할 때만 사용하고, 장식이나 마케팅 강조색으로 재사용하지 않는다.

## Typography

**Display Font:** Pretendard (system UI fallback)
**Body Font:** Pretendard (system UI fallback)

**Character:** 별도의 장식 글꼴 없이 한 서체의 굵기와 크기로 위계를 만든다. 한국어 조사와 줄바꿈이 깨지지 않도록 `word-break: keep-all`과 안전한 `overflow-wrap`을 함께 사용한다.

### Hierarchy

- **Display** (800, fluid 42–84px, 1.08): 공개 랜딩의 핵심 약속 한 문장에만 사용한다.
- **Headline** (800, fluid 28–46px, 1.2): 페이지 제목과 주요 섹션 제목에 사용한다.
- **Title** (700–800, 18–24px, 1.35): 카드·패널·대화상자의 의미 단위 제목에 사용한다.
- **Body** (500, 16px, 1.65): 설명문은 대체로 70자 안팎의 읽기 폭을 유지한다.
- **Label** (700, 13px, 1.4): 버튼, 탭, 상태 배지와 입력 라벨에 사용한다.

**The Korean Line Rule.** 의미 단위가 짧은 제목과 버튼은 조사 앞에서 어색하게 끊기지 않게 하고, 긴 본문은 강제 한 줄 고정 대신 자연스럽게 줄바꿈한다.

## Layout

공개 페이지는 최대 1180px 컨테이너와 넓은 수직 여백을 사용한다. 앱은 왼쪽 내비게이션과 유동 작업 영역의 두 열로 구성하며, 좁은 화면에서는 작업 영역을 먼저 보여 주고 내비게이션은 접근 가능한 패널로 접는다.

간격은 4px 배수의 4·8·12·16·24·32·48px만 기본 리듬으로 사용한다. 960px 이하에서는 복수 열을 단일 흐름으로 재배치하고, 560px 이하에서는 바깥 여백을 14px 수준으로 줄인다. 320px에서도 문서 자체에 가로 스크롤이 생기면 안 되며, 요금 카드처럼 의도된 가로 탐색은 이름이 있는 내부 스크롤 영역으로 한정한다.

**The Container Rule.** 고정 너비 자식이 부모를 밀어내지 않도록 Grid와 Flex 자식에는 필요할 때 `min-width: 0`을 명시한다.

## Elevation & Depth

기본은 평평한 톤 분리와 1px 경계선이다. 그림자는 모달, 떠 있는 전환 안내, 공개 랜딩의 제품 프레임처럼 실제로 앞에 떠야 하는 요소에만 사용한다. 작업 카드의 기본 깊이는 `0 18px 44px rgba(78,84,148,.1)` 이하의 확산형 그림자이며, 키보드 포커스는 그림자 대신 선명한 보라 링으로 구분한다.

### Shadow Vocabulary

- **Ambient panel:** 조용히 떠 있는 큰 작업 표면과 모달에 쓰는 넓고 낮은 라벤더 그림자.
- **Product frame offset:** 랜딩의 실제 제품 예시에만 쓰는 먹색 오프셋 그림자.
- **Focus halo:** 키보드 포커스 전용 3px 라벤더 외곽광.

**The Flat-by-Default Rule.** 정보 카드마다 그림자를 넣지 않는다. 경계선과 표면색으로 충분하지 않을 때만 깊이를 추가한다.

## Shapes

컨트롤은 부드럽지만 장난스럽지 않은 10px 모서리, 카드와 큰 표면은 14px 모서리를 사용한다. 알약형은 상태 배지와 짧은 필터처럼 내용이 한 줄로 끝나는 요소에만 허용한다. 입력·버튼·카드의 모서리 체계를 섞지 않고, 원형은 아이콘 전용 버튼이나 상태 점처럼 의미가 분명할 때만 쓴다.

## Components

### Buttons

- **Shape:** 10px 모서리와 최소 44px 높이.
- **Primary:** 라벤더 바탕의 작업 실행용. 공개 랜딩의 최상위 CTA는 먹색 바탕을 사용해 브랜드 보라와 경쟁하지 않는다.
- **Hover / Focus:** hover는 한 단계 짙어지고, 키보드 포커스는 3px 라벤더 링과 3px 간격을 갖는다.
- **Ghost:** 흰 배경, 얇은 중립 경계선, 먹색 텍스트로 보조 행동을 표현한다.

### Chips

- **Style:** 라벤더 워시 또는 중립 표면 위 12–13px 굵은 라벨.
- **State:** 선택은 색과 `aria-selected`를 함께 바꾸며, 색만으로 상태를 전달하지 않는다.

### Cards / Containers

- **Corner Style:** 14px.
- **Background:** 흰 표면을 기본으로 하고 선택·안내에만 라벤더 워시를 쓴다.
- **Shadow Strategy:** 기본은 경계선, 실제 부유 요소만 ambient shadow.
- **Internal Padding:** 16px 또는 24px. 큰 설명형 표면은 32px까지 허용한다.

### Inputs / Fields

- **Style:** 흰 표면, 중립 경계, 10px 모서리, 최소 44px 높이.
- **Focus:** 라벤더 경계와 3px 외곽광.
- **Error / Disabled:** 오류는 텍스트 설명을 함께 제공하고, 비활성은 대비를 유지한 채 포인터·ARIA 상태를 일치시킨다.

### Navigation

현재 위치는 `aria-current`와 시각 상태가 일치해야 한다. 데스크톱은 지속적인 좌측 내비게이션, 모바일은 44px 메뉴 버튼과 포커스가 갇히지 않는 접이식 패널을 사용한다. 페이지 전환 뒤에는 새 페이지 제목으로 포커스를 옮긴다.

### Document Composer

입력 문서가 화면의 중심이다. 모드·비용·첨부·전송은 입력 영역 하단의 한 도구줄에 두고, 결과나 가입 제안이 입력보다 먼저 시선을 빼앗지 않게 한다. 오류가 발생하면 빈 화면이 아니라 같은 위치에서 이유와 재시도 행동을 제공한다.

## Do's and Don'ts

### Do:

- **Do** 44px 최소 터치 크기와 보이는 `:focus-visible` 상태를 유지한다.
- **Do** 보조문자도 흰색과 라벤더 표면에서 WCAG AA 대비를 확인한다.
- **Do** 320·375·768·1440px에서 문서 가로 넘침과 깨진 이미지를 회귀 테스트한다.
- **Do** 자산 로딩 실패·느린 네트워크·외부 폰트 차단에도 핵심 입력과 재시도 경로를 남긴다.
- **Do** 레이아웃 크기를 바꾸는 애니메이션보다 `transform`과 `opacity`를 사용하고, 화면 밖이나 비활성 탭에서는 멈춘다.

### Don't:

- **Don't** 카드마다 다른 반경·그림자·버튼 규격을 만들지 않는다.
- **Don't** placeholder만으로 입력의 이름을 대신하지 않는다.
- **Don't** 모바일에서 중요한 기능을 삭제하거나 같은 충전 버튼을 여러 곳에 중복 노출하지 않는다.
- **Don't** 검증되지 않은 숫자나 상태를 신뢰 지표처럼 노출하지 않는다.
- **Don't** 실험·관리자·글쓰기 랩 자산을 일반 사용자의 첫 화면에 미리 로드하지 않는다.
