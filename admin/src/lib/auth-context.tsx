// 鉴权上下文 + 路由守卫。
// 意图：
//   1. AuthProvider 管理 { authed, check, login, logout }，挂载时自检会话
//   2. useAuth 暴露状态与动作
//   3. RequireAuth 包裹需鉴权路由，未登录跳 /login
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from '@tanstack/react-router';
import { auth } from '@/lib/api';

interface AuthState {
  /** 是否已通过 session 校验（避免闪烁：未校验完成前不跳转） */
  loading: boolean;
  authed: boolean;
  /** 主动重新校验会话 */
  check: () => Promise<boolean>;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await auth.session();
      setAuthed(Boolean(res.authed));
      return Boolean(res.authed);
    } catch {
      setAuthed(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // 挂载时自检一次会话，确认是否已登录（cookie 复用）。
  useEffect(() => {
    void check();
  }, [check]);

  const login = useCallback(async (password: string) => {
    await auth.login(password);
    setAuthed(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      // 即使后端报错也清除本地态，避免卡在登录态。
      setAuthed(false);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ loading, authed, check, login, logout }),
    [loading, authed, check, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 <AuthProvider> 内使用');
  return ctx;
}

/** 路由守卫：未登录跳 /login。登录后统一回 /games（简化，避免 redirect 递归）。 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, authed } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // 只在校验完成且未登录时跳转，且只跳一次
    if (!loading && !authed) {
      void navigate({ to: '/login' });
    }
  }, [loading, authed, navigate]);

  if (loading || !authed) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        正在校验会话…
      </div>
    );
  }
  return <>{children}</>;
}
