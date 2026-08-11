// 发布页。
// 意图：
//   1. 顶部状态卡：phase / 时间 / hook 命令
//   2. 中部：发布按钮（调 publish.trigger），发布中禁用
//   3. 底部：实时日志（subscribeLogs SSE），按 stream 颜色区分
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { publish, hook as hookApi } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { LogLine, PublishPhase } from '@/types';
import { Loading, ErrorState } from '@/components/state';
import { useToast } from '@/components/ui/toast';

const PHASE_LABEL: Record<PublishPhase, string> = {
  idle: '空闲',
  flushing: '刷新缓存',
  publishing: '发布中',
  done: '完成',
  failed: '失败',
};

const PHASE_VARIANT: Record<
  PublishPhase,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  idle: 'secondary',
  flushing: 'outline',
  publishing: 'default',
  done: 'default',
  failed: 'destructive',
};

function formatTime(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('zh-CN', { hour12: false });
}

export function PublishPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-publish-status'],
    queryFn: () => publish.status(),
    // 发布期间更频繁刷新状态。
    refetchInterval: (q) => {
      const phase = q.state.data?.phase;
      return phase === 'publishing' || phase === 'flushing' ? 2000 : 15000;
    },
  });

  const triggerMutation = useMutation({
    mutationFn: () => publish.trigger(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-publish-status'] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : '发布失败'),
  });

  const phase = data?.phase ?? 'idle';
  const inFlight = phase === 'flushing' || phase === 'publishing';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">发布</h1>
      </div>

      <StatusCard
        status={data}
        isLoading={isLoading}
        error={error}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">触发发布</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            size="lg"
            disabled={inFlight || triggerMutation.isPending}
            onClick={() => triggerMutation.mutate()}
          >
            {(inFlight || triggerMutation.isPending) && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            <Play className="h-4 w-4" />
            {inFlight ? '发布中…' : '立即发布'}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            发布将重建游戏数据快照并刷新前端缓存。仅在非发布中状态可触发。
          </p>
        </CardContent>
      </Card>

      <LogsCard active={inFlight} />

      <HookConfigCard />
    </div>
  );
}

function StatusCard({
  status,
  isLoading,
  error,
}: {
  status:
    | {
        phase: PublishPhase;
        startedAt?: number;
        endedAt?: number;
        hook?: string;
        exitCode?: number;
        error?: string;
        progress?: number;
      }
    | undefined;
  isLoading: boolean;
  error: unknown;
}) {
  if (isLoading) return <Loading label="加载状态…" />;
  if (error) {
    return (
      <ErrorState message={error instanceof ApiError ? error.message : '加载失败'} />
    );
  }
  if (!status) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          当前状态
          <Badge variant={PHASE_VARIANT[status.phase]}>
            {PHASE_LABEL[status.phase]}
          </Badge>
          {status.progress !== undefined && (
            <span className="text-sm font-normal text-muted-foreground">
              {Math.round(status.progress * 100)}%
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
        <Row label="开始时间">{formatTime(status.startedAt)}</Row>
        <Row label="结束时间">{formatTime(status.endedAt)}</Row>
        {status.exitCode !== undefined && (
          <Row label="退出码">
            <span
              className={
                status.exitCode === 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-destructive'
              }
            >
              {status.exitCode}
            </span>
          </Row>
        )}
        {status.hook && (
          <Row label="Hook 命令" full>
            <code className="block rounded bg-muted px-2 py-1 font-mono text-xs">
              {status.hook}
            </code>
          </Row>
        )}
        {status.error && (
          <Row label="错误" full>
            <pre className="whitespace-pre-wrap rounded bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive">
              {status.error}
            </pre>
          </Row>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <p className="mb-0.5 text-xs text-muted-foreground">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function LogsCard({ active }: { active: boolean }) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // 始终订阅日志流；订阅成本由后端控制。
  useEffect(() => {
    const unsubscribe = publish.subscribeLogs((line) => {
      setLogs((prev) => {
        // 保留最近 1000 行，防内存膨胀。
        const next = [...prev, line];
        return next.length > 1000 ? next.slice(-1000) : next;
      });
    });
    return unsubscribe;
  }, []);

  // 新日志到达时自动滚动到底部。
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Terminal className="h-4 w-4" />
          实时日志
          {active && (
            <span className="flex items-center text-xs font-normal text-muted-foreground">
              <span className="mr-1 h-2 w-2 animate-pulse rounded-full bg-green-500" />
              直播中
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="h-80 overflow-y-auto rounded bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[color-mix(in_srgb,currentColor,transparent)]"
        >
          {logs.length === 0 ? (
            <p className="text-zinc-500">等待日志输出…</p>
          ) : (
            logs.map((l, i) => <LogRow key={i} line={l} />)
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LogRow({ line }: { line: LogLine }) {
  const color =
    line.stream === 'stderr'
      ? 'text-red-400'
      : line.stream === 'system'
        ? 'text-blue-400'
        : 'text-zinc-200';
  const prefix =
    line.stream === 'stderr' ? '[err] ' : line.stream === 'system' ? '[sys] ' : '';
  const time = new Date(line.time).toLocaleTimeString('zh-CN', { hour12: false });
  return (
    <div className="whitespace-pre-wrap break-all">
      <span className="text-zinc-500">{time} </span>
      <span className={color}>
        {prefix}
        {line.line}
      </span>
    </div>
  );
}

// —— 发布 Hook 配置卡片 ——
function HookConfigCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['hook-config'],
    queryFn: hookApi.get,
  });
  const [commandHook, setCommandHook] = useState('');
  const [webHook, setWebHook] = useState('');
  const [host, setHost] = useState('');
  const [packageDist, setPackageDist] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();

  // 数据到达后回填
  useEffect(() => {
    if (data && !loaded) {
      setCommandHook(data.commandHook ?? '');
      setWebHook(data.webHook ?? '');
      setHost(data.host ?? '');
      setPackageDist(data.packageDist ?? false);
      setLoaded(true);
    }
  }, [data, loaded]);

  const saveMutation = useMutation({
    mutationFn: () => hookApi.set({
      commandHook: commandHook.trim(),
      webHook: webHook.trim(),
      host: host.trim(),
      packageDist,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hook-config'] });
      toast.success('Hook 配置已保存');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '保存失败'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">发布 Hook 配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Command Hook（本地命令）</label>
              <Input
                value={commandHook}
                onChange={(e) => setCommandHook(e.target.value)}
                placeholder="如：bash deploy.sh  或  cd frontend && pnpm build && rsync -a dist/ /var/www/game/"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                发布时在项目根目录执行此命令（bash -c）。用于构建前端 + 部署到静态服务器。
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Web Hook（HTTP POST 回调）</label>
              <Input
                value={webHook}
                onChange={(e) => setWebHook(e.target.value)}
                placeholder="如：https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/xxx"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                发布时 POST 通知此 URL（body 含 event/dataDir/downloadUrl/sha256）。用于触发 CDN 部署或 CI 流水线。
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">后端外部地址（Host）</label>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="如：https://admin.game.oweb.xin（留空用 localhost:PORT）"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                用于拼接下载链接的外部可访问地址。留空则默认 localhost:PORT。
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="packageDist"
                checked={packageDist}
                onChange={(e) => setPackageDist(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="packageDist" className="text-sm font-medium">
                发布时压缩前端项目（frontend/dist → zip）
              </label>
            </div>
            {packageDist && (
              <p className="text-xs text-muted-foreground">
                发布时将 frontend/dist 压缩为 zip，计算 sha256 作为下载 token，
                生成受保护的下载链接（/storage/downloads/xxx.zip?token=sha256）。
                下载链接和 sha256 会包含在 webHook 的 body 中。
              </p>
            )}

            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              保存配置
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}