// 类型管理：跨游戏批量管理 types[] + 客户端自定义标签。
//
// 正交意图：
//   1. 数据查询（games.list 全量，前端聚合 type key 计数）
//   2. 类型标签解析（TYPE_LABELS 预设 + customLabels 客户端覆盖，localStorage 持久）
//   3. 批量变更（重命名标签 / 删除 / 合并 → useMutation 逐游戏 games.update）
//   4. 新增类型（写入 customLabels，0 游戏时占位以便后续在编辑页分配）
//
// 妥协声明（不可拆分原因：后端数据模型限制）：
//   后端无独立"类型注册表"，类型仅存在于各 game.types[]。因此：
//   - "重命名标签 / 新增类型" 只持久化在客户端 localStorage
//   - "删除 / 合并" 直接改各 game.types[]，服务端持久
//
// 不使用 window.prompt/confirm/alert（IAB/webview 禁用原生弹窗），全部内联 UI。
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, GitMerge, Loader2, Plus, Trash2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, games } from '@/lib/api';
import { TYPE_LABELS, type RawGame } from '@/types';
import { Loading, ErrorState } from '@/components/state';
import { cn } from '@/lib/utils';

const CUSTOM_LABELS_KEY = 'admin.type-custom-labels.v1';

function loadCustomLabels(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CUSTOM_LABELS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function saveCustomLabels(map: Record<string, string>): void {
  try { localStorage.setItem(CUSTOM_LABELS_KEY, JSON.stringify(map)); } catch { /* */ }
}

export function TypesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-games-all'],
    queryFn: () => games.list(),
  });

  const [customLabels, setCustomLabels] = useState<Record<string, string>>(loadCustomLabels);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  // 内联编辑/确认状态（替代 window.prompt/confirm）
  const [editingKey, setEditingKey] = useState<string | null>(null); // 正在重命名的 key
  const [editValue, setEditValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // 正在确认删除的 key
  const [mergeOpen, setMergeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const allGames = data?.games ?? [];
  const labelOf = (key: string) => customLabels[key] ?? TYPE_LABELS[key] ?? key;

  const allKeys = useMemo(() => {
    const set = new Set<string>();
    for (const g of allGames) (g.types ?? []).forEach((t) => set.add(t));
    Object.keys(customLabels).forEach((k) => set.add(k));
    return Array.from(set).sort();
  }, [allGames, customLabels]);

  const countOf = (key: string) => allGames.filter((g) => g.types?.includes(key)).length;

  const persistCustom = (next: Record<string, string>) => {
    setCustomLabels(next);
    saveCustomLabels(next);
  };

  const flash = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  const batchMutation = useMutation({
    mutationFn: async (updates: RawGame[]) => {
      for (const g of updates) await games.update(g.identifier, g);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-games-all'] }),
    onError: (err) => flash(err instanceof ApiError ? err.message : '操作失败'),
  });
  const busy = batchMutation.isPending;

  // —— 操作 ——

  /** 重命名标签：点击编辑 → inline input → 保存 */
  const startRename = (key: string) => {
    setEditingKey(key);
    setEditValue(labelOf(key));
    setConfirmDelete(null);
  };
  const confirmRename = () => {
    if (!editingKey) return;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === labelOf(editingKey)) {
      setEditingKey(null);
      return;
    }
    persistCustom({ ...customLabels, [editingKey]: trimmed });
    setEditingKey(null);
    flash(`「${editingKey}」标签已改为「${trimmed}」`);
  };

  /** 删除：从所有游戏移除 */
  const doDelete = (key: string) => {
    const updates = allGames
      .filter((g) => g.types?.includes(key))
      .map((g) => ({ ...g, types: (g.types ?? []).filter((t) => t !== key) }));
    const next = { ...customLabels };
    delete next[key];
    batchMutation.mutate(updates, {
      onSuccess: () => {
        persistCustom(next);
        setConfirmDelete(null);
        flash(`「${key}」已删除`);
      },
    });
  };

  /** 新增类型 */
  const onAdd = () => {
    const key = newKey.trim();
    if (!key) return;
    if (allKeys.includes(key)) { flash(`类型「${key}」已存在`); return; }
    persistCustom({ ...customLabels, [key]: newLabel.trim() || key });
    setNewKey(''); setNewLabel(''); setAddOpen(false);
    flash(`已新增类型「${key}」`);
  };

  /** 合并 */
  const onMerge = () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) return;
    const updates = allGames
      .filter((g) => g.types?.includes(mergeSource))
      .map((g) => {
        const types = (g.types ?? []).filter((t) => t !== mergeSource);
        if (!types.includes(mergeTarget)) types.push(mergeTarget);
        return { ...g, types };
      });
    const next = { ...customLabels };
    delete next[mergeSource];
    batchMutation.mutate(updates, {
      onSuccess: () => {
        persistCustom(next);
        setMergeSource(''); setMergeTarget(''); setMergeOpen(false);
        flash(`「${mergeSource}」已合并到「${mergeTarget}」`);
      },
    });
  };

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={error instanceof ApiError ? error.message : '加载失败'} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">类型管理</h1>
        <Badge variant="secondary">{allKeys.length} 个</Badge>
        {busy && (
          <span className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="mr-1 h-4 w-4 animate-spin" /> 处理中…
          </span>
        )}
        {feedback && <span className="text-sm text-primary">{feedback}</span>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">类型列表</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {/* 类型表 */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Key</th>
                  <th className="px-3 py-2 font-medium">标签</th>
                  <th className="px-3 py-2 font-medium">游戏数</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {allKeys.map((key) => {
                  const count = countOf(key);
                  const isPreset = key in TYPE_LABELS;
                  const isCustom = key in customLabels;
                  const isEditing = editingKey === key;
                  const isConfirming = confirmDelete === key;
                  return (
                    <tr key={key} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{key}</td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <span className="flex items-center gap-1">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditingKey(null); }}
                              className="h-7 w-32 text-sm"
                              autoFocus
                            />
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={confirmRename}><Check className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingKey(null)}><X className="h-3.5 w-3.5" /></Button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            {labelOf(key)}
                            {isCustom && <Badge variant="outline" className="text-[10px]">自定义</Badge>}
                            {isPreset && !isCustom && <Badge variant="secondary" className="text-[10px]">预设</Badge>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{count}</td>
                      <td className="px-3 py-2">
                        {isConfirming ? (
                          <span className="flex items-center justify-end gap-1.5 text-xs">
                            <span className="text-destructive">确认删除？</span>
                            <Button size="sm" variant="destructive" className="h-7" onClick={() => doDelete(key)} disabled={busy}>确认</Button>
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmDelete(null)}>取消</Button>
                          </span>
                        ) : !isEditing ? (
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="重命名标签" onClick={() => startRename(key)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="删除" onClick={() => { setConfirmDelete(key); setEditingKey(null); }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {allKeys.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">暂无类型</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 新增类型（折叠式） */}
          <div className="border-t pt-4">
            <button type="button" className="flex items-center gap-2 text-sm font-medium mb-2" onClick={() => setAddOpen(o => !o)}>
              <Plus className={cn('h-4 w-4 transition-transform', addOpen && 'rotate-90')} /> 新增类型
            </button>
            {addOpen && (
              <div className="flex flex-wrap items-center gap-2">
                <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="key（如：MUG）" className="h-9 w-40 font-mono text-sm" />
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="标签（如：格斗）" className="h-9 w-40 text-sm" />
                <Button size="sm" onClick={onAdd} disabled={!newKey.trim()}><Check className="h-4 w-4" /> 添加</Button>
                <p className="w-full text-xs text-muted-foreground">新增类型仅保存在浏览器，需在编辑页分配给游戏后才会出现在数据中。</p>
              </div>
            )}
          </div>

          {/* 合并类型（折叠式） */}
          <div className="border-t pt-4">
            <button type="button" className="flex items-center gap-2 text-sm font-medium mb-2" onClick={() => setMergeOpen(o => !o)}>
              <GitMerge className={cn('h-4 w-4 transition-transform', mergeOpen && 'rotate-90')} /> 合并类型
            </button>
            {mergeOpen && (
              <div className="flex flex-wrap items-center gap-2">
                <select value={mergeSource} onChange={(e) => setMergeSource(e.target.value)} className="h-9 rounded border bg-background px-2 text-sm">
                  <option value="">源类型…</option>
                  {allKeys.map((k) => <option key={k} value={k}>{k} · {labelOf(k)}</option>)}
                </select>
                <span className="text-muted-foreground">→</span>
                <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} className="h-9 rounded border bg-background px-2 text-sm">
                  <option value="">目标类型…</option>
                  {allKeys.map((k) => <option key={k} value={k}>{k} · {labelOf(k)}</option>)}
                </select>
                <Button size="sm" onClick={onMerge} disabled={busy || !mergeSource || !mergeTarget || mergeSource === mergeTarget}>
                  <GitMerge className="h-4 w-4" /> 合并
                </Button>
                <p className="w-full text-xs text-muted-foreground">合并会把所有游戏中源类型替换为目标类型，不可撤销。</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
