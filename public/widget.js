(function () {
  'use strict';

  // Prevent duplicate execution
  if (window.__CLIENT_AI_WIDGET_LOADED__) return;
  window.__CLIENT_AI_WIDGET_LOADED__ = true;

  function initWidget() {
    // 1. Identify script element and company ID
    var script =
      document.currentScript ||
      document.querySelector('script[data-company-id]');

    if (!script) {
      console.warn('[ClientAI Widget] Unable to locate script tag with data-company-id.');
      return;
    }

    var companyId = script.getAttribute('data-company-id');
    if (!companyId) {
      console.warn('[ClientAI Widget] Missing required data-company-id attribute.');
      return;
    }

    // Determine host origin from script src
    var origin = window.location.origin;
    try {
      if (script.src) {
        var parsed = new URL(script.src);
        origin = parsed.origin;
      }
    } catch (e) {
      // fallback to current origin
    }

    // 2. Create Widget Container
    var containerId = 'client-ai-widget-root';
    if (document.getElementById(containerId)) return;

    var container = document.createElement('div');
    container.id = containerId;
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.width = '76px';
    container.style.height = '76px';
    container.style.zIndex = '2147483647';
    container.style.transition = 'width 0.25s ease, height 0.25s ease, transform 0.2s ease';
    container.style.overflow = 'visible';
    container.style.pointerEvents = 'none';

    // 3. Create Isolated Iframe
    var iframe = document.createElement('iframe');
    iframe.id = 'client-ai-widget-iframe';
    iframe.title = 'AI Discovery Assistant';
    iframe.src = origin + '/widget?companyId=' + encodeURIComponent(companyId);
    iframe.allow = 'clipboard-write';
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.background = 'transparent';
    iframe.style.pointerEvents = 'auto';
    iframe.style.colorScheme = 'none';

    container.appendChild(iframe);
    document.body.appendChild(container);

    // 4. Handle resize and open/close events from iframe
    window.addEventListener('message', function (event) {
      // Validate origin if needed
      if (event.origin !== origin && !origin.includes('localhost')) {
        return;
      }

      var data = event.data;
      if (!data || data.type !== 'WIDGET_RESIZE') return;

      var isOpen = Boolean(data.isOpen);
      var isMobile = window.innerWidth <= 640;

      if (isOpen) {
        if (isMobile) {
          container.style.top = '0';
          container.style.left = '0';
          container.style.right = '0';
          container.style.bottom = '0';
          container.style.width = '100vw';
          container.style.height = '100vh';
          container.style.maxWidth = '100%';
          container.style.maxHeight = '100%';
        } else {
          container.style.top = 'auto';
          container.style.left = 'auto';
          container.style.bottom = '20px';
          container.style.right = '20px';
          container.style.width = '410px';
          container.style.height = '620px';
          container.style.maxWidth = 'calc(100vw - 32px)';
          container.style.maxHeight = 'calc(100vh - 32px)';
        }
      } else {
        container.style.top = 'auto';
        container.style.left = 'auto';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.width = '76px';
        container.style.height = '76px';
      }
    });

    // Handle window resize while open
    window.addEventListener('resize', function () {
      iframe.contentWindow &&
        iframe.contentWindow.postMessage(
          { type: 'HOST_RESIZE', isMobile: window.innerWidth <= 640 },
          '*'
        );
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
