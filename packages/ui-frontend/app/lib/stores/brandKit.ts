import { map } from 'nanostores';

const loadFromLocalStorage = () => {
  if (typeof window === 'undefined') return { pendingBrandKitId: null, dirty: false };

  // Detect page refresh using sessionStorage marker
  // sessionStorage clears on page reload but persists during SPA navigation
  const pageSessionMarker = sessionStorage.getItem('brandKitPageSession');
  const isPageRefresh = !pageSessionMarker;

  if (isPageRefresh) {
    // Mark this session so subsequent loads don't clear the state
    sessionStorage.setItem('brandKitPageSession', 'active');

    // Clear any temporary brand kit data on page refresh
    // Temporary brand kits should NOT persist across page reloads
    console.log('[brandKitStore] Page refresh detected - clearing temporary brand kit from localStorage');
    localStorage.removeItem('brandKitState');

    return { pendingBrandKitId: null, dirty: false };
  }

  // Not a page refresh - load from localStorage normally
  try {
    const stored = localStorage.getItem('brandKitState');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        pendingBrandKitId: parsed.pendingBrandKitId || null,
        dirty: parsed.dirty || false,
      };
    }
  } catch (error) {
    console.warn('Failed to load brand kit state from localStorage:', error);
  }

  return { pendingBrandKitId: null, dirty: false };
};

export const brandKitStore = map<{
  pendingBrandKitId: string | null;
  dirty: boolean;
}>(loadFromLocalStorage());

// Subscribe to changes and persist to localStorage
if (typeof window !== 'undefined') {
  brandKitStore.subscribe((state) => {
    try {
      localStorage.setItem('brandKitState', JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save brand kit state to localStorage:', error);
    }
  });
}
