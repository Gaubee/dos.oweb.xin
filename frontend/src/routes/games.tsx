// 游戏列表页：全部游戏 + 类型多选筛选。
import { useMemo, useState } from 'react';
import { useGames } from '@/hooks/use-games';
import { GameGrid } from '@/components/game-grid';
import { Loading, ErrorState } from '@/components/state';
import { TYPE_LABELS } from '@/types/game';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TYPES = Object.keys(TYPE_LABELS);

export function GamesPage() {
  const { data, isLoading, error } = useGames();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (t: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    if (selected.size === 0) return data.games;
    return data.games.filter((g) => {
      const types = g.types ?? [];
      // 选中类型与游戏类型有交集
      for (const t of selected) {
        if (types.includes(t)) return true;
      }
      return false;
    });
  }, [data, selected]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">游戏列表</h1>
        {selected.size > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
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
      <GameGrid games={filtered} />
    </div>
  );
}
