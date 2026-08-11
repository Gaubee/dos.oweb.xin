// 全局布局：顶部导航 + 搜索 + 内容区。
//
// 动效意图（叠加层，不改动既有数据流）：
//   1. 导航 active 指示器：motion layoutId 下划线在选中项之间平滑滑动；
//   2. 搜索框聚焦：容器 max-width 展开（克制的 CSS 过渡）。
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { Gamepad2, Search, Home, List, Library, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface NavItem {
  to: '/' | '/games' | '/library';
  label: string;
  icon: LucideIcon;
  /** 当前路由是否命中此导航项 */
  match: (pathname: string) => boolean;
}

// `as const` 保证 `to` 为字面量联合，TanStack Router Link 强类型校验通过。
const NAV_ITEMS = [
  { to: '/', label: '首页', icon: Home, match: (p: string) => p === '/' },
  { to: '/games', label: '游戏列表', icon: List, match: (p: string) => p.startsWith('/games') },
  { to: '/library', label: '我的游戏库', icon: Library, match: (p: string) => p.startsWith('/library') },
] satisfies NavItem[];

// 指示器近临界阻尼 spring：滑动利落、几乎无回弹，符合“克制”。
const UNDERLINE_TRANSITION = { type: 'spring', stiffness: 500, damping: 35 } as const;

export function Layout({ children }: { children: ReactNode }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed) {
      navigate({ to: '/search', search: { q: trimmed } });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Gamepad2 className="h-6 w-6" />
            <span className="hidden sm:inline">中文 DOS 游戏</span>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            {NAV_ITEMS.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <Button asChild variant="ghost" size="sm" key={item.to} className="relative">
                  <Link to={item.to}>
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                    {active && (
                      <motion.span
                        layoutId="nav-active-underline"
                        transition={UNDERLINE_TRANSITION}
                        className="absolute inset-x-2 bottom-1 h-0.5 rounded-full bg-foreground"
                      />
                    )}
                  </Link>
                </Button>
              );
            })}
          </nav>

          <form
            onSubmit={onSearch}
            className="ml-auto flex w-full max-w-xs gap-2 transition-[max-width] duration-200 ease-[var(--ease-out)] focus-within:max-w-sm"
          >
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索游戏名称"
              className="h-9"
            />
            <Button type="submit" size="icon" variant="outline" className="h-9 w-9 shrink-0">
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
