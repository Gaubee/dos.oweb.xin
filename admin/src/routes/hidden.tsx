// 下架管理页：列出所有 hidden=true 的游戏，支持上架 + 搜索。
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeOff, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { games, ApiError } from '@/lib/api';
import type { RawGame } from '@/types';
import { Loading, ErrorState } from '@/components/state';
import { useToast } from '@/components/ui/toast';

const PAGE_SIZE = 50;

// 简单页码（避免依赖 admin 外的组件）
function SimplePager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-4 text-sm">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</Button>
      <span className="tabular-nums">{page} / {total}</span>
      <Button size="sm" variant="outline" disabled={page >= total} onClick={() => onPage(page + 1)}>下一页</Button>
    </div>
  );
}

export function HiddenPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-games-all'],
    queryFn: () => games.list(),
  });

  const hiddenGames = useMemo(() => {
    if (!data?.games) return [];
    const ql = q.trim().toLowerCase();
    return data.games.filter((g) => g.hidden && (!ql || g.identifier.toLowerCase().includes(ql) || g.name['zh-Hans']?.toLowerCase().includes(ql)));
  }, [data, q]);

  const totalPages = Math.max(1, Math.ceil(hiddenGames.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageItems = hiddenGames.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const restoreMutation = useMutation({
    mutationFn: (id: string) => games.batchHidden([id], false),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-games-all'] });
      toast.success('已上架');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '操作失败'),
  });

  const restoreAllMutation = useMutation({
    mutationFn: () => games.batchHidden(hiddenGames.map((g) => g.identifier), false),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-games-all'] });
      toast.success(`已全部上架（${hiddenGames.length} 款）`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '操作失败'),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={error instanceof ApiError ? error.message : '加载失败'} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">下架管理</h1>
        <Badge variant="secondary">{hiddenGames.length} 款已下架</Badge>
        {hiddenGames.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={restoreAllMutation.isPending}
            onClick={() => restoreAllMutation.mutate()}
          >
            <ArrowUpCircle className="h-4 w-4" />
            全部上架
          </Button>
        )}
      </div>

      <Input
        type="search"
        placeholder="搜索已下架的游戏…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setPage(1); }}
        className="max-w-md"
      />

      {hiddenGames.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
          <EyeOff className="h-8 w-8" />
          <p className="text-sm">暂无下架游戏</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">名称</th>
                  <th className="px-3 py-2 font-medium">Identifier</th>
                  <th className="px-3 py-2 font-medium">有无封面</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((g: RawGame) => (
                  <tr key={g.identifier} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{g.name['zh-Hans'] || g.identifier}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{g.identifier}</td>
                    <td className="px-3 py-2">{g.coverFilename ? '✓' : '✗'}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={restoreMutation.isPending}
                        onClick={() => restoreMutation.mutate(g.identifier)}
                      >
                        <ArrowUpCircle className="h-4 w-4" />
                        上架
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SimplePager page={curPage} total={totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
