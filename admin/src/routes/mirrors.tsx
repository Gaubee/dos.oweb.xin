// 镜像源管理。
// 意图：
//   1. 列表展示所有镜像（id / name / baseUrl / enabled / weight）
//   2. 每行可编辑 + 删除
//   3. 新增按钮
//   4. 保存调 mirrors.set（整体替换）
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { mirrors } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { Mirror } from '@/types';
import { Loading, ErrorState } from '@/components/state';

function newMirror(): Mirror {
  return {
    id: '',
    name: '',
    baseUrl: '',
    enabled: true,
    weight: 1,
  };
}

export function MirrorsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-mirrors'],
    queryFn: () => mirrors.get(),
  });

  // 本地草稿：增删改都先在 draft 上，点保存再整体 PUT。
  const [draft, setDraft] = useState<Mirror[] | null>(null);
  const [savedTip, setSavedTip] = useState(false);

  const initial = data?.mirrors ?? [];
  const list = draft ?? initial;

  const dirty = useMemo(() => {
    if (draft === null) return false;
    return JSON.stringify(draft) !== JSON.stringify(initial);
  }, [draft, initial]);

  const saveMutation = useMutation({
    mutationFn: (m: Mirror[]) => mirrors.set({ mirrors: m }),
    onSuccess: (res) => {
      setDraft(res.mirrors);
      void queryClient.invalidateQueries({ queryKey: ['admin-mirrors'] });
      setSavedTip(true);
      window.setTimeout(() => setSavedTip(false), 3000);
    },
  });

  const update = (index: number, patch: Partial<Mirror>) => {
    const next = list.map((m, i) => (i === index ? { ...m, ...patch } : m));
    setDraft(next);
  };
  const remove = (index: number) => setDraft(list.filter((_, i) => i !== index));
  const add = () => setDraft([...list, newMirror()]);

  if (isLoading) return <Loading />;
  if (error) {
    return (
      <ErrorState message={error instanceof ApiError ? error.message : '加载失败'} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">镜像源</h1>
        <Badge variant="secondary">{list.length} 个</Badge>
        <div className="ml-auto flex items-center gap-2">
          {savedTip && (
            <span className="flex items-center text-sm text-green-600 dark:text-green-400">
              <Check className="mr-1 h-4 w-4" />
              已保存
            </span>
          )}
          <Button variant="outline" size="sm" onClick={add}>
            <Plus className="h-4 w-4" />
            新增镜像
          </Button>
          <Button
            size="sm"
            disabled={!dirty || saveMutation.isPending}
            onClick={() => saveMutation.mutate(list)}
          >
            {saveMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            保存
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">名称</th>
              <th className="px-3 py-2 font-medium">Base URL</th>
              <th className="px-3 py-2 font-medium">权重</th>
              <th className="px-3 py-2 font-medium">启用</th>
              <th className="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((m, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">
                  <Input
                    value={m.id}
                    onChange={(e) => update(i, { id: e.target.value })}
                    className="h-8 w-28 font-mono text-xs"
                    placeholder="mirror-id"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={m.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className="h-8 w-32"
                    placeholder="名称"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={m.baseUrl}
                    onChange={(e) => update(i, { baseUrl: e.target.value })}
                    className="h-8 min-w-[220px] font-mono text-xs"
                    placeholder="https://…"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    value={String(m.weight ?? 0)}
                    onChange={(e) =>
                      update(i, { weight: Number(e.target.value) })
                    }
                    className="h-8 w-20 tabular-nums"
                  />
                </td>
                <td className="px-3 py-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      onChange={(e) => update(i, { enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="text-xs">
                      {m.enabled ? '启用' : '停用'}
                    </span>
                  </label>
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => remove(i)}
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  暂无镜像，点击"新增镜像"添加
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
