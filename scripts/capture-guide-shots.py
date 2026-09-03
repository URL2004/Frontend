# 사용 가이드용 제품 스크린샷 재생성 스크립트.
# 가이드 페이지의 그림은 실제 화면이어야 뜻이 있다 — UI가 바뀌면 반드시 다시 실행해 자산을 갱신한다.
# (2026-08-29 사이트 감사에서 옛 step1~4.png가 현행 UI와 달라 통째로 걷어낸 전례가 있다.)
#
# 사용: dev 서버를 띄운 상태에서
#   npm run dev                       # 127.0.0.1:5173
#   python scripts/capture-guide-shots.py
import json
import os
import tempfile
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img", "guide")
BASE = "http://127.0.0.1:5173"
# lp=0: 랜딩을 건너뛰고 앱 화면으로 바로 들어간다. preview_segment: 상태별 오퍼 문구 고정.
ENTRY = BASE + "/?lp=0&preview_segment=trial_engaged"
DSF = 2                    # 레티나 대비 2배로 찍고 저장할 때 절반으로 줄인다
os.makedirs(OUT, exist_ok=True)

# 실제 사용자가 붙여넣을 법한 AI 초안(과제/보고서체). 길이로 크레딧이 계산되므로 임의로 줄이지 말 것.
DRAFT = (
    "본 보고서는 생성형 인공지능의 확산이 대학 교육에 미치는 영향을 분석하는 것을 목적으로 한다. "
    "최근 인공지능 기술의 급격한 발전은 학습 방식과 평가 체계 전반에 걸쳐 근본적인 변화를 요구하고 있다. "
    "이러한 변화는 단순히 기술적 차원에 머무르지 않고 교육의 본질에 대한 재고를 촉발한다는 점에서 중요한 의미를 갖는다. "
    "특히 과제 수행 과정에서 인공지능을 활용하는 사례가 늘어나면서 학습자의 사고 과정을 어떻게 평가할 것인가에 대한 "
    "논의가 활발히 이루어지고 있다. 따라서 본 연구에서는 국내외 대학의 대응 사례를 중심으로 관련 논의를 종합적으로 "
    "검토하고, 향후 교육 현장에 요구되는 제도적 보완 방안을 제시하고자 한다."
)

RESULT = (
    "이번 보고서에서 확인하고 싶었던 건 하나였다. 생성형 AI가 들어온 뒤 대학 수업의 무엇이 실제로 달라졌는가. "
    "기술 자체보다 평가가 먼저 흔들렸다. 결과물만 놓고 점수를 매기던 방식이 더는 학습자의 사고 과정을 담아내지 못한다는 "
    "지적이 여러 대학에서 동시에 나왔다. 국내외 대응 사례를 훑어보니 금지와 허용 사이에서 각자 다른 선을 그었고, "
    "그 선이 어디에 있든 공통으로 남는 과제는 과정을 어떻게 기록하고 볼 것인가였다. 이 글에서는 그 지점을 중심으로 "
    "제도적 보완 방안을 정리한다."
)

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


PARAGRAPHS = [
    ("abstract_risk", "위험", "이러한 변화는 단순히 기술적 차원에 머무르지 않고 교육의 본질에 대한 재고를 촉발한다는 점에서…",
     "일반론만 있고 어떤 수업·어떤 평가인지가 없어요"),
    ("abstract_risk", "위험", "따라서 본 연구에서는 국내외 대학의 대응 사례를 중심으로 관련 논의를 종합적으로 검토하고…",
     "‘종합적으로 검토’처럼 내용을 비우는 상투어예요"),
    ("thin", "주의", "특히 과제 수행 과정에서 인공지능을 활용하는 사례가 늘어나면서 학습자의 사고 과정을 어떻게…",
     "문장 길이와 연결어가 지나치게 균일해요"),
    ("concrete", "안전", "본 보고서는 생성형 인공지능의 확산이 대학 교육에 미치는 영향을 분석하는 것을 목적으로 한다.",
     "목적이 구체적으로 드러나 있어요"),
]


def shot(page, path, clip=None, selector=None, pad=0):
    """selector 우선. pad는 CSS px 여백 — 숫자 하나 또는 (위, 오른쪽, 아래, 왼쪽)."""
    top, right, bottom, left = (pad, pad, pad, pad) if isinstance(pad, (int, float)) else pad
    if selector:
        box = page.evaluate(
            "s => { const e = document.querySelector(s); if (!e) return null;"
            "const r = e.getBoundingClientRect();"
            "return {x:r.x, y:r.y, width:r.width, height:r.height}; }",
            selector,
        )
        if not box:
            raise RuntimeError("셀렉터를 찾지 못했습니다: " + selector)
        clip = {
            "x": max(0, box["x"] - left),
            "y": max(0, box["y"] - top),
            "width": box["width"] + left + right,
            "height": box["height"] + top + bottom,
        }
    # PNG는 중간 산출물 — 배포되는 자산은 webp 하나뿐이다(정적 폴더를 통째로 복사하므로).
    png = os.path.join(tempfile.gettempdir(), "gp-guide-" + path + ".png")
    page.screenshot(path=png, clip=clip)
    with Image.open(png) as raw:
        img = raw.resize((raw.width // DSF, raw.height // DSF), Image.LANCZOS)
    img.save(os.path.join(OUT, path + ".webp"), "WEBP", quality=88, method=6)
    os.remove(png)
    print(f"{path}: {img.width}x{img.height}")
    return img.size


def open_app(browser):
    page = browser.new_page(viewport={"width": 1420, "height": 940}, device_scale_factor=DSF)
    page.goto(ENTRY, wait_until="networkidle", timeout=45000)
    page.wait_for_selector("#lavInput", timeout=20000)
    page.wait_for_timeout(1200)
    # 촬영마다 애니메이션 위상이 달라지면 자산이 매번 흔들린다 — 전부 정지시킨다.
    page.add_style_tag(content="*,*::before,*::after{animation:none!important;transition:none!important;}")
    return page


def fill_draft(page, text=DRAFT):
    # 잔액이 모자란 화면이 잡히면 가이드가 "충전하세요"를 가르치게 된다 — 스타터(5,900원·200크레딧) 충전 후 상태로 고정한다.
    page.evaluate("() => { window.GP_HERO_PREVIEW = true; window.UC = 200; }")
    page.fill("#lavInput", text)
    page.dispatch_event("#lavInput", "input")
    page.wait_for_timeout(400)


def enter_flow(page, name):
    """입력 화면을 접고 지정한 흐름 카드만 띄운다."""
    page.evaluate("n => window.lavFlowGo(n)", name)
    page.wait_for_timeout(500)


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ① 입력 — 붙여넣으면 공백 포함 글자 수가 바로 잡힌다
    page = open_app(browser)
    fill_draft(page)
    shot(page, "step-input", selector=".gp-lav-composer", pad=(14, 14, 4, 14))

    # ② 모드 선택 — 휴머나이징 / AI 감지 토글
    shot(page, "step-mode", selector=".gp-lav-mode", pad=6)

    # ③ 예상 크레딧 — 붙여넣는 즉시 이 글에 드는 값이 계산된다
    page.evaluate("""() => {
      const r = document.getElementById('lavRateNote').getBoundingClientRect();
      const e = document.getElementById('lavEstimate').getBoundingClientRect();
      window.__clip = {x:e.x-12, y:r.y-12, width:e.width+24, height:(e.bottom-r.y)+24};
    }""")
    shot(page, "credit-estimate", clip=page.evaluate("window.__clip"))

    # ④ 처리 방식 3택
    fill_draft(page)
    page.evaluate("""() => {
      const d = document.getElementById('lavDetailBlock');
      if (d) d.open = false;             // 세부 설정은 접힌 기본 상태로 — 3택에 시선을 둔다
      window.lavFlowGo('select');
      if (typeof window.lavEvidenceChange === 'function') window.lavEvidenceChange();  // 카드 단가 재계산
    }""")
    page.wait_for_timeout(600)
    shot(page, "step-choose", selector=".lav-choose", pad=0)

    # ⑤ 실행 직전 확인창 — 고른 방식과 비용을 한 번 더 보여준다
    page.evaluate("""() => {
      document.querySelector('input[name="lavTone"][value="blog"]').checked = true;
      window.lavOpenConfirm();
    }""")
    page.wait_for_timeout(600)
    shot(page, "step-confirm", selector="#lavConfirmModal .lav-confirm-card", pad=0)
    page.close()

    # ⑥ AI 감지 보고서 — 실제 응답 형태로 렌더한다(fixtures/detect-report-sample.json)
    page = open_app(browser)
    render_report(page)
    shot(page, "result-detect", selector='[data-flow="report"]', pad=0)
    page.close()

    # ⑦ 휴머나이징 결과
    page = open_app(browser)
    fill_draft(page)
    page.evaluate(
        """(text) => {
      window.lavFlowGo('done');
      document.getElementById('lavDoneBody').textContent = text;
      document.getElementById('lavDoneBody').classList.add('expanded');
      const t = document.getElementById('lavDoneToggle'); if (t) t.hidden = true;
      document.getElementById('lavDoneScore').textContent = '완료';
      const refine = document.getElementById('lavDoneRefine'); if (refine) refine.hidden = true;
      const next = document.getElementById('lavDoneNext'); if (next) next.hidden = true;
    }""",
        RESULT,
    )
    page.wait_for_timeout(600)
    shot(page, "result-done", selector=".lav-done", pad=0)
    # 결과를 챙기는 동작만 — 버튼 줄은 오른쪽 정렬이라 첫 버튼부터 잘라낸다
    page.evaluate("""() => {
      const bs = document.querySelectorAll('.lav-done-actions button');
      const a = bs[0].getBoundingClientRect(), z = bs[bs.length - 1].getBoundingClientRect();
      window.__clip = {x:a.x-14, y:a.y-14, width:(z.right-a.x)+28, height:a.height+28};
    }""")
    shot(page, "step-save", clip=page.evaluate("window.__clip"))

    page.close()

    # ⑧ 작업 기록 — 완료한 작업을 다시 여는 자리
    # 로그인 계정의 실데이터를 쓸 수 없어 목록·상세만 예시 항목으로 채운다.
    # 마크업은 app-module.js의 historyRenderList/historyRenderDetail와 같은 클래스를 쓰므로
    # 실제 화면과 같은 CSS로 그려진다 — 그쪽 마크업이 바뀌면 여기도 함께 고칠 것.
    page = browser.new_page(viewport={"width": 1420, "height": 940}, device_scale_factor=DSF)
    page.goto(BASE + "/history?lp=0", wait_until="networkidle", timeout=45000)
    page.wait_for_selector("#historyList", timeout=20000)
    page.evaluate("t => { window.__draft = t; }", DRAFT)
    page.wait_for_timeout(1200)
    page.add_style_tag(content="*,*::before,*::after{animation:none!important;transition:none!important;}")
    page.evaluate(
        """(result) => {
      const rows = [
        ['humanize', '휴머나이징', '오후 3:12', '생성형 인공지능의 확산이 대학 교육에 미치는 영향', result, '작업 완료', 'good', '10크레딧 사용', true],
        ['detect', 'AI 감지', '오후 2:48', '본 보고서는 생성형 인공지능의 확산이 대학 교육에', '상투적인 연결어와 균일한 문장 길이가 여러 문단에서 반복돼요.', 'AI 생성 가능성 높음 · 74%', 'warn', '4크레딧 사용', false],
        ['humanize', '휴머나이징', '오전 11:05', '지난 학기 팀 프로젝트에서 가장 어려웠던 부분은 일정 관리였다', '처음에는 계획대로 흘러가지 않아 당황했지만, 주 단위로 목표를 쪼개면서 흐름을 되찾았다.', '작업 완료', 'good', '12크레딧 사용', false],
      ];
      const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const list = document.getElementById('historyList');
      list.innerHTML = '<section class="gp-history-group" aria-labelledby="g0"><h2 id="g0">오늘</h2><div role="list">'
        + rows.map(([kind, label, time, title, preview, work, tone, billing, selected]) =>
            '<div role="listitem" class="gp-history-row-wrap">'
            + '<button type="button" class="gp-history-row' + (selected ? ' is-selected' : '') + '">'
            + '<span class="gp-history-row-top"><span class="gp-history-kind ' + kind + '">' + label + '</span><time>' + time + '</time></span>'
            + '<strong>' + esc(title) + '</strong>'
            + '<span class="gp-history-row-preview">' + esc(preview.slice(0, 92)) + '</span>'
            + '<span class="gp-history-row-meta"><span class="gp-history-work ' + tone + '">' + work + '</span>'
            + '<span class="gp-history-billing">' + billing + '</span></span>'
            + '</button></div>').join('')
        + '</div></section>';
      document.getElementById('historyCount').textContent = '3건';

      const block = (title, text, featured) =>
        '<section class="gp-history-text-block' + (featured ? ' featured' : '') + '">'
        + '<h3>' + title + '</h3><div class="gp-history-text">' + esc(text) + '</div></section>';
      document.getElementById('historyWorkspace').classList.add('is-detail-open');
      document.getElementById('historyContent').classList.add('history-detail-open');
      document.getElementById('historyDetailPanel').innerHTML =
        '<article class="gp-history-detail">'
        + '<header class="gp-history-detail-head">'
        + '<button type="button" class="gp-history-back"><span aria-hidden="true">←</span> 목록</button>'
        + '<div class="gp-history-detail-kicker"><span class="gp-history-kind humanize">휴머나이징</span><time>오후 3:12</time></div>'
        + '<h2>생성형 인공지능의 확산이 대학 교육에 미치는 영향</h2>'
        + '<div class="gp-history-detail-meta">'
        + '<span><small>작업 상태</small><b class="good">작업 완료</b></span>'
        + '<span><small>이용 내역</small><b>10크레딧 사용</b></span></div></header>'
        + '<div class="gp-history-detail-body">'
        + block('휴머나이징 결과', result, true)
        + block('원문', window.__draft || '', false)
        + '</div>'
        + '<footer class="gp-history-actions" aria-label="이 기록으로 할 수 있는 작업">'
        + '<button type="button" class="primary">결과 복사</button>'
        + '<button type="button">다운로드</button>'
        + '<button type="button">편집기로 열기</button></footer></article>';
    }""",
        RESULT,
    )
    page.wait_for_timeout(500)
    shot(page, "result-history", selector="#historyWorkspace", pad=0)
    page.close()

    browser.close()

for name in sorted(os.listdir(OUT)):
    print(name, round(os.path.getsize(os.path.join(OUT, name)) / 1024), "KB")
