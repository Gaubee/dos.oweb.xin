// 管理后台布局：sticky header（标题 + 导航 + 退出）+ max-w-7xl main。
// 导航项与 router.tsx 路由一一对应；active 态由 TanStack Router Link 自带。
//
// 动画意图（2026-08-10 UI 动画升级）：
//   1. 导航 active 指示器：motion layoutId 实现下划线在导航项间平滑滑动
//   2. 路由页面过渡：Outlet 包 motion.div，pathname 为 key，页面切换淡入 200ms
import { type ReactNode } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Gamepad2, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
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
  // pathname 仅在路径变化时变更（不含 search），作为页面过渡 key，避免筛选时重渲染。
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Gamepad2 className="h-5 w-5" />
            <span className="hidden sm:inline">DOS 游戏管理</span>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) => {
              // 自行计算 active 以驱动 layoutId 指示器（含子路由匹配）。
              const isActive =
                pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Button asChild variant="ghost" size="sm" key={item.to} className="relative">
                  <Link
                    to={item.to}
                    activeProps={{ 'data-active': true }}
                    className="data-[active]:bg-accent data-[active]:text-accent-foreground"
                  >
                    {item.label}
                    {isActive && (
                      <motion.span
                        layoutId="nav-active-indicator"
                        className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                  </Link>
                </Button>
              );
            })}
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
        <motion.div
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}

/** 不带导航的裸布局（用于登录页等全屏页面）。 */
export function BareLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
