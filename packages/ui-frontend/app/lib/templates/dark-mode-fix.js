// Dark mode implementation for generated apps
// This must execute immediately to set up dark mode functionality
;(function() {
  'use strict';

  const THEME_ICONS = {
    light: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 50 50" fill="white"><path d="M 24.90625 3.96875 C 24.863281 3.976563 24.820313 3.988281 24.78125 4 C 24.316406 4.105469 23.988281 4.523438 24 5 L 24 11 C 23.996094 11.359375 24.183594 11.695313 24.496094 11.878906 C 24.808594 12.058594 25.191406 12.058594 25.503906 11.878906 C 25.816406 11.695313 26.003906 11.359375 26 11 L 26 5 C 26.011719 4.710938 25.894531 4.433594 25.6875 4.238281 C 25.476563 4.039063 25.191406 3.941406 24.90625 3.96875 Z M 10.65625 9.84375 C 10.28125 9.910156 9.980469 10.183594 9.875 10.546875 C 9.769531 10.914063 9.878906 11.304688 10.15625 11.5625 L 14.40625 15.8125 C 14.648438 16.109375 15.035156 16.246094 15.410156 16.160156 C 15.78125 16.074219 16.074219 15.78125 16.160156 15.410156 C 16.246094 15.035156 16.109375 14.648438 15.8125 14.40625 L 11.5625 10.15625 C 11.355469 9.933594 11.054688 9.820313 10.75 9.84375 C 10.71875 9.84375 10.6875 9.84375 10.65625 9.84375 Z M 39.03125 9.84375 C 38.804688 9.875 38.59375 9.988281 38.4375 10.15625 L 34.1875 14.40625 C 33.890625 14.648438 33.753906 15.035156 33.839844 15.410156 C 33.925781 15.78125 34.21875 16.074219 34.589844 16.160156 C 34.964844 16.246094 35.351563 16.109375 35.59375 15.8125 L 39.84375 11.5625 C 40.15625 11.265625 40.246094 10.800781 40.0625 10.410156 C 39.875 10.015625 39.460938 9.789063 39.03125 9.84375 Z M 25 15 C 19.484375 15 15 19.484375 15 25 C 15 30.515625 19.484375 35 25 35 C 30.515625 35 35 30.515625 35 25 C 35 19.484375 30.515625 15 25 15 Z M 4.71875 24 C 4.167969 24.078125 3.78125 24.589844 3.859375 25.140625 C 3.9375 25.691406 4.449219 26.078125 5 26 L 11 26 C 11.359375 26.003906 11.695313 25.816406 11.878906 25.503906 C 12.058594 25.191406 12.058594 24.808594 11.878906 24.496094 C 11.695313 24.183594 11.359375 23.996094 11 24 L 5 24 C 4.96875 24 4.9375 24 4.90625 24 C 4.875 24 4.84375 24 4.8125 24 C 4.78125 24 4.75 24 4.71875 24 Z M 38.71875 24 C 38.167969 24.078125 37.78125 24.589844 37.859375 25.140625 C 37.9375 25.691406 38.449219 26.078125 39 26 L 45 26 C 45.359375 26.003906 45.695313 25.816406 45.878906 25.503906 C 46.058594 25.191406 46.058594 24.808594 45.878906 24.496094 C 45.695313 24.183594 45.359375 23.996094 45 24 L 39 24 C 38.96875 24 38.9375 24 38.90625 24 C 38.875 24 38.84375 24 38.8125 24 C 38.78125 24 38.75 24 38.71875 24 Z M 15 33.875 C 14.773438 33.90625 14.5625 34.019531 14.40625 34.1875 L 10.15625 38.4375 C 9.859375 38.679688 9.722656 39.066406 9.808594 39.441406 C 9.894531 39.8125 10.1875 40.105469 10.558594 40.191406 C 10.933594 40.277344 11.320313 40.140625 11.5625 39.84375 L 15.8125 35.59375 C 16.109375 35.308594 16.199219 34.867188 16.039063 34.488281 C 15.882813 34.109375 15.503906 33.867188 15.09375 33.875 C 15.0625 33.875 15.03125 33.875 15 33.875 Z M 34.6875 33.875 C 34.3125 33.941406 34.011719 34.214844 33.90625 34.578125 C 33.800781 34.945313 33.910156 35.335938 34.1875 35.59375 L 38.4375 39.84375 C 38.679688 40.140625 39.066406 40.277344 39.441406 40.191406 C 39.8125 40.105469 40.105469 39.8125 40.191406 39.441406 C 40.277344 39.066406 40.140625 38.679688 39.84375 38.4375 L 35.59375 34.1875 C 35.40625 33.988281 35.148438 33.878906 34.875 33.875 C 34.84375 33.875 34.8125 33.875 34.78125 33.875 C 34.75 33.875 34.71875 33.875 34.6875 33.875 Z M 24.90625 37.96875 C 24.863281 37.976563 24.820313 37.988281 24.78125 38 C 24.316406 38.105469 23.988281 38.523438 24 39 L 24 45 C 23.996094 45.359375 24.183594 45.695313 24.496094 45.878906 C 24.808594 46.058594 25.191406 46.058594 25.503906 45.878906 C 25.816406 45.695313 26.003906 45.359375 26 45 L 26 39 C 26.011719 38.710938 25.894531 38.433594 25.6875 38.238281 C 25.476563 38.039063 25.191406 37.941406 24.90625 37.96875 Z"></path></svg>',
    dark: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>'
  };

  function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    document.body?.setAttribute('data-theme', saved);
    updateThemeToggle(saved);

    if (!document.documentElement.hasAttribute('data-theme')) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  function updateThemeToggle(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? THEME_ICONS.light : THEME_ICONS.dark;
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';

    document.documentElement.classList.add('theme-transitioning');

    document.documentElement.setAttribute('data-theme', next);
    document.body?.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeToggle(next);

    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 300);
  }

  function createThemeToggle() {
    // Always remove existing theme toggle to ensure we have the right one
    const existingToggle = document.getElementById('theme-toggle');
    if (existingToggle) {
      existingToggle.remove();
    }

    // Also remove any other potential theme toggles
    document.querySelectorAll('[onclick*="toggleTheme"], [onclick*="theme"], .theme-toggle, .dark-mode-toggle').forEach(el => {
      if (el.id !== 'theme-toggle') {
        el.remove();
      }
    });

    const btn = document.createElement('button');
    btn.id = 'theme-toggle';
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', 'Toggle theme');
    btn.setAttribute('data-handler-attached', 'true'); // Mark as having handler
    // Set onclick as a property to make it detectable by button utilities
    btn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleTheme();
    };
    // Also add as event listener for redundancy
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleTheme();
    }, true);
    btn.style.cssText = `
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 9999;
      padding: 0;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.3);
      background: rgba(0, 0, 0, 0.5);
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      color: white;
    `;

    // Set initial icon based on current theme
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    btn.innerHTML = currentTheme === 'dark' ? THEME_ICONS.light : THEME_ICONS.dark;

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    });

    btn.addEventListener('mousedown', () => {
      btn.style.transform = 'scale(0.95)';
    });

    btn.addEventListener('mouseup', () => {
      btn.style.transform = 'scale(1.1)';
    });

    document.body.appendChild(btn);
  }

  function injectStyles() {
    if (document.getElementById('dark-mode-fix-styles')) return;

    const style = document.createElement('style');
    style.id = 'dark-mode-fix-styles';
    style.textContent = `
      .theme-transitioning,
      .theme-transitioning * {
        transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease !important;
      }

      .theme-toggle {
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        background: rgba(0, 0, 0, 0.5) !important;
        border: 2px solid rgba(255, 255, 255, 0.2) !important;
      }

      .theme-toggle svg {
        width: 28px !important;
        height: 28px !important;
        min-width: 28px !important;
        min-height: 28px !important;
        display: block;
        color: white !important;
        fill: white !important;
      }

      :root,
      [data-theme="light"] {
        --bg-primary: #ffffff;
        --bg-secondary: #f3f4f6;
        --text-primary: #111827;
        --text-secondary: #6b7280;
        --border: #e5e7eb;
        --accent: #3b82f6;
        --color-bg: #ffffff;
        --color-surface: #f3f4f6;
        --color-text: #111827;
        --color-text-secondary: #6b7280;
      }

      [data-theme="dark"] {
        --bg-primary: #0B0E14;
        --bg-secondary: #151A24;
        --text-primary: #f1f5f9;
        --text-secondary: #94A3B8;
        --border: rgba(255, 255, 255, 0.1);
        --accent: #6366F1;
        --color-bg: #0B0E14;
        --color-surface: #151A24;
        --color-text: #f1f5f9;
        --color-text-secondary: #94A3B8;
      }

      body {
        background: var(--bg-primary) !important;
        color: var(--text-primary) !important;
      }

      body *:not(img) {
        color: inherit;
      }

      h1, h2, h3, h4, h5, h6 {
        color: var(--text-primary) !important;
      }

      p, span, div, section, article, main, aside, nav, header, footer {
        color: var(--text-primary);
      }

      a {
        color: var(--accent);
      }

      button, input, select, textarea {
        color: var(--text-primary);
        background-color: var(--bg-secondary);
      }

      .text, .content, .description, .title, .subtitle, .heading {
        color: var(--text-primary) !important;
      }

      .card, .panel, .modal, .dropdown {
        background: var(--bg-secondary);
        color: var(--text-primary);
      }

      *:not(svg):not(path):not(circle):not(rect)[style*="color: white"],
      *:not(svg):not(path):not(circle):not(rect)[style*="color:#fff"],
      *:not(svg):not(path):not(circle):not(rect)[style*="color: #ffffff"] {
        color: var(--text-primary) !important;
      }

      *:not(svg):not(path):not(circle):not(rect)[style*="color: black"],
      *:not(svg):not(path):not(circle):not(rect)[style*="color:#000"],
      *:not(svg):not(path):not(circle):not(rect)[style*="color: #000000"] {
        color: var(--text-primary) !important;
      }

      img {
        color: initial !important;
        max-width: 100%;
        height: auto;
      }

      /* Ensure SVG icons maintain proper size */
      svg {
        flex-shrink: 0;
      }

      header svg, nav svg, .header svg, .navigation svg {
        width: 24px;
        height: 24px;
        max-width: 24px;
        max-height: 24px;
      }
    `;

    document.head.appendChild(style);
  }

  function initialize() {
    injectStyles();
    initTheme();

    // Remove any existing theme toggles before creating ours
    document.querySelectorAll('#theme-toggle, .theme-toggle, [onclick*="toggleTheme"], [onclick*="theme"]').forEach(el => {
      el.remove();
    });

    createThemeToggle();
    const theme = localStorage.getItem('theme') || 'dark';
    updateThemeToggle(theme);

    document.documentElement.setAttribute('data-theme', theme);
    document.body?.setAttribute('data-theme', theme);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  setTimeout(initialize, 100);
  setTimeout(initialize, 500);
  window.addEventListener('load', initialize);

  const observer = new MutationObserver(() => {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) {
      createThemeToggle();
    } else {
      // Ensure it has our icons
      const theme = localStorage.getItem('theme') || 'dark';
      const expectedIcon = theme === 'dark' ? THEME_ICONS.light : THEME_ICONS.dark;
      if (!toggle.innerHTML.includes('viewBox="0 0 50 50"') && !toggle.innerHTML.includes('M21 12.79A9')) {
        toggle.innerHTML = expectedIcon;
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: false
    });
  }

  window.themeSystem = {
    toggle: toggleTheme,
    init: initialize,
    setTheme: (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      updateThemeToggle(theme);
    }
  };

  // Make toggle function globally available
  window.toggleTheme = toggleTheme;
})();