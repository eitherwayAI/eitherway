import { atom, type WritableAtom } from 'nanostores';
import type { GoogleUser } from '~/lib/auth/google';

export interface AuthState {
  isAuthenticated: boolean;
  user: GoogleUser | null;
  platform: string | null;
}

export class AuthStore {
  isAuthenticated: WritableAtom<boolean> = import.meta.hot?.data.isAuthenticated ?? atom(false);
  user: WritableAtom<GoogleUser | null> = import.meta.hot?.data.user ?? atom(null);
  platform: WritableAtom<string | null> = import.meta.hot?.data.platform ?? atom(null);

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.isAuthenticated = this.isAuthenticated;
      import.meta.hot.data.user = this.user;
      import.meta.hot.data.platform = this.platform;
    }
  }

  login(user: GoogleUser, platform: string) {
    console.log('🔐 AuthStore.login called with:', { user, platform });
    this.user.set(user);
    this.platform.set(platform);
    this.isAuthenticated.set(true);
    console.log('✅ AuthStore.login completed, new state:', this.authState);
  }

  logout() {
    this.user.set(null);
    this.platform.set(null);
    this.isAuthenticated.set(false);
  }

  get authState(): AuthState {
    return {
      isAuthenticated: this.isAuthenticated.get(),
      user: this.user.get(),
      platform: this.platform.get(),
    };
  }
}

export const authStore = new AuthStore();
