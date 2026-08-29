(function () {
  'use strict';

  var current = null;
  var previousFocus = null;
  var lastTrigger = null;
  var focusSelector = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function visible(dialog) {
    if (!dialog || dialog.hidden) return false;
    var style = window.getComputedStyle(dialog);
    return style.display !== 'none' && style.visibility !== 'hidden' && dialog.getClientRects().length > 0;
  }

  function focusables(dialog) {
    return Array.prototype.slice.call(dialog.querySelectorAll(focusSelector)).filter(function (node) {
      return !node.hidden && node.getClientRects().length > 0;
    });
  }

  function activate(dialog) {
    if (!dialog || dialog.closest('#gpDialogRoot') || current === dialog || !visible(dialog)) return;
    if (current && current !== dialog) deactivate(current, false);
    current = dialog;
    previousFocus = lastTrigger && lastTrigger.isConnected ? lastTrigger : document.activeElement;
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-hidden', 'false');
    document.body.classList.add('gp-modal-open');
    requestAnimationFrame(function () {
      var items = focusables(dialog);
      if (items[0]) items[0].focus({ preventScroll: true });
      else {
        dialog.tabIndex = -1;
        dialog.focus({ preventScroll: true });
      }
    });
  }

  function deactivate(dialog, restore) {
    if (!dialog || current !== dialog) return;
    dialog.setAttribute('aria-hidden', 'true');
    current = null;
    document.body.classList.remove('gp-modal-open');
    if (restore !== false && previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
      var target = previousFocus;
      requestAnimationFrame(function () { target.focus({ preventScroll: true }); });
    }
    previousFocus = null;
  }

  function sync() {
    var open = Array.prototype.find.call(document.querySelectorAll('[role="dialog"]'), function (dialog) {
      return !dialog.closest('#gpDialogRoot') && visible(dialog);
    });
    if (open) activate(open);
    else if (current) deactivate(current, true);
  }

  function requestClose() {
    if (!current) return;
    var close = current.querySelector('[aria-label*="닫기"], [data-modal-close]');
    if (close) close.click();
    else {
      current.hidden = true;
      current.style.display = 'none';
    }
    setTimeout(sync, 0);
  }

  function rememberTrigger(event) {
    var trigger = event.target.closest && event.target.closest('button,a[href],[role="button"]');
    if (trigger && !trigger.closest('[role="dialog"]')) lastTrigger = trigger;
  }

  // Keyboard activation fires click without pointerdown, so remember both paths.
  document.addEventListener('pointerdown', rememberTrigger, true);
  document.addEventListener('click', rememberTrigger, true);

  document.addEventListener('keydown', function (event) {
    if (!current) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    var items = focusables(current);
    if (!items.length) {
      event.preventDefault();
      current.focus();
      return;
    }
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !current.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !current.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }, true);

  new MutationObserver(sync).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'style', 'class', 'aria-hidden']
  });
  sync();
})();
