---
name: 교수님 피하기 · AI 감지 보고서
description: 라벤더 실험실 리포트 — 교수님 레이더 스코프가 판정을 그림으로 보여주는 한 화면
colors:
  rep-ink: "#1a1747"
  rep-copy: "#4c5068"
  rep-muted: "#5b6273"
  rep-line: "#e7e5f7"
  rep-brand: "#6d4aff"
  rep-brand-strong: "#4b34cc"
  rep-violet: "#8b5cf6"
  rep-navy: "#241c5c"
  rep-cream: "#f3f0ff"
  rep-coral: "#c43f35"
  rep-teal: "#056176"
  rep-on-navy-muted: "#c9c4ea"
  rep-on-brand-muted: "#ece7ff"
  logo-yellow: "#f5b425"
  page-ground: "#f1f2f8"
  card-white: "#ffffff"
typography:
  display:
    fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "var(--rep-fs-8)"
    fontWeight: 850
    lineHeight: 1
    letterSpacing: "-0.05em"
  headline:
    fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "var(--rep-fs-7)"
    fontWeight: 800
    lineHeight: 1.42
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "var(--rep-fs-5)"
    fontWeight: 800
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "var(--rep-fs-3)"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "var(--rep-fs-1)"
    fontWeight: 700
    lineHeight: 1.5
rounded:
  chip: "999px"
  cell: "9px"
  row: "12px"
  panel: "18px"
  hero: "22px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "22px"
  panel: "22px 24px"
  hero: "30px 34px 26px"
components:
  button-primary:
    backgroundColor: "{colors.logo-yellow}"
    textColor: "{colors.rep-ink}"
    rounded: "{rounded.chip}"
    padding: "15px 30px"
  button-primary-quiet:
    backgroundColor: "{colors.rep-cream}"
    textColor: "{colors.rep-brand-strong}"
    rounded: "{rounded.chip}"
    padding: "13px 24px"
  button-share:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.rep-brand-strong}"
    rounded: "{rounded.chip}"
    padding: "8px 14px"
  panel:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  stat-strip:
    backgroundColor: "{colors.rep-navy}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.panel}"
    padding: "20px 8px"
  sentence-row:
    backgroundColor: "#fdfcff"
    textColor: "{colors.rep-ink}"
    rounded: "{rounded.row}"
    padding: "13px 15px"
---

# Design System: 교수님 피하기 · AI 감지 보고서

## Overview

**Creative North Star: "교수님 레이더 실험실"**

결과를 읽는 화면이 아니라 "내 글이 어떻게 달라지는지"를 보여주는 실험실 리포트다. 흰 카드가 라벤더 바탕(`--page-ground`) 위에 떠 있고, 계측은 네이비 띠 하나로 모이며, 브랜드 장치는 원형 스코프다. 중심에 교수님, 점수만큼 중심 가까이 잡힌 학생 블립. 스윕이 한 바퀴 돌고 학생을 찾아내는 순간이 판정이다.

강조색은 보라 하나. 코랄은 수치·배지 옆에서만, 로고 노랑은 화면에 딱 하나 있는 주요 행동(CTA 버튼)과 고정(pin) 상태에만 쓴다. 방향 계약(seed 26e340ec)의 `#5a5bd8·#7c3aed`는 빌드에서 `#6d4aff/#4b34cc`로 안착했다.

**Key Characteristics:**
- 흰 카드 + 라벤더 바탕, 그림자는 색이 있는 안개(네이비 알파)로만
- 판정은 색이 아니라 위치(스코프 반지름)로 먼저 읽힌다
- 글자 크기는 `--rep-fs-1..8` 여덟 토큰만, 최소 11.5px
- 모든 연동(축·타일·칸)은 호버=미리보기, 클릭=고정

## Colors

보라 한 계열을 잉크·브랜드·네이비 세 농도로 쓰고, 틸/코랄은 판정 구역의 신호색으로만 붙는다.

### Primary
- **Brand Purple** (`--rep-brand`): 레이더 면·점, 스윕 날, 축 밑줄, 칸 히트 링. 실험실의 한 가지 강조색.
- **Brand Strong** (`--rep-brand-strong`): 링크 글자, 포커스 링(2px, offset 3px), After 캡션, 보류 CTA 버튼 글자.
- **Violet** (`--rep-violet`): 문장 번호 알약 그라디언트의 밝은 끝에만.

### Neutral
- **Ink** (`--rep-ink`): 제목·본문 강조·점수 숫자.
- **Copy** (`--rep-copy`): 본문, 축 이름. **Muted** (`--rep-muted`): 캡션·범례·주석(흰 바탕 5.9:1).
- **Line** (`--rep-line`): 1px 경계와 모달 구분선. **Cream** (`--rep-cream`): 칩·연동 헤더·보류 버튼 바탕.
- **Navy** (`--rep-navy`): 계측 띠 하나에만. 그 위 보조 글자는 `--rep-on-navy-muted`(8.0:1).
- **On-brand muted** (`--rep-on-brand-muted`): 보라 그라디언트 위 보조 글자(가장 밝은 끝에서 5.4:1).

### Signal (판정 구역 전용)
- **Coral** (`--rep-coral`): 다듬을 후보 배지, hot 축 값, hard 밴드 칩, 종결 반복 형광(`#ffd9d2` 62% 밑줄). 항상 숫자·배지 옆.
- **Teal** (`--rep-teal`): 유지할 근거 배지, low 밴드 칩, lv0 칸.
- **Logo Yellow** (`#f5b425`): 주요 CTA 버튼, 타일/축 pin 링, 예상 변화 숫자, 계측 타일 포커스.

### Named Rules
**The One Accent Rule.** 강조는 보라 하나. 코랄과 틸은 판정·배지·수치 옆에서만 나타나고 영역을 칠하지 않는다.
**The Yellow Once Rule.** 로고 노랑은 화면의 주요 행동 하나와 pin 상태에만. 보류 상태(`is-quiet`)에서는 크림/보라로 내려간다.
**The Zone Tint Rule.** 구역 배경은 저채도 틴트(`#dcf1f5 / #e4dbff / #fde3de`), 범례 점은 중간 톤(`#9fd6e2 / #b7a5ff / #f4a89c`). 활성 구역만 `saturate(1.35)`.

## Typography

**Display/Body Font:** Pretendard (Apple SD Gothic Neo, Malgun Gothic 폴백). SVG 안 글자도 `font-family:inherit`로 같은 서체.

**Character:** 굵고 좁게 조인 산세리프(850/800/400). 숫자는 전부 `tabular-nums`.

### Hierarchy (8 tokens, 7 in use)
- **fs-8** (44px, 850, -0.05em): 점수 숫자 하나.
- **fs-7** (25px, 800/850): 히어로 제목, CTA 제목.
- **fs-6** (20px): 모바일 제목, 보류 CTA 제목.
- **fs-5** (17px, 800): 패널 제목, 계측 값.
- **fs-4** (15px): Before/After 문장, CTA 버튼.
- **fs-3** (13.5px, 1.75): 핵심 문장 본문, CTA 설명, `/100`.
- **fs-2** (12.5px, 700): 밴드 칩, 공유 버튼, 개선 포인트, 연동 헤더.
- **fs-1** (11.5px): 캡션·배지·범례·축 이름·주석. 이 아래는 없다.

### Named Rules
**The Eight Steps Rule.** 보고서 안의 모든 `font-size`는 `--rep-fs-*` 토큰만 쓴다. 리터럴 px 금지.
**The Keep-All Rule.** 한글 문장은 `word-break:keep-all` + `overflow-wrap:break-word`, 제목은 `text-wrap:balance`.

## Layout

컨테이너 `min(1180px, 100%)`, 세로 `gap:16px`의 단일 컬럼 스택: ① 히어로 카드 ② 네이비 계측 띠 ③ 2단 그리드 ④ 개선 포인트 ⑤ 전환 밴드 ⑥ 한계 고지.

- **히어로 3열** `1fr 292px 1fr`, gap 22px. 가운데 292px은 스코프(276px) 자리. 예시 문장이 없으면 `is-solo`로 1열 중앙.
- **계측 띠** 4열 → 860px에서 2열 → 480px에서 1열. 타일 사이 `rgba(255,255,255,.10)` 세로선.
- **본문 2단** `minmax(0,1.55fr) minmax(0,1fr)`(문장 / 레이더), 1080px에서 1열이 되고 스코프가 `order:-1`로 먼저 온다.
- **개선 포인트** 3열 그리드(gap 16px 26px), 1080px에서 1열.
- **640px**: 히어로 패딩 24/18, 스코프 240px, 문장 행 2열, CTA 버튼 전폭, 모달 바텀시트.

## Elevation & Depth

그림자는 네이비 알파의 낮은 안개다. 히어로 `0 1px 2px rgba(36,28,92,.05), 0 18px 40px -30px rgba(36,28,92,.45)`, 패널은 같은 꼴을 낮춘 값(`.04 / 14px 32px -28px .4`), 모달 `0 30px 80px -30px rgba(26,23,71,.55)`. 문장 행은 호버 때만. 검정 그림자는 노랑 CTA 버튼(`0 8px 22px -8px rgba(0,0,0,.55)`)뿐이다.

**The Tinted Fog Rule.** 그림자는 항상 네이비 알파, 음수 스프레드로 발치만 어둡게. 오프셋 하드 섀도 없음.

## Shapes

카드 22px → 패널 18px → 행 12px → 칸 9px → 칩/버튼/번호 알약 999px. 경계는 1px `--rep-line`. 스코프·레이더는 동심원 + 점선 십자(`3 4`). 문장 번호는 세 자리도 받는 알약(`min-width:22px`).

## Components

### 교수님 레이더 스코프 (signature)
viewBox 300, `R:136`, `RMIN:44`(교수님과 겹치지 않는 하한), 교수님 반지름 22, 블립 14, 블립 각도 -36°. 구역 경계는 점수 20/49. 반지름 = `RMIN + (R-RMIN)·(1-score/100)`. `is-low / is-revise / is-hard / is-unknown`이 블립 링·헤일로 색을 정한다. 이미지 `professor.png`, `runner.png`(ima2-gen gpt-5.5, 320px); 못 뜨면 보라 원만 남는다.
**모션:** `is-sweeping` → `gpRepSweep` 1.4s 1회; 0.9s에 `is-found`(블립 scale .4→1, 궤적 페이드); 숫자 카운트업 1s ease-out cubic(0.45s 지연); 1.7s에 `is-done` → 헤일로 `gpRepPulse` 2.4s 무한. `prefers-reduced-motion`이면 정적 완료 상태.

### 구역 범례 (zone key)
11px 점 + fs-1 글자. 활성 밴드의 항목만 `--rep-ink` 800.

### 밴드 칩
알약, fs-2 800. hard 코랄/`#fdeeec`, revise 보라/`#ece5ff`, low 틸/`#e2f5f8`, unknown muted/`#eef0f7`.

### 계측 띠 타일
40px 아이콘 칸(`rgba(139,92,246,.22)`, 경고는 `rgba(244,114,94,.20)`) + dt fs-1 + dd fs-5 800 흰색. `is-link` 타일은 `role=button`, dt 뒤 ` · 보기`, hover/`is-on` `rgba(255,255,255,.08)`, `is-pinned` 노랑 인셋 2px, 포커스 노랑 아웃라인. 5문장 미만이면 띠 아래 `#fff7e3/#6b4a06` 표본 주석이 붙는다.

### 문단 칸
32px(480px에서 30px), 9px 라운드. `lv0` 틸, `lv1` 라벤더, `lv2` 코랄(`#fbdcd7/#96281c`). `is-on` 잉크 테두리+링, `is-hit` 보라 2px 링, `is-dim` 불투명 .35. 발췌가 있는 문단만 칸이 된다.

### 문장 행
inline: 26px 번호 알약(보라 그라디언트) + 본문 + 오른쪽 배지/글자수, `is-candidate`는 `#fffaf9/#f6ddd8`. modal(`gp-rep-s--modal`): 카드 장식 없이 실선 목록, 번호는 `#a3a8c0` 오른정렬, 문단 머리는 일반 흐름.

### 원인 레이더
viewBox 380×304, R 84, 동심원 4개(.25/.5/.75/1). 축 = 포커스 가능한 `<g role=button>`(투명 히트 96×34). `is-on` 이름 보라·점 r6·히트 보라 10%, `is-pinned` 노랑 28%, `hot`(≥0.67) 점·값 코랄, `na` 점 `#c9c4e6`·값 600 흐림(등급이 아니라 부재).

### 전환 밴드
eligible: 그라디언트 `115deg #2a1a6e → #4b2fc4 → #6d4aff`, 오른쪽 `cta-runner.png` 마스크, 노랑 버튼. `is-quiet`: 흰 카드 1px 라인, 제목 fs-6 잉크, 크림 버튼 또는 버튼 제거. 예상 변화 칩은 범위만(문장 수·%), 점수 예측 없음.

### 공유 버튼 / 모달
공유: 흰 알약 `#d9d2fa` 테두리, 보라 글자, hover 크림, `is-busy` .6. 1200×630 캔버스(네이비→보라 그라디언트, Pretendard). 모달: 760px, 82vh, 20px, backdrop `rgba(26,23,71,.45)` blur 2px; Esc 닫기, Tab 트랩; 640px 아래 바텀시트.

## Do's and Don'ts

### Do:
- **Do** 호버/포커스 = 미리보기, 클릭/Enter/Space = 고정 토글. 고정 중 호버는 바꾸지 못한다. 모바일 고정은 연동 헤더로 `scrollIntoView`.
- **Do** 포커스 링은 `2px solid --rep-brand-strong`, offset 3px (네이비 위에서는 노랑).
- **Do** 숫자 옆에만 코랄. 문장 수가 5 미만이면 표본 주석을 띄운다.
- **Do** 판정 없는 축은 `na`로 흐리게, 등급색 금지.

### Don't:
- **Don't** "사람이 쓴 글"이라고 단정하지 않는다("실제 경험이나 구체 정보가 확인돼 유지할 수 있어요"로 치환).
- **Don't** 점수 예측("66 → 4x", "38% → 0%")을 쓰지 않는다. 예상 변화는 범위만.
- **Don't** "판정 보류"를 화면 라벨로 쓰지 않는다. 점수 없음은 "확인 필요"/"판정 준비 중".
- **Don't** 스코프 중심(교수님)에 숫자를 겹치지 않는다. 숫자는 스코프 아래 읽기 블록.
- **Don't** 지표를 세로로 쌓지 않는다. 계측은 띠, 대비는 나란히.

---
*Finish review 2026-09-02: SHIP AFTER FIXES. Fixes 1–4, 6, 7 applied. Fix 5(계측 띠 글리프 아이콘 제거)는 사장님 지정 레퍼런스 목업의 요소라 미적용 — 아이콘은 시스템 규칙이 아닌 이 화면의 예외.*
