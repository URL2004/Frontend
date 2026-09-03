# 랜딩용 제품 스크린샷 재생성 스크립트 — UI가 바뀌면 다시 실행해 자산을 갱신한다.
# 사용: dev 서버(127.0.0.1:5173) 켠 상태에서  python capture-landing-shots.py
import json
import os
import subprocess
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img", "landing")
BASE = "http://127.0.0.1:5173"
os.makedirs(OUT, exist_ok=True)

# ── 감지 보고서 렌더 ─────────────────────────────────────────────────────────
# 보고서는 v116~v123에서 전면 개편돼 예전처럼 DOM에 값을 꽂는 방식이 통하지 않는다
# (lavRepProb·lavRepBadge 같은 id가 사라졌다). 응답만 가짜로 주고 실제 렌더 경로
# (lavDetect → 보고서 카드)를 그대로 태운다 — 화면이 바뀌어도 이 스크립트는 따라간다.
REPORT_FIXTURE = os.path.join(ROOT, "scripts", "fixtures", "detect-report-sample.json")
# 감지 입력은 실제 문장이어야 한다 — 같은 글자를 반복하면 판독 품질 검사에 걸려 감지가 시작되지 않는다.
REPORT_TEXT = (
    "본 보고서는 생성형 인공지능의 확산이 대학 교육에 미치는 영향을 분석하는 것을 목적으로 한다. "
    "최근 인공지능 기술의 급격한 발전은 학습 방식과 평가 체계 전반에 걸쳐 근본적인 변화를 요구하고 있다. "
    "이러한 변화는 단순히 기술적 차원에 머무르지 않고 교육의 본질에 대한 재고를 촉발한다는 점에서 중요한 의미를 갖는다. "
    "특히 과제 수행 과정에서 인공지능을 활용하는 사례가 늘어나면서 학습자의 사고 과정을 어떻게 평가할 것인가에 대한 "
    "논의가 활발히 이루어지고 있다. 따라서 본 연구에서는 국내외 대학의 대응 사례를 중심으로 관련 논의를 종합적으로 "
    "검토하고, 향후 교육 현장에 요구되는 제도적 보완 방안을 제시하고자 한다."
)


def render_report(page, sample=None, text=None):
    """가짜 /detect-report 응답으로 보고서 카드를 실제로 렌더하고 준비될 때까지 기다린다."""
    if sample is None:
        with open(REPORT_FIXTURE, encoding="utf-8") as fp:
            sample = json.load(fp)
    # 입력은 실제 문장이어야 한다 — 같은 글자를 반복하면 판독 품질 검사(lavEnsureReadableInput)에 걸린다.
    text = text or REPORT_TEXT
    page.evaluate(
        """({ mock, sampleText }) => {
      window.CU = { uid: 'shot', getIdToken: () => Promise.resolve('t') };
      window.UC = 200; window.UP = 'free'; window.gpUserDataReady = true;
      window.authReady = Promise.resolve();
      // 실제 앱에는 로그인 대기(waitForAuthUser)가 있어 비로그인 상태로는 8초를 기다린 뒤 포기한다.
      window.waitForAuthUser = () => Promise.resolve(window.CU);
      window.gpConfirm = () => Promise.resolve(true);
      window.updateCreditUI = () => {}; window.gpToast = () => {};
      const real = window.fetch;
      window.fetch = function (url, opts) {
        if (String(url).indexOf('/detect-report') >= 0) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mock) });
        }
        return real.apply(this, arguments);
      };
      document.getElementById('lavInput').value = sampleText;
      window.lavDetect();
    }""",
        {"mock": sample, "sampleText": text},
    )
    page.wait_for_function(
        "() => { const f = document.getElementById('lavFlow'); return f && f.dataset.step === 'report'; }",
        timeout=20000,
    )
    page.wait_for_timeout(900)   # 게이지 카운트업·스윕이 끝난 정지 화면을 찍는다
    page.add_style_tag(content="*,*::before,*::after{animation:none!important;transition:none!important;}")



LONG = "인공지능 기술의 급격한 발전은 산업 구조와 노동 시장 전반에 걸쳐 광범위한 변화를 초래하고 있다. 본 연구에서는 이러한 기술 변화가 사회 제도와 교육 체계에 미치는 영향을 다각도로 분석하고자 하였다. " * 6

def page(b):
    pg = b.new_page(viewport={"width": 1360, "height": 850}, device_scale_factor=1)
    # lp=0: 랜딩을 건너뛰고 앱 화면으로 바로 들어간다(이게 없으면 #lavInput이 없다).
    # returning_funded: 잔액이 넉넉한 상태. trial_engaged(9크레딧)로 찍으면 랜딩 화면이
    # "크레딧 부족 · 충전하기"로 잡혀 제품 소개 화면으로 맞지 않는다.
    pg.goto(BASE + "/?lp=0&preview_segment=returning_funded", wait_until="networkidle", timeout=45000)
    pg.wait_for_selector("#lavInput", timeout=20000)
    pg.wait_for_timeout(1500)
    pg.add_style_tag(content="*,*::before,*::after{animation:none!important;transition:none!important;}")
    return pg

with sync_playwright() as p:
    b = p.chromium.launch()

    # ① 컴포저 + 예상 비용
    pg = page(b)
    pg.fill("#lavInput", LONG[:640])
    pg.dispatch_event("#lavInput", "input")
    pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(OUT, "shot-composer.png"), full_page=False)
    pg.close()

    # ② 감지 보고서 — 실제 응답 형태로 렌더한다(fixtures/detect-report-sample.json)
    pg = page(b)
    render_report(pg)
    pg.screenshot(path=os.path.join(OUT, "shot-detect.png"), full_page=False)
    pg.close()

    # ③ 처리 방식 3택(다듬기 · 기본 · 고급) — 흐름 이름은 select 다(구 reduce)
    pg = page(b)
    pg.fill("#lavInput", LONG[:1200])
    pg.dispatch_event("#lavInput", "input")
    pg.wait_for_timeout(300)
    pg.evaluate("""() => {
      const d = document.getElementById('lavDetailBlock');
      if (d) d.open = false;
      window.lavFlowGo('select');
      if (typeof window.lavEvidenceChange === 'function') window.lavEvidenceChange();
    }""")
    pg.wait_for_timeout(600)
    pg.screenshot(path=os.path.join(OUT, "shot-settings.png"), full_page=False)
    pg.close()

    # ④ 완료 화면
    pg = page(b)
    pg.fill("#lavInput", LONG[:1200])
    pg.dispatch_event("#lavInput", "input")
    pg.wait_for_timeout(300)
    pg.evaluate("""() => {
      window.lavFlowGo('done');
      document.getElementById('lavDoneBody').textContent =
        '이번 학기 프로젝트에서 가장 어려웠던 부분은 일정 관리였다. 처음에는 계획대로 흘러가지 않아 당황했지만, 주 단위로 목표를 쪼개면서 흐름을 되찾았다. 팀원들과 매주 짧게 회고를 하면서 문제를 빨리 드러내는 습관도 생겼다.';
      document.getElementById('lavDoneNote').textContent = '기본 휴머나이징이 완료됐어요. 외부 검사 결과는 글과 도구에 따라 달라지며 점수를 보장하지 않아요.';
    }""")
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "shot-done.png"), full_page=False)
    pg.close()
    b.close()

# 랜딩 마크업은 .webp를 참조한다 — png는 중간 산출물이라 같은 이름의 webp로 변환해 둔다.
for f in sorted(os.listdir(OUT)):
    if not f.endswith(".png"):
        continue
    src = os.path.join(OUT, f)
    dst = src[:-4] + ".webp"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-quality", "82", dst], check=True)

for f in sorted(os.listdir(OUT)):
    print(f, round(os.path.getsize(os.path.join(OUT, f)) / 1024), "KB")
