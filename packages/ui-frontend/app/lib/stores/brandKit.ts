import { map } from 'nanostores';

// Load initial state from localStorage (browser-safe)
const loadFromLocalStorage = () => {
  if (typeof window === 'undefined') return { pendingBrandKitId: null, dirty: false };

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
