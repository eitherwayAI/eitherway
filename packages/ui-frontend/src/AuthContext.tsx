import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  userId: string | null;
  authMethod: 'password' | 'wallet' | null;
  login: (method: 'password' | 'wallet', userId: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<'password' | 'wallet' | null>(null);

  // Check for existing authentication on mount
  useEffect(() => {
    const storedUserId = localStorage.getItem('auth_userId');
    const storedMethod = localStorage.getItem('auth_method') as 'password' | 'wallet' | null;

    if (storedUserId && storedMethod) {
      setUserId(storedUserId);
      setAuthMethod(storedMethod);
      setIsAuthenticated(true);
    }
  }, []);

  const login = (method: 'password' | 'wallet', newUserId: string) => {
    setUserId(newUserId);
    setAuthMethod(method);
    setIsAuthenticated(true);
    localStorage.setItem('auth_userId', newUserId);
    localStorage.setItem('auth_method', method);
  };

  const logout = () => {
    // Clear cached DB user ID before clearing userId
    if (userId) {
      localStorage.removeItem(`db_user_id_${userId}`);
    }

    setUserId(null);
    setAuthMethod(null);
    setIsAuthenticated(false);
    localStorage.removeItem('auth_userId');
    localStorage.removeItem('auth_method');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, userId, authMethod, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
