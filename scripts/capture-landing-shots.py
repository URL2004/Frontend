# 랜딩용 제품 스크린샷 재생성 스크립트 — UI가 바뀌면 다시 실행해 자산을 갱신한다.
# 사용: dev 서버(127.0.0.1:5173) 켠 상태에서  python capture-landing-shots.py
import os
from playwright.sync_api import sync_playwright

OUT = r"c:\Users\dbvision10\Documents\당근대학생\Frontend\assets\img\landing"
BASE = "http://127.0.0.1:5173"
os.makedirs(OUT, exist_ok=True)

LONG = "인공지능 기술의 급격한 발전은 산업 구조와 노동 시장 전반에 걸쳐 광범위한 변화를 초래하고 있다. 본 연구에서는 이러한 기술 변화가 사회 제도와 교육 체계에 미치는 영향을 다각도로 분석하고자 하였다. " * 6

def page(b):
    pg = b.new_page(viewport={"width": 1360, "height": 850}, device_scale_factor=1)
    pg.goto(BASE + "/?preview_segment=trial_engaged", wait_until="networkidle", timeout=45000)
    pg.wait_for_timeout(1500)
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

    # ② 감지 보고서
    pg = page(b)
    pg.evaluate("""() => {
      window.CU = window.CU || {}; window.UC = 4;
      document.getElementById('lavInput').value = '가'.repeat(1000);
      document.getElementById('lavEntry').hidden = true;
      const flow = document.getElementById('lavFlow');
      flow.hidden = false;
      flow.querySelectorAll('.lav-flow-card').forEach(c => c.hidden = c.dataset.flow !== 'report');
      document.getElementById('lavRepProb').textContent = '78';
      document.getElementById('lavRepBadge').textContent = '높음';
      document.getElementById('lavRepTitle').textContent = 'AI가 쓴 글처럼 보일 위험이 높아요';
      document.getElementById('lavRepSummary').textContent = '반복 표현과 균일한 문장 흐름이 여러 문단에서 확인됐어요.';
      document.getElementById('lavRepStatRisk').textContent = '3';
      document.getElementById('lavRepStatThin').textContent = '2';
      document.getElementById('lavRepStatSafe').textContent = '4';
      const line = document.getElementById('lavRepGoCost');
      line.textContent = '이동 후 기본 휴머나이징 20크레딧 · 보유 4크레딧';
      line.hidden = false;
    }""")
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "shot-detect.png"), full_page=False)
    pg.close()

    # ③ 회피 설정(처리 방식 선택)
    pg = page(b)
    pg.evaluate("""() => {
      document.getElementById('lavEntry').hidden = true;
      const flow = document.getElementById('lavFlow');
      flow.hidden = false;
      flow.querySelectorAll('.lav-flow-card').forEach(c => c.hidden = c.dataset.flow !== 'reduce');
      const meta = document.getElementById('lavCtaMeta');
      if (meta) meta.textContent = '약 3분 · 20크레딧';
    }""")
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "shot-settings.png"), full_page=False)
    pg.close()

    # ④ 완료 화면
    pg = page(b)
    pg.evaluate("""() => {
      document.getElementById('lavEntry').hidden = true;
      const flow = document.getElementById('lavFlow');
      flow.hidden = false;
      flow.querySelectorAll('.lav-flow-card').forEach(c => c.hidden = c.dataset.flow !== 'done');
      document.getElementById('lavDoneBody').textContent =
        '이번 학기 프로젝트에서 가장 어려웠던 부분은 일정 관리였다. 처음에는 계획대로 흘러가지 않아 당황했지만, 주 단위로 목표를 쪼개면서 흐름을 되찾았다. 팀원들과 매주 짧게 회고를 하면서 문제를 빨리 드러내는 습관도 생겼다.';
      document.getElementById('lavDoneNote').textContent = '기본 휴머나이징이 완료됐어요. 외부 검사 결과는 글과 도구에 따라 달라지며 점수를 보장하지 않아요.';
    }""")
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "shot-done.png"), full_page=False)
    pg.close()
    b.close()

for f in sorted(os.listdir(OUT)):
    print(f, round(os.path.getsize(os.path.join(OUT, f)) / 1024), "KB")
