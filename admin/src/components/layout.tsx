// 管理后台布局：sticky header（标题 + 导航 + 退出）+ max-w-7xl main。
// 导航项与 router.tsx 路由一一对应；active 态由 TanStack Router Link 自带。
import { type ReactNode } from 'react';
import { Link, Outlet } from '@tanstack/react-router';
import { Gamepad2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

const NAV: { to: string; label: string }[] = [
  { to: '/games', label: '游戏管理' },
  { to: '/featured', label: '推荐' },
  { to: '/types', label: '类型' },
  { to: '/mirrors', label: '镜像源' },
  { to: '/publish', label: '发布' },
];

export function Layout() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Gamepad2 className="h-5 w-5" />
            <span className="hidden sm:inline">DOS 游戏管理</span>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <Button asChild variant="ghost" size="sm" key={item.to}>
                <Link
                  to={item.to}
                  activeProps={{ 'data-active': true }}
                  className="data-[active]:bg-accent data-[active]:text-accent-foreground"
                >
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>

          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">退出</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

/** 不带导航的裸布局（用于登录页等全屏页面）。 */
export function BareLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
