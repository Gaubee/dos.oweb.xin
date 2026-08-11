// 推荐游戏配置。
// 意图：
//   1. 左：当前推荐列表（上移/下移排序 + 移除）
//   2. 右：搜索框 + 搜索结果，点击"添加"加入推荐
//   3. 本地编辑，"保存"统一调 featured.set，保存后提示需发布生效
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { featured, games } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { coverUrl as deriveCoverUrl } from '@/types';
import { fuseSearch } from '@/lib/game-search';
import { Loading, ErrorState } from '@/components/state';

export function FeaturedPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-featured'],
    queryFn: () => featured.get(),
  });

  // 本地维护待保存的 identifier 顺序，避免每次拖动都打后端。
  const [draft, setDraft] = useState<string[] | null>(null);
  const [savedTip, setSavedTip] = useState(false);

  const list = draft ?? data?.identifiers ?? [];

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) => featured.set({ identifiers: ids }),
    onSuccess: (res) => {
      setDraft(res.identifiers);
      void queryClient.invalidateQueries({ queryKey: ['admin-featured'] });
      setSavedTip(true);
      window.setTimeout(() => setSavedTip(false), 3000);
    },
  });

  const move = (index: number, dir: -1 | 1) => {
    const next = [...list];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  };
  const remove = (id: string) => setDraft(list.filter((x) => x !== id));
  const add = (id: string) => {
    if (list.includes(id)) return;
    setDraft([...list, id]);
  };

  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(data?.identifiers ?? []);

  if (isLoading) return <Loading />;
  if (error) {
    return (
      <ErrorState message={error instanceof ApiError ? error.message : '加载失败'} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">推荐游戏</h1>
        <span className="text-sm text-muted-foreground">
          共 {list.length} 款
        </span>
        <div className="ml-auto flex items-center gap-2">
          {savedTip && (
            <span className="flex items-center text-sm text-green-600 dark:text-green-400">
              <Check className="mr-1 h-4 w-4" />
              已保存（需发布生效）
            </span>
          )}
          <Button
            onClick={() => saveMutation.mutate(list)}
            disabled={!dirty || saveMutation.isPending}
          >
            {saveMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            保存
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">当前推荐（拖拽排序）</CardTitle>
          </CardHeader>
          <CardContent>
            {list.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无推荐游戏，从右侧添加
              </p>
            ) : (
              <ul className="space-y-1.5">
                {list.map((id, i) => (
                  <li
                    key={id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <span className="w-6 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate font-mono text-sm">
                      {id}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      title="上移"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={i === list.length - 1}
                      onClick={() => move(i, 1)}
                      title="下移"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => remove(id)}
                      title="移除"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <SearchPanel
          excludeIds={list}
          onAdd={add}
        />
      </div>
    </div>
  );
}

function SearchPanel({
  excludeIds,
  onAdd,
}: {
  excludeIds: string[];
  onAdd: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const trimmed = q.trim();
  // 全量加载 + 本地 Fuse 搜索（不再调后端 ?q=，统一用 fuse 索引）
  const { data: allData, isFetching } = useQuery({
    queryKey: ['admin-games-all'],
    queryFn: () => games.list(),
  });
  const results = useMemo(() => {
    if (!trimmed || !allData?.games) return [];
    return fuseSearch(allData.games, trimmed).slice(0, 50); // 限制结果数避免渲染卡顿
  }, [trimmed, allData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">搜索并添加</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="search"
          placeholder="搜索游戏名称或 identifier…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {!trimmed && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            输入关键词搜索游戏
          </p>
        )}
        {isFetching && <Loading label="加载中…" />}
        {trimmed && (
          <ul className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {results.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                无匹配游戏
              </li>
            )}
            {results.map((g) => {
              const added = excludeIds.includes(g.identifier);
              return (
                <li
                  key={g.identifier}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  {deriveCoverUrl(g) ? (
                    <img
                      src={deriveCoverUrl(g)!}
                      alt=""
                      className="h-9 w-12 rounded object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {g.name['zh-Hans'] || g.identifier}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {g.identifier}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={added ? 'secondary' : 'outline'}
                    disabled={added}
                    onClick={() => onAdd(g.identifier)}
                  >
                    {added ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {added ? '已添加' : '添加'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
