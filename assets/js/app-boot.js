(function () {
  if (window.GP_MAINTENANCE_BLOCKED) {
    document.documentElement.classList.add('design-ready');
    return;
  }

  var v = 'lav-104';
  function script(src, attrs) {
    attrs = attrs || '';
    document.write('<script ' + attrs + ' src="' + src + '"><\/script>');
  }

  script('/assets/js/page-loader.js?v=' + v);
  script('/assets/js/ui-feedback.js?v=' + v);
  script('/assets/js/app-main.js?v=' + v);
  script('/assets/js/main-designs.js?v=' + v);
  script('/assets/js/evasion-flow.js?v=' + v);
  script('/assets/js/app-module.js?v=' + v, 'type="module"');
  script('/assets/js/payment-callbacks.js?v=' + v, 'type="module"');
  script('https://cdn.jsdelivr.net/npm/gsap@3.12.2/dist/gsap.min.js');
  script('https://cdn.jsdelivr.net/npm/vanilla-tilt@1.8.1/dist/vanilla-tilt.min.js');
  script('https://cdn.jsdelivr.net/npm/countup.js@2.8.0/dist/countUp.umd.js');
  script('/assets/js/animations.js?v=' + v);
})();
