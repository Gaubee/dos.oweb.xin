// 游戏列表页：类型多选筛选 + 固定分页。
import { useMemo, useState } from 'react';
import { useGames } from '@/hooks/use-games';
import { GameGrid } from '@/components/game-grid';
import { Loading, ErrorState } from '@/components/state';
import { TYPE_LABELS } from '@/types/game';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Pagination } from '@/components/pagination';

const TYPES = Object.keys(TYPE_LABELS);
const PAGE_SIZE = 60; // 固定每页 60 条（不允许自定义）

export function GamesPage() {
  const { data, isLoading, error } = useGames();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const toggle = (t: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
    setPage(1); // 筛选变化回第 1 页
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    if (selected.size === 0) return data.games;
    return data.games.filter((g) => {
      const types = g.types ?? [];
      for (const t of selected) {
        if (types.includes(t)) return true;
      }
      return false;
    });
  }, [data, selected]);

  // 分页
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (curPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, curPage]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">游戏列表</h1>
        {selected.size > 0 && (
          <Button size="sm" variant="ghost" onClick={() => { setSelected(new Set()); setPage(1); }}>
            清除筛选
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => toggle(t)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              selected.has(t)
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-accent',
            )}
          >
            {TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {selected.size > 0 ? `已选 ${selected.size} 类，匹配 ` : '共 '}
        {filtered.length} 款
      </p>

      <GameGrid games={pageItems} />

      <Pagination page={curPage} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
