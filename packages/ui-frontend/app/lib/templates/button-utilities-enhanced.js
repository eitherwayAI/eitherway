/**
 * Enhanced Universal Button Utilities - Fixes dropdown positioning and footer button issues
 * Automatically included in all generated apps
 */

// Initialize on DOM load and setup mutation observer
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initializeButtonUtilities);
  // Also run after a short delay to catch any delayed renders
  setTimeout(initializeButtonUtilities, 1000);
}

function initializeButtonUtilities() {
  // Initialize all systems
  attachDefaultHandlers();
  createFeedbackContainer();
  setupNavigationHandling();
  fixDropdownPositioning();
  setupMutationObserver();
  createFeedbackStyles();
}

// ===========================================
// ENHANCED DROPDOWN POSITIONING FIX
// ===========================================
function fixDropdownPositioning() {
  // Fix all select elements and custom dropdowns
  const selects = document.querySelectorAll('select, .dropdown, .select-wrapper, [data-dropdown]');

  selects.forEach((element) => {
    const parent = element.parentElement;

    // Ensure parent has proper positioning context
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    // Fix custom dropdown menus
    const dropdownMenu = element.querySelector('.dropdown-menu, .dropdown-content, .options, .select-options');
    if (dropdownMenu) {
      dropdownMenu.style.position = 'absolute';
      dropdownMenu.style.zIndex = '9999';
      dropdownMenu.style.top = '100%';
      dropdownMenu.style.left = '0';
      dropdownMenu.style.minWidth = '100%';

      // Ensure dropdown appears on top
      element.style.position = 'relative';
      element.style.zIndex = '100';
    }
  });

  // Add global click handler for custom dropdowns
  document.addEventListener('click', (e) => {
    const dropdown = e.target.closest('.dropdown, .select-wrapper, [data-dropdown]');

    if (dropdown) {
      e.stopPropagation();
      const menu = dropdown.querySelector('.dropdown-menu, .dropdown-content, .options, .select-options');

      if (menu) {
        const isOpen = menu.style.display === 'block';

        // Close all other dropdowns
        document.querySelectorAll('.dropdown-menu, .dropdown-content, .options, .select-options').forEach((m) => {
          if (m !== menu) m.style.display = 'none';
        });

        // Toggle current dropdown
        menu.style.display = isOpen ? 'none' : 'block';

        // Ensure dropdown is visible in viewport
        if (!isOpen) {
          const rect = menu.getBoundingClientRect();
          const viewportHeight = window.innerHeight;

          if (rect.bottom > viewportHeight) {
            menu.style.bottom = '100%';
            menu.style.top = 'auto';
          } else {
            menu.style.top = '100%';
            menu.style.bottom = 'auto';
          }
        }
      }
    } else {
      // Close all dropdowns when clicking outside
      document.querySelectorAll('.dropdown-menu, .dropdown-content, .options, .select-options').forEach((m) => {
        m.style.display = 'none';
      });
    }
  });
}

// ===========================================
// MUTATION OBSERVER FOR DYNAMIC ELEMENTS
// ===========================================
function setupMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            // Element node
            // Re-run handlers for new elements
            setTimeout(() => {
              attachDefaultHandlers();
              fixDropdownPositioning();
            }, 100);
          }
        });
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ===========================================
// ENHANCED DEFAULT BUTTON HANDLERS
// ===========================================
function attachDefaultHandlers() {
  // Handle ALL buttons, including those with empty onclick
  const buttons = document.querySelectorAll(
    'button, a[href="#"], a[href=""], a:not([href]), [role="button"], .btn, .button',
  );

  buttons.forEach((element) => {
    // Skip if element already has a real handler
    if (element.onclick && element.onclick.toString().includes('function')) {
      return;
    }

    const text = element.textContent?.toLowerCase() || '';
    const href = element.getAttribute('href')?.toLowerCase() || '';
    const className = element.className?.toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';

    // Footer & Social Media buttons
    if (text.includes('twitter') || className.includes('twitter') || href.includes('twitter')) {
      element.onclick = (e) => {
        e.preventDefault();
        showToast('Opening Twitter...', 'info');
        window.open('https://twitter.com', '_blank');
      };
    } else if (text.includes('facebook') || className.includes('facebook') || href.includes('facebook')) {
      element.onclick = (e) => {
        e.preventDefault();
        showToast('Opening Facebook...', 'info');
        window.open('https://facebook.com', '_blank');
      };
    } else if (text.includes('linkedin') || className.includes('linkedin') || href.includes('linkedin')) {
      element.onclick = (e) => {
        e.preventDefault();
        showToast('Opening LinkedIn...', 'info');
        window.open('https://linkedin.com', '_blank');
      };
    } else if (text.includes('instagram') || className.includes('instagram') || href.includes('instagram')) {
      element.onclick = (e) => {
        e.preventDefault();
        showToast('Opening Instagram...', 'info');
        window.open('https://instagram.com', '_blank');
      };
    } else if (text.includes('github') || className.includes('github') || href.includes('github')) {
      element.onclick = (e) => {
        e.preventDefault();
        showToast('Opening GitHub...', 'info');
        window.open('https://github.com', '_blank');
      };
    } else if (text.includes('youtube') || className.includes('youtube') || href.includes('youtube')) {
      element.onclick = (e) => {
        e.preventDefault();
        showToast('Opening YouTube...', 'info');
        window.open('https://youtube.com', '_blank');
      };
    }
    // Footer navigation links
    else if (text.includes('privacy') || text.includes('policy')) {
      element.onclick = (e) => {
        e.preventDefault();
        showModal({
          title: 'Privacy Policy',
          content:
            '<p>Your privacy is important to us. This application does not collect any personal data.</p><p>All data is stored locally in your browser.</p>',
        });
      };
    } else if (text.includes('terms') || text.includes('service')) {
      element.onclick = (e) => {
        e.preventDefault();
        showModal({
          title: 'Terms of Service',
          content:
            '<p>By using this application, you agree to use it responsibly.</p><p>This is a demo application for educational purposes.</p>',
        });
      };
    } else if (text.includes('contact')) {
      element.onclick = (e) => {
        e.preventDefault();
        showModal({
          title: 'Contact Us',
          content: `
            <form>
              <div class="form-group">
                <label>Email</label>
                <input type="email" class="input" placeholder="your@email.com" />
              </div>
              <div class="form-group">
                <label>Message</label>
                <textarea class="input" rows="4" placeholder="Your message..."></textarea>
              </div>
            </form>
          `,
          footer:
            "<button class=\"btn btn-primary\" onclick=\"showToast('Message sent!', 'success'); closeModal(this.closest('.modal-overlay').id)\">Send</button>",
        });
      };
    } else if (text.includes('about')) {
      element.onclick = (e) => {
        e.preventDefault();
        navigateTo('about');
      };
    }
    // Navigation buttons
    else if (text.includes('home')) {
      element.onclick = (e) => {
        e.preventDefault();
        navigateTo('home');
      };
    } else if (text.includes('profile')) {
      element.onclick = (e) => {
        e.preventDefault();
        navigateTo('profile');
      };
    } else if (text.includes('settings')) {
      element.onclick = (e) => {
        e.preventDefault();
        navigateTo('settings');
      };
    } else if (text.includes('dashboard')) {
      element.onclick = (e) => {
        e.preventDefault();
        navigateTo('dashboard');
      };
    }
    // Action buttons
    else if (text.includes('save')) {
      element.onclick = (e) => {
        e.preventDefault();
        handleSaveAction(element);
      };
    } else if (text.includes('delete')) {
      element.onclick = (e) => {
        e.preventDefault();
        handleDeleteAction(element);
      };
    } else if (text.includes('edit')) {
      element.onclick = (e) => {
        e.preventDefault();
        handleEditAction(element);
      };
    } else if (text.includes('create') || text.includes('add') || text.includes('new')) {
      element.onclick = (e) => {
        e.preventDefault();
        handleCreateAction(element);
      };
    } else if (text.includes('submit') || text.includes('send')) {
      element.onclick = (e) => {
        e.preventDefault();
        handleFormSubmit(element);
      };
    } else if (text.includes('cancel') || text.includes('close')) {
      element.onclick = (e) => {
        e.preventDefault();
        handleCancelAction(element);
      };
    } else if (text.includes('download')) {
      element.onclick = (e) => {
        e.preventDefault();
        showToast('Download starting...', 'info');
      };
    } else if (text.includes('upload')) {
      element.onclick = (e) => {
        e.preventDefault();
        showToast('Opening file selector...', 'info');
      };
    } else if (text.includes('share')) {
      element.onclick = (e) => {
        e.preventDefault();
        handleShareAction(element);
      };
    } else if (text.includes('like') || className.includes('like')) {
      element.onclick = (e) => {
        e.preventDefault();
        handleLikeAction(element);
      };
    } else if (text.includes('follow')) {
      element.onclick = (e) => {
        e.preventDefault();
        handleFollowAction(element);
      };
    } else if (text.includes('subscribe')) {
      element.onclick = (e) => {
        e.preventDefault();
        showToast('Subscribed successfully!', 'success');
        if (element.tagName === 'BUTTON') {
          element.textContent = 'Subscribed';
          element.disabled = true;
        }
      };
    }
    // Default handler for any other clickable element
    else if (!element.onclick) {
      element.onclick = (e) => {
        e.preventDefault();
        const displayText = element.textContent.trim() || 'Button';
        showToast(`"${displayText}" clicked`, 'info');
        // Add visual feedback
        element.style.transform = 'scale(0.95)';
        setTimeout(() => (element.style.transform = ''), 100);
      };
    }
  });

  // Also handle clickable divs and spans
  document.querySelectorAll('[onclick=""], .clickable, .card, .item').forEach((element) => {
    if (!element.onclick || element.onclick.toString() === 'function onclick(event) {\n\n}') {
      element.style.cursor = 'pointer';
      element.onclick = () => {
        showToast('Item clicked', 'info');
        element.style.transform = 'scale(0.98)';
        setTimeout(() => (element.style.transform = ''), 100);
      };
    }
  });
}

// ===========================================
// ENHANCED FEEDBACK STYLES
// ===========================================
function createFeedbackStyles() {
  if (document.getElementById('buttonUtilStyles')) return;

  const style = document.createElement('style');
  style.id = 'buttonUtilStyles';
  style.textContent = `
    /* Enhanced Dropdown Positioning Fixes */
    .dropdown, .select-wrapper, [data-dropdown] {
      position: relative !important;
    }

    .dropdown-menu, .dropdown-content, .options, .select-options {
      position: absolute !important;
      z-index: 9999 !important;
      background: var(--color-surface, #fff) !important;
      border: 1px solid var(--color-border, #ddd) !important;
      border-radius: 8px !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
      max-height: 300px !important;
      overflow-y: auto !important;
      display: none;
    }

    .dropdown-menu.show, .dropdown-content.show, .options.show, .select-options.show {
      display: block !important;
    }

    /* Ensure dropdowns appear above other content */
    .dropdown:focus-within {
      z-index: 1000 !important;
    }

    /* Fix select element styling */
    select {
      position: relative !important;
      z-index: 1 !important;
      background: var(--color-surface, #fff) !important;
      cursor: pointer !important;
    }

    /* Footer link styling */
    footer a, .footer a {
      cursor: pointer !important;
      transition: opacity 0.2s !important;
    }

    footer a:hover, .footer a:hover {
      opacity: 0.8 !important;
    }

    /* Clickable element feedback */
    [role="button"], .btn, .button, .clickable {
      cursor: pointer !important;
      transition: transform 0.1s ease !important;
    }

    [role="button"]:active, .btn:active, .button:active, .clickable:active {
      transform: scale(0.95) !important;
    }

    /* Toast Container */
    .toast-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }

    .toast {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(147, 51, 234, 0.9));
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 250px;
      max-width: 400px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
      pointer-events: all;
    }

    .toast.show {
      opacity: 1;
      transform: translateX(0);
    }

    .toast.toast-success {
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(16, 185, 129, 0.9));
    }

    .toast.toast-error {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9));
    }

    .toast.toast-warning {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.9), rgba(217, 119, 6, 0.9));
    }

    .toast-close {
      margin-left: auto;
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.2s;
    }

    .toast-close:hover {
      opacity: 1;
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.2s ease;
      padding: 20px;
    }

    .modal-content {
      background: var(--color-surface, #1a1a2e);
      color: var(--color-text, white);
      border-radius: 16px;
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: slideUp 0.3s ease;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }

    .modal-header {
      padding: 24px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .modal-title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }

    .modal-close {
      background: none;
      border: none;
      color: var(--color-text, white);
      font-size: 28px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s;
      line-height: 1;
      padding: 0;
      width: 32px;
      height: 32px;
    }

    .modal-close:hover {
      opacity: 1;
    }

    .modal-body {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .modal-footer {
      padding: 20px 24px;
      border-top: 1px solid rgba(255,255,255,0.1);
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    /* Loading Overlay */
    .loading-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      animation: fadeIn 0.2s ease;
    }

    .loading-content {
      text-align: center;
      color: white;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(255,255,255,0.2);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }

    .loading-message {
      font-size: 1.1rem;
      opacity: 0.9;
    }

    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Form Groups */
    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      opacity: 0.9;
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 10px 12px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: inherit;
      font-size: 1rem;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: var(--color-primary, #3b82f6);
      background: rgba(255,255,255,0.08);
    }
  `;

  document.head.appendChild(style);
}

// ===========================================
// CORE FUNCTIONALITY (kept from original)
// ===========================================

function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  if (duration > 0) {
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return toast;
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function createFeedbackContainer() {
  createFeedbackStyles();
  createToastContainer();
}

function showModal(options) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = options.id || `modal-${Date.now()}`;

  modal.innerHTML = `
    <div class="modal-content ${options.size || 'medium'}">
      <div class="modal-header">
        <h2 class="modal-title">${options.title || 'Notice'}</h2>
        <button class="modal-close" onclick="closeModal('${modal.id}')">×</button>
      </div>
      <div class="modal-body">
        ${options.content || ''}
      </div>
      ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal.id);
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal(modal.id);
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  return modal;
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('closing');
    setTimeout(() => {
      modal.remove();
      if (!document.querySelector('.modal-overlay')) {
        document.body.style.overflow = '';
      }
    }, 200);
  }
}

function showLoadingOverlay(message = 'Loading...') {
  hideLoadingOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'loadingOverlay';
  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-content">
      <div class="spinner"></div>
      <p class="loading-message">${message}</p>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 200);
  }
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;

  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText || 'Processing...';
    button.disabled = true;
    button.classList.add('loading');
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.classList.remove('loading');
    delete button.dataset.originalText;
  }
}

// Navigation Handler
function navigateTo(section) {
  const allSections = document.querySelectorAll('[data-section], .section, .view, .page');
  const targetSection = document.querySelector(`[data-section="${section}"], #${section}, .${section}-section`);

  if (targetSection) {
    allSections.forEach((s) => (s.style.display = 'none'));
    targetSection.style.display = 'block';
    window.location.hash = `#${section}`;
    showToast(`Navigated to ${section}`, 'success');
  } else {
    showToast(`${section} section coming soon!`, 'info');
  }
}

function setupNavigationHandling() {
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const section = document.querySelector(`[data-section="${hash}"], #${hash}`);
      if (section) {
        document.querySelectorAll('[data-section], .section, .view').forEach((s) => {
          s.style.display = 'none';
        });
        section.style.display = 'block';
      }
    }
  });

  if (window.location.hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

// Action Handlers
function handleFormSubmit(button) {
  setButtonLoading(button, true, 'Submitting...');

  setTimeout(() => {
    const form = button.closest('form');
    if (form) {
      const formData = new FormData(form);
      const data = Object.fromEntries(formData);
      localStorage.setItem('formData', JSON.stringify(data));
      showToast('Form submitted successfully!', 'success');
      form.reset();
    } else {
      showToast('Submitted successfully!', 'success');
    }
    setButtonLoading(button, false);
  }, 1500);
}

function handleSaveAction(button) {
  setButtonLoading(button, true, 'Saving...');

  setTimeout(() => {
    const form = button.closest('form');
    if (form) {
      const formData = new FormData(form);
      const data = Object.fromEntries(formData);
      localStorage.setItem('savedData', JSON.stringify(data));
    }

    setButtonLoading(button, false);
    showToast('Changes saved successfully!', 'success');
  }, 1000);
}

function handleDeleteAction(button) {
  showModal({
    title: 'Confirm Deletion',
    content:
      '<p>Are you sure you want to delete this item?</p><p class="text-sm opacity-75">This action cannot be undone.</p>',
    footer: `
      <button class="btn btn-danger" onclick="confirmDelete(this)">Delete</button>
      <button class="btn btn-secondary" onclick="closeModal(this.closest('.modal-overlay').id)">Cancel</button>
    `,
  });
}

function confirmDelete(button) {
  setButtonLoading(button, true, 'Deleting...');

  setTimeout(() => {
    closeModal(button.closest('.modal-overlay').id);
    showToast('Item deleted successfully', 'success');
  }, 800);
}

function handleEditAction(button) {
  showModal({
    title: 'Edit Item',
    content: `
      <form>
        <div class="form-group">
          <label>Title</label>
          <input type="text" class="input" value="Current Title" required>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea class="input" rows="4">Current description...</textarea>
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-primary" onclick="showToast('Changes saved!', 'success'); closeModal(this.closest('.modal-overlay').id)">Save</button>
      <button class="btn btn-secondary" onclick="closeModal(this.closest('.modal-overlay').id)">Cancel</button>
    `,
  });
}

function handleCreateAction(button) {
  showModal({
    title: 'Create New Item',
    content: `
      <form>
        <div class="form-group">
          <label>Title</label>
          <input type="text" class="input" placeholder="Enter title..." required>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea class="input" rows="4" placeholder="Enter description..."></textarea>
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-primary" onclick="showToast('Item created!', 'success'); closeModal(this.closest('.modal-overlay').id)">Create</button>
      <button class="btn btn-secondary" onclick="closeModal(this.closest('.modal-overlay').id)">Cancel</button>
    `,
  });
}

function handleCancelAction(button) {
  const modal = button.closest('.modal-overlay');
  if (modal) {
    closeModal(modal.id);
  } else {
    showToast('Cancelled', 'info');
  }
}

function handleShareAction(button) {
  if (navigator.share) {
    navigator
      .share({
        title: 'Check this out!',
        text: 'I found something interesting',
        url: window.location.href,
      })
      .then(() => {
        showToast('Shared successfully!', 'success');
      })
      .catch(() => {
        showToast('Share cancelled', 'info');
      });
  } else {
    showToast('Link copied to clipboard!', 'success');
    navigator.clipboard.writeText(window.location.href);
  }
}

function handleLikeAction(button) {
  const isLiked = button.classList.contains('liked');

  if (isLiked) {
    button.classList.remove('liked');
    showToast('Like removed', 'info');
  } else {
    button.classList.add('liked');
    showToast('Liked!', 'success');

    // Animate heart
    const heart = document.createElement('span');
    heart.textContent = '❤️';
    heart.style.cssText = `
      position: absolute;
      animation: float-up 1s ease-out forwards;
      pointer-events: none;
    `;
    button.appendChild(heart);
    setTimeout(() => heart.remove(), 1000);
  }
}

function handleFollowAction(button) {
  const isFollowing = button.textContent.toLowerCase().includes('following');

  if (isFollowing) {
    button.textContent = 'Follow';
    showToast('Unfollowed', 'info');
  } else {
    button.textContent = 'Following';
    showToast('Following!', 'success');
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showToast,
    showModal,
    closeModal,
    showLoadingOverlay,
    hideLoadingOverlay,
    setButtonLoading,
    navigateTo,
    fixDropdownPositioning,
  };
}

// Make functions globally available
window.buttonUtils = {
  showToast,
  showModal,
  closeModal,
  showLoadingOverlay,
  hideLoadingOverlay,
  setButtonLoading,
  navigateTo,
  fixDropdownPositioning,
};
