(function() {
 'use strict';

 /* ── Phase 2: GSAP ─ 카드 스크롤 3D 리빌 ── */
 function initGSAP() {
  if (typeof gsap === 'undefined') return;
  var obs = new IntersectionObserver(function(entries) {
   entries.forEach(function(entry) {
    if (!entry.isIntersecting) return;
    var card = entry.target;
    var delay = parseFloat(card.dataset.animDelay || 0);
    gsap.fromTo(card,
     { opacity: 0, y: 50, rotateX: 14, scale: 0.95 },
     { opacity: 1, y: 0,  rotateX: 0,  scale: 1, duration: 0.75, delay: delay, ease: 'power3.out' }
    );
    obs.unobserve(card);
   });
  }, { threshold: 0.12 });

  document.querySelectorAll('.comparison-card, .trust-card').forEach(function(card, i) {
   card.dataset.animDelay = (i % 3) * 0.13;
   gsap.set(card, { opacity: 0 });
   obs.observe(card);
  });
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGSAP);
 else initGSAP();

 /* ── Phase 3: Vanilla Tilt ─ 가격 카드 3D 틸트 ── */
 function initTilt() {
  if (typeof VanillaTilt === 'undefined') return;
  if (/Mobi|Android/i.test(navigator.userAgent)) return; // 모바일 비활성화
  VanillaTilt.init(document.querySelectorAll('.plan-card'), {
   max: 8, speed: 300,
   glare: true, 'max-glare': 0.12,
   scale: 1.03, gyroscope: false
  });
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTilt);
 else initTilt();

 /* ── Phase 4: CountUp ─ 신뢰 지표 숫자 카운터 ── */
 function initCountUp() {
  var Cu = (typeof countUp !== 'undefined') ? countUp.CountUp : null;
  if (!Cu) return;
  var obs = new IntersectionObserver(function(entries) {
   entries.forEach(function(entry) {
    if (!entry.isIntersecting || entry.target._counted) return;
    entry.target._counted = true;
    var el = entry.target;
    var end = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    if (isNaN(end)) return;
    el.textContent = '0' + suffix;
    new Cu(el, end, {
     duration: 2.4, separator: ',', suffix: suffix,
     useEasing: true, useGrouping: true
    }).start();
   });
  }, { threshold: 0.3 });
  document.querySelectorAll('.trust-number[data-count]').forEach(function(el) { obs.observe(el); });
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCountUp);
 else initCountUp();

})();


/* ══════════════════════════════════════════════════════════════
   Quiet Depth — 인터랙션 레이어
   (magnetic CTA · card tilt · gauge reveal · hover spotlight)
   ══════════════════════════════════════════════════════════════ */
(function(){
 'use strict';
 var isMobile = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 600;
 var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if (reduceMotion) return;

 /* ── 1) Magnetic CTA 버튼 ── */
 function bindMagnetic(){
  if (isMobile) return;
  var sel = '#lsSendBtn, .plan-btn, .chargbtn, .wbtn, .btn-google, .btn-kakao, .buybtn';
  document.querySelectorAll(sel).forEach(function(btn){
   if (btn._qdMag) return; btn._qdMag = true;
   btn.addEventListener('mousemove', function(e){
    var r = btn.getBoundingClientRect();
    var mx = (e.clientX - r.left - r.width/2) * 0.25;
    var my = (e.clientY - r.top - r.height/2) * 0.25;
    btn.style.setProperty('--mx', mx.toFixed(2)+'px');
    btn.style.setProperty('--my', my.toFixed(2)+'px');
   });
   btn.addEventListener('mouseleave', function(){
    btn.style.setProperty('--mx','0px');
    btn.style.setProperty('--my','0px');
   });
  });
 }

 /* ── 2) Card tilt (Vanilla Tilt 대상 확장) ── */
 function bindTilt(){
  if (isMobile || typeof VanillaTilt === 'undefined') return;
  var targets = document.querySelectorAll('.lcard, .trust-card, .comparison-card, .notice-item, .top5box');
  targets.forEach(function(el){
   if (el._qdTilt) return; el._qdTilt = true;
   VanillaTilt.init(el, {
    max: 4, speed: 400, scale: 1.01,
    glare: true, 'max-glare': 0.08, gyroscope: false
   });
  });
 }

 /* ── 3) ls-card 내부 스포트라이트 (마우스 따라 glow 중심 이동) ── */
 function bindSpotlight(){
  if (isMobile) return;
  var card = document.querySelector('.ls-card');
  if (!card || card._qdSpot) return; card._qdSpot = true;
  card.addEventListener('mousemove', function(e){
   var r = card.getBoundingClientRect();
   card.style.setProperty('--spot-x', ((e.clientX - r.left)/r.width*100).toFixed(1)+'%');
   card.style.setProperty('--spot-y', ((e.clientY - r.top)/r.height*100).toFixed(1)+'%');
  });
 }

 /* ── 4) Gauge scroll reveal (감지 결과 원형 게이지) ── */
 var gaugeObs = new IntersectionObserver(function(entries){
  entries.forEach(function(en){
   if (!en.isIntersecting) return;
   en.target.classList.add('qd-reveal');
   gaugeObs.unobserve(en.target);
  });
 }, {threshold: 0.35});
 function bindGauge(){
  document.querySelectorAll('.gauge-svg').forEach(function(svg){
   if (svg._qdGauge) return; svg._qdGauge = true;
   gaugeObs.observe(svg);
  });
 }

 /* ── 5) 동적으로 생성되는 요소도 잡기 (결과 렌더 후) ── */
 var mo = new MutationObserver(function(){
  bindMagnetic(); bindTilt(); bindSpotlight(); bindGauge();
 });

 function init(){
  bindMagnetic(); bindTilt(); bindSpotlight(); bindGauge();
  mo.observe(document.body, {childList:true, subtree:true});
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
 else init();
})();
