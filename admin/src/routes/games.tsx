// 游戏管理列表：搜索 + 多选筛选(type/tags) + 分页 + 封面(blurhash 占位)。
//
// 正交意图：
//   1. 数据查询（useQuery，全量返回，前端过滤+分页）
//   2. 筛选（搜索关键词 + type 多选 + tags 多选，URL search 持久化）
//   3. 分页（每页 size 可调 10~100 步长 10）
//   4. 表格（封面用 BlurhashImage 修复，不再误用 img 字段）
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { games, ApiError } from '@/lib/api';
import { TYPE_LABELS, type RawGame, coverUrl } from '@/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { fuseSearch, pinyinCompare, resetFuseIndex } from '@/lib/game-search';
import { formatBytes, cn } from '@/lib/utils';
import { Loading, ErrorState } from '@/components/state';
import { BlurhashImage } from '@/components/blurhash-image';
import { Gamepad2 } from 'lucide-react';

const DEBOUNCE_MS = 300;
const PAGE_SIZES = Array.from({ length: 10 }, (_, i) => (i + 1) * 10); // 10..100
const ALL_TYPES = Object.keys(TYPE_LABELS);

interface FilterState {
  q: string;
  types: string[];   // 选中的 type 值（多选）
  keywords: string[]; // 选中的 keyword 值（多选）
  page: number;      // 从 1 开始
  size: number;      // 每页数量
}

export function GamesListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  // URL search 作为筛选状态来源（可分享/可回退）
  const search = useSearch({ strict: false }) as Partial<FilterState>;

  // 本地输入态（debounce 后写回 URL）
  const [q, setQ] = useState(search.q ?? '');
  const [tagInput, setTagInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RawGame | null>(null);

  const filters: FilterState = {
    q: search.q ?? '',
    types: parseArray(search.types),
    keywords: parseArray(search.keywords),
    page: search.page ?? 1,
    size: search.size ?? 20,
  };

  // q debounce 写回 URL
  useEffect(() => {
    const handle = setTimeout(() => {
      if ((search.q ?? '') !== q) {
        void updateSearch({ q, page: 1 });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // 查询全量数据（后端返回全部，前端过滤+分页）
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-games-all'],
    queryFn: () => games.list(),
  });

  // 从全部数据收集所有出现过的 keywords（供筛选 chip）
  const allKeywords = useMemo(() => {
    if (!data?.games) return [];
    const set = new Set<string>();
    for (const g of data.games) {
      if (g.keywords) g.keywords.forEach((t) => set.add(t));
    }
    return Array.from(set).sort();
  }, [data]);

  // Fuse 搜索（有查询词时）+ types/keywords 筛选 + 拼音排序
  const filtered = useMemo(() => {
    if (!data?.games) return [];
    const ql = filters.q.trim();

    // 第一步：搜索（Fuse 索引，O(1)）。无查询词时用全量。
    const searched = ql ? fuseSearch(data.games, ql) : data.games;

    // 第二步：types/keywords 筛选
    const result = searched.filter((g) => {
      if (filters.types.length > 0) {
        const gt = g.types ?? [];
        if (!filters.types.some((t) => gt.includes(t))) return false;
      }
      if (filters.keywords.length > 0) {
        const gk = g.keywords ?? [];
        if (!filters.keywords.some((t) => gk.includes(t))) return false;
      }
      return true;
    });

    // 第三步：拼音排序
    return result.sort((a, b) =>
      pinyinCompare(a.name['zh-Hans'] || a.identifier, b.name['zh-Hans'] || b.identifier),
    );
  }, [data, filters.q, filters.types, filters.keywords]);

  // 分页
  const totalPages = Math.max(1, Math.ceil(filtered.length / filters.size));
  const curPage = Math.min(filters.page, totalPages);
  const pageItems = useMemo(() => {
    const start = (curPage - 1) * filters.size;
    return filtered.slice(start, start + filters.size);
  }, [filtered, curPage, filters.size]);

  const queryClient = useQueryClient();
  const removeMutation = useMutation({
    mutationFn: (id: string) => games.remove(id),
    onSuccess: () => {
      resetFuseIndex(); // 数据变更后重建索引
      void queryClient.invalidateQueries({ queryKey: ['admin-games-all'] });
    },
  });

  // —— 筛选操作 ——
  const updateSearch = (patch: Partial<FilterState>) => {
    const next = { ...filters, ...patch };
    void navigate({
      to: '/games',
      search: {
        ...(next.q ? { q: next.q } : {}),
        ...(next.types.length ? { types: next.types } : {}),
        ...(next.keywords.length ? { keywords: next.keywords } : {}),
        page: next.page,
        size: next.size,
      },
    });
  };

  const toggleType = (t: string) => {
    const has = filters.types.includes(t);
    updateSearch({
      types: has ? filters.types.filter((x) => x !== t) : [...filters.types, t],
      page: 1,
    });
  };

  const toggleKeyword = (t: string) => {
    const has = filters.keywords.includes(t);
    updateSearch({
      keywords: has ? filters.keywords.filter((x) => x !== t) : [...filters.keywords, t],
      page: 1,
    });
  };

  const addCustomKeyword = () => {
    const t = tagInput.trim();
    if (t && !filters.keywords.includes(t)) {
      updateSearch({ keywords: [...filters.keywords, t], page: 1 });
    }
    setTagInput('');
  };

  const onDelete = (g: RawGame) => {
    setDeleteTarget(g); // 打开确认对话框
  };
  const confirmDelete = () => {
    if (!deleteTarget) return;
    removeMutation.mutate(deleteTarget.identifier, {
      onSuccess: () => toast.success(`已删除「${deleteTarget.name['zh-Hans'] || deleteTarget.identifier}」`),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : '删除失败'),
    });
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      {/* 标题 + 操作 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">游戏管理</h1>
        <Badge variant="secondary">{filtered.length} 款 / 共 {data?.total ?? 0}</Badge>
        <Button size="sm" className="ml-auto" onClick={() => void navigate({ to: '/games/new' })}>
          <Plus className="h-4 w-4" /> 新增游戏
        </Button>
      </div>

      {/* 搜索框 */}
      <Input
        type="search"
        placeholder="搜索游戏名称或 identifier…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />

      {/* type 多选 chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">类型：</span>
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              filters.types.includes(t)
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-accent',
            )}
          >
            {TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      {/* keywords 多选 chips + 自定义输入 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">关键字：</span>
        {allKeywords.map((t) => (
          <button
            key={t}
            onClick={() => toggleKeyword(t)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              filters.keywords.includes(t)
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-accent',
            )}
          >
            {t}
          </button>
        ))}
        {/* 已激活的自定义 keyword（不在数据里但被选中筛选） */}
        {filters.keywords.filter((t) => !allKeywords.includes(t)).map((t) => (
          <button
            key={t}
            onClick={() => toggleKeyword(t)}
            className="rounded-full border border-primary bg-primary px-2.5 py-0.5 text-xs text-primary-foreground"
          >
            {t}
          </button>
        ))}
        {/* 自定义 keyword 输入 */}
        <Input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomKeyword(); } }}
          placeholder="自定义关键字…"
          className="h-7 w-32 text-xs"
        />
      </div>

      {/* 已选筛选条件清除 */}
      {(filters.types.length > 0 || filters.keywords.length > 0 || filters.q) && (
        <Button size="sm" variant="ghost" onClick={() => { setQ(''); updateSearch({ q: '', types: [], keywords: [], page: 1 }); }}>
          <X className="h-3 w-3" /> 清除筛选
        </Button>
      )}

      {/* 表格 */}
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : '加载失败'} />
      ) : (
        <GamesTable games={pageItems} onDelete={onDelete} onEdit={(g) => void navigate({ to: '/games/$id/edit', params: { id: g.identifier } })} />
      )}

      {/* 分页器 */}
      {filtered.length > 0 && (
        <Pagination
          page={curPage}
          totalPages={totalPages}
          size={filters.size}
          onPage={(p) => updateSearch({ page: p })}
          onSize={(s) => updateSearch({ size: s, page: 1 })}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="确认删除"
        description={<>确认删除「{deleteTarget?.name['zh-Hans'] || deleteTarget?.identifier}」？此操作不可撤销。</>}
        confirmText="删除"
        variant="destructive"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// —— 表格 ——

function GamesTable({
  games: list,
  onDelete,
  onEdit,
}: {
  games: RawGame[];
  onDelete: (g: RawGame) => void;
  onEdit: (g: RawGame) => void;
}) {
  if (list.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        暂无游戏
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">封面</th>
            <th className="px-3 py-2 font-medium">名称</th>
            <th className="px-3 py-2 font-medium">Identifier</th>
            <th className="px-3 py-2 font-medium">类型/标签</th>
            <th className="px-3 py-2 font-medium">大小</th>
            <th className="px-3 py-2 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {list.map((g, i) => {
            const url = coverUrl(g);
            return (
              <tr
                key={g.identifier}
                className="border-t hover:bg-muted/30"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <td className="px-3 py-2">
                  {url ? (
                    <BlurhashImage
                      src={url}
                      blurhash={g.coverBlurhash}
                      aspect="3/2"
                      alt={g.name['zh-Hans'] || g.identifier}
                      className="h-12 w-20 rounded"
                    />
                  ) : (
                    <div className="flex h-12 w-20 items-center justify-center rounded bg-muted text-muted-foreground">
                      <Gamepad2 className="h-4 w-4" />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 font-medium">
                  {g.name['zh-Hans'] || g.identifier}
                  {g.engine === 'playcanvas' && (
                    <span className="ml-1 text-xs text-blue-500">PC</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {g.identifier}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {g.types?.map((t) => (
                      <Badge key={t} variant={t === 'DOS' ? 'secondary' : 'outline'} className="text-xs">
                        {TYPE_LABELS[t] ?? t}
                      </Badge>
                    ))}
                    {g.keywords?.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {g.filesize ? formatBytes(g.filesize) : '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="编辑" onClick={() => onEdit(g)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="删除" onClick={() => onDelete(g)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// —— 分页器 ——

function Pagination({
  page,
  totalPages,
  size,
  onPage,
  onSize,
}: {
  page: number;
  totalPages: number;
  size: number;
  onPage: (p: number) => void;
  onSize: (s: number) => void;
}) {
  // 生成页码：1 ... cur-1 cur cur+1 ... totalPages
  const pages = useMemo(() => {
    const out: (number | string)[] = [];
    const window = 1; // 当前页左右各显示几个
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - window && i <= page + window)) {
        out.push(i);
      } else if (out[out.length - 1] !== '...') {
        out.push('...');
      }
    }
    return out;
  }, [page, totalPages]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>每页</span>
        <select
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
          className="h-8 rounded border bg-background px-2 text-sm"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span>条 · 第 {page}/{totalPages} 页</span>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
          ) : (
            <Button
              key={p}
              size="sm"
              variant={p === page ? 'default' : 'outline'}
              className="h-8 w-8 p-0"
              onClick={() => onPage(p as number)}
            >
              {p}
            </Button>
          ),
        )}
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// —— 工具 ——

/** URL search 里的数组参数兼容 string | string[] */
function parseArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') return v.split(',').filter(Boolean);
  return [];
}
