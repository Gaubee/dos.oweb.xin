// 游戏新增/编辑表单。
// 路由模式：
//   /games/new          → 新增（identifier 可编辑，cover 上传需先保存拿到 id）
//   /games/:id/edit     → 编辑（identifier 只读，可上传/替换封面）
// 意图：
//   1. 表单受控（不引 react-hook-form，保持简单）
//   2. 封面上传：拖拽或点击；编辑模式调 uploadCover，新增模式暂存 File 待保存后上传
//   3. 保存调 games.add / games.update，成功后回列表
//   4. 双列布局：左封面+操作 / 右信息+游戏文件（含镜像源探测）
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Radar,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, games, mirrors as mirrorsApi } from '@/lib/api';
import { TYPE_LABELS, type RawGame, coverUrl as deriveCoverUrl } from '@/types';
import { probeUrl, type ProbeResult } from '@/lib/probe';
import { useToast } from '@/components/ui/toast';
import { cn, formatBytes } from '@/lib/utils';
import { Loading, ErrorState } from '@/components/state';

/** 所有预设类型 key（含 DOS/HTML5，多选 chips 用） */
const ALL_TYPE_KEYS = Object.keys(TYPE_LABELS);

interface FormState {
  identifier: string;
  name_zh: string;
  name_hant: string;
  name_en: string;
  types: string[];
  keywords: string[];
  executable: string;
  sha256: string;
  filesize: string;
  releaseYear: string;
  cdrom: string;
  floppy: string;
}

function emptyForm(): FormState {
  return {
    identifier: '',
    name_zh: '',
    name_hant: '',
    name_en: '',
    types: ['DOS'],
    keywords: [],
    executable: '',
    sha256: '',
    filesize: '',
    releaseYear: '',
    cdrom: '',
    floppy: '',
  };
}

function fromGame(g: RawGame): FormState {
  return {
    identifier: g.identifier,
    name_zh: g.name['zh-Hans'] ?? '',
    name_hant: g.name['zh-Hant'] ?? '',
    name_en: g.name.en ?? '',
    types: g.types ?? ['DOS'],
    keywords: g.keywords ?? [],
    executable: g.executable ?? '',
    sha256: g.sha256 ?? '',
    filesize: g.filesize ? String(g.filesize) : '',
    releaseYear: g.releaseYear ? String(g.releaseYear) : '',
    cdrom: g.cdrom ?? '',
    floppy: g.floppy ?? '',
  };
}

function toGame(f: FormState, base?: RawGame): RawGame {
  const filesize = Number(f.filesize);
  const year = Number(f.releaseYear);
  return {
    identifier: f.identifier.trim(),
    name: {
      'zh-Hans': f.name_zh.trim(),
      ...(f.name_hant.trim() ? { 'zh-Hant': f.name_hant.trim() } : {}),
      ...(f.name_en.trim() ? { en: f.name_en.trim() } : {}),
    },
    executable: f.executable.trim(),
    sha256: f.sha256.trim(),
    filesize: Number.isFinite(filesize) ? filesize : 0,
    ...(f.types.length > 0 ? { types: f.types } : {}),
    ...(f.keywords.length > 0 ? { keywords: f.keywords } : {}),
    ...(f.releaseYear && Number.isFinite(year) ? { releaseYear: year } : {}),
    ...(f.cdrom.trim() ? { cdrom: f.cdrom.trim() } : {}),
    ...(f.floppy.trim() ? { floppy: f.floppy.trim() } : {}),
    // 编辑模式保留后端已有字段（coverFilename / img / links / keymaps / cheats）
    ...(base?.coverFilename ? { coverFilename: base.coverFilename } : {}),
    ...(base?.lqip ? { lqip: base.lqip } : {}),
    ...(base?.types ? { types: base.types } : {}),
    ...(base?.keywords ? { keywords: base.keywords } : {}),
    ...(base?.img ? { img: base.img } : {}),
    ...(base?.links ? { links: base.links } : {}),
    ...(base?.keymaps ? { keymaps: base.keymaps } : {}),
    ...(base?.cheats ? { cheats: base.cheats } : {}),
  };
}

export function GameEditPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const params = useParams({ strict: false });
  const id = params.id as string | undefined;
  const isEdit = Boolean(id);

  const { data: existing, isLoading, error } = useQuery({
    queryKey: ['admin-game', id],
    queryFn: () => games.get(id!),
    enabled: isEdit,
  });

  const [form, setForm] = useState<FormState>(emptyForm());
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 游戏文件卡片折叠态（默认展开）。
  const [filesOpen, setFilesOpen] = useState(true);
  // 镜像源探测结果：mirrorId -> ProbeResult。
  const [probeResults, setProbeResults] = useState<Record<string, ProbeResult>>({});
  const [probing, setProbing] = useState(false);

  // 镜像源（仅展示 enabled 的，用于生成下载链接 + 探测）。
  const mirrorsQuery = useQuery({
    queryKey: ['admin-mirrors'],
    queryFn: () => mirrorsApi.get(),
  });
  const enabledMirrors = mirrorsQuery.data?.mirrors.filter((m) => m.enabled) ?? [];

  // 编辑模式：数据到达后回填表单。
  useEffect(() => {
    if (existing) {
      setForm(fromGame(existing));
      // 封面预览：用 coverFilename 派生（不是 img 字段——那是光盘镜像）
      const url = deriveCoverUrl(existing);
      if (url) setCoverUrl(url);
    }
  }, [existing]);

  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = toGame(form, existing);
      if (isEdit && id) {
        const updated = await games.update(id, payload);
        if (pendingCover) await games.uploadCover(id, pendingCover);
        return updated;
      }
      const created = await games.add(payload);
      if (pendingCover) await games.uploadCover(created.identifier, pendingCover);
      return created;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-games'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-game'] });
      void navigate({ to: '/games' });
    },
  });

  const uploadCoverMutation = useMutation({
    // 编辑模式下立即上传封面（实时预览）。
    mutationFn: (file: File) => games.uploadCover(id!, file),
    onSuccess: (res) => setCoverUrl(res.coverUrl),
  });

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    if (isEdit && id) {
      uploadCoverMutation.mutate(file, {
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : '封面上传失败'),
      });
    } else {
      // 新增模式：本地预览 + 暂存，保存成功后再上传。
      setPendingCover(file);
      setCoverUrl(URL.createObjectURL(file));
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onPickFile(e.dataTransfer.files?.[0]);
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  // 并发探测所有 enabled 镜像的下载可用性。
  const onProbe = async () => {
    if (!form.identifier) return;
    setProbing(true);
    const results: Record<string, ProbeResult> = {};
    await Promise.all(
      enabledMirrors.map(async (m) => {
        const url = `${m.baseUrl}/${encodeURIComponent(form.identifier)}.zip`;
        results[m.id] = await probeUrl(url, m.id);
      }),
    );
    setProbeResults(results);
    setProbing(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(undefined, {
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : '保存失败'),
    });
  };

  const submitting = saveMutation.isPending;
  const uploading = uploadCoverMutation.isPending;

  const title = useMemo(
    () => (isEdit ? '编辑游戏' : '新增游戏'),
    [isEdit],
  );

  // 游戏文件摘要（CardHeader 展示）：可执行文件 · 大小 · 驱动类型
  const driveType = form.cdrom.trim()
    ? 'CD-ROM'
    : form.floppy.trim()
      ? '软盘'
      : '—';
  const filesizeSummary = form.filesize
    ? formatBytes(Number(form.filesize) || 0)
    : '—';
  const fileSummary = `${form.executable || '—'} · ${filesizeSummary} · ${driveType}`;

  if (isEdit && isLoading) return <Loading label="加载游戏数据…" />;
  if (isEdit && error) {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : '加载失败'}
      />
    );
  }

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void navigate({ to: '/games' })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
      )}

      <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* —— 左列：封面 + 操作 —— */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">封面</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 border-dashed transition-colors ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-input hover:border-primary/50'
                }`}
              >
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt="封面预览"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <Upload className="h-6 w-6" />
                    <span className="text-xs">点击或拖拽上传</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
              {uploading && (
                <p className="flex items-center text-xs text-muted-foreground">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  上传中…
                </p>
              )}
              {!isEdit && pendingCover && (
                <p className="text-xs text-muted-foreground">
                  已选择封面，将在保存后上传。
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? '保存修改' : '创建游戏'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void navigate({ to: '/games' })}
              disabled={submitting}
            >
              取消
            </Button>
          </div>
        </div>

        {/* —— 右列：信息 + 游戏文件 —— */}
        <div className="space-y-4">
          {/* 信息 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">信息</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Identifier" required>
                <Input
                  value={form.identifier}
                  onChange={(e) => set('identifier', e.target.value)}
                  disabled={isEdit}
                  placeholder="如：doom"
                  required
                />
              </Field>
              {/* types 多选 chips（一个游戏可有多种类型） */}
              <Field label="类型（可多选）">
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-2 min-h-10">
                  {ALL_TYPE_KEYS.map((t) => {
                    const active = form.types.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          set('types', active ? form.types.filter((x) => x !== t) : [...form.types, t]);
                        }}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                          active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent',
                        )}
                      >
                        {TYPE_LABELS[t] ?? t}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {/* keywords 关键字编辑（用于模糊搜索，与类型不冲突） */}
              <Field label="关键字（用于搜索）">
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-2 min-h-10">
                  {form.keywords.map((t) => (
                    <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-xs">
                      {t}
                      <button
                        type="button"
                        onClick={() => set('keywords', form.keywords.filter((x) => x !== t))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        const v = tagDraft.trim();
                        if (v && !form.keywords.includes(v)) set('keywords', [...form.keywords, v]);
                        setTagDraft('');
                      }
                    }}
                    placeholder="输入后回车添加"
                    className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </Field>

              <Field label="名称（简体中文）" required>
                <Input
                  value={form.name_zh}
                  onChange={(e) => set('name_zh', e.target.value)}
                  required
                />
              </Field>
              <Field label="名称（繁體中文）">
                <Input
                  value={form.name_hant}
                  onChange={(e) => set('name_hant', e.target.value)}
                />
              </Field>
              <Field label="名称（English）">
                <Input
                  value={form.name_en}
                  onChange={(e) => set('name_en', e.target.value)}
                />
              </Field>
              <Field label="发行年份">
                <Input
                  type="number"
                  value={form.releaseYear}
                  onChange={(e) => set('releaseYear', e.target.value)}
                  placeholder="如：1993"
                />
              </Field>
            </CardContent>
          </Card>

          {/* 游戏文件（可折叠；CardHeader 显示摘要） */}
          <Card>
            <CardHeader className="pb-0">
              <button
                type="button"
                onClick={() => setFilesOpen((o) => !o)}
                className="-m-2 flex w-full items-center gap-2 p-2 text-left"
              >
                {filesOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-base">游戏文件</CardTitle>
                  <span className="text-xs font-normal text-muted-foreground">
                    {fileSummary}
                  </span>
                </div>
              </button>
            </CardHeader>
            {filesOpen && (
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="可执行文件" required>
                    <Input
                      value={form.executable}
                      onChange={(e) => set('executable', e.target.value)}
                      placeholder="如：DOOM.EXE"
                      required
                    />
                  </Field>
                  <Field label="文件大小（字节）">
                    <Input
                      type="number"
                      value={form.filesize}
                      onChange={(e) => set('filesize', e.target.value)}
                      placeholder="如：7781808"
                    />
                  </Field>

                  <Field label="SHA256" className="sm:col-span-2">
                    <Input
                      value={form.sha256}
                      onChange={(e) => set('sha256', e.target.value)}
                      className="font-mono text-xs"
                      placeholder="文件校验和（可选）"
                    />
                  </Field>

                  <Field label="CD-ROM 镜像">
                    <Input
                      value={form.cdrom}
                      onChange={(e) => set('cdrom', e.target.value)}
                      placeholder="如：game.cue"
                    />
                  </Field>
                  <Field label="软盘镜像">
                    <Input
                      value={form.floppy}
                      onChange={(e) => set('floppy', e.target.value)}
                      placeholder="如：disk1.img"
                    />
                  </Field>
                </div>

                <div className="border-t" />

                {/* 镜像源下载链接 + 探测 */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">镜像源</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onProbe}
                      disabled={probing || !form.identifier}
                    >
                      {probing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Radar className="h-3 w-3" />
                      )}
                      探测
                    </Button>
                    {mirrorsQuery.isLoading && (
                      <span className="text-xs text-muted-foreground">加载镜像…</span>
                    )}
                  </div>
                  {enabledMirrors.map((m) => {
                    const url = `${m.baseUrl}/${encodeURIComponent(form.identifier)}.zip`;
                    const probe = probeResults[m.id];
                    return (
                      <div key={m.id} className="flex items-center gap-2 text-xs">
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate flex-1 text-primary hover:underline"
                        >
                          <Download className="mr-1 inline h-3 w-3" />
                          {m.name}
                        </a>
                        {probe && (
                          <span
                            className={probe.ok ? 'text-green-600' : 'text-destructive'}
                          >
                            {probe.ok ? `${Math.round(probe.latency)}ms` : '不可用'}
                            {probe.contentLength
                              ? ` · ${(probe.contentLength / 1024 / 1024).toFixed(1)}MB`
                              : ''}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {enabledMirrors.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      暂无启用的镜像源
                    </p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
