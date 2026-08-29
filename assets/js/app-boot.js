(function () {
  if (window.GP_MAINTENANCE_BLOCKED) {
    document.documentElement.classList.add('design-ready');
    return;
  }

  var v = 'lav-186';
  function script(src, attrs) {
    attrs = attrs || '';
    document.write('<script ' + attrs + ' src="' + src + '"><\/script>');
  }

  script('/assets/js/page-loader.js?v=' + v);
  script('/assets/js/ui-feedback.js?v=' + v);
  script('/assets/js/conversion-flow.js?v=' + v);
  script('/assets/js/detect-presentation.js?v=' + v);
  script('/assets/js/app-main.js?v=' + v);
  script('/assets/js/input-quality.js?v=' + v);
  script('/assets/js/main-designs.js?v=' + v);
  script('/assets/js/landing.js?v=' + v);
  script('/assets/js/evasion-flow.js?v=' + v);
  script('/assets/js/writing-lab.js?v=' + v);
  script('/assets/js/app-module.js?v=' + v, 'type="module"');
  script('/assets/js/payment-callbacks.js?v=' + v, 'type="module"');
  function loadEnhancement(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = resolve;
      el.onerror = reject;
      document.head.appendChild(el);
    });
  }

  function scheduleEnhancements() {
    var run = function () {
      Promise.all([
        loadEnhancement('https://cdn.jsdelivr.net/npm/gsap@3.12.2/dist/gsap.min.js'),
        loadEnhancement('https://cdn.jsdelivr.net/npm/vanilla-tilt@1.8.1/dist/vanilla-tilt.min.js'),
        loadEnhancement('https://cdn.jsdelivr.net/npm/countup.js@2.8.0/dist/countUp.umd.js')
      ]).then(function () {
        return loadEnhancement('/assets/js/animations.js?v=' + v);
      }).catch(function (error) {
        console.warn('Optional visual enhancements were skipped.', error);
      });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1800 });
    else setTimeout(run, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnhancements, { once: true });
  else scheduleEnhancements();
})();
