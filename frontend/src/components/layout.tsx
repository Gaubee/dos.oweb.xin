// 全局布局：顶部导航 + 搜索 + 内容区。
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Gamepad2, Search, Library, Home, List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function Layout({ children }: { children: ReactNode }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

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
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">首页</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/games">
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">游戏列表</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/library">
                <Library className="h-4 w-4" />
                <span className="hidden sm:inline">我的游戏库</span>
              </Link>
            </Button>
          </nav>

          <form onSubmit={onSearch} className="ml-auto flex w-full max-w-xs gap-2">
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
