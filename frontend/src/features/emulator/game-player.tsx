// GamePlayer：游戏播放区调度器 + 下载控制。
//
// 数据流：
//   查 Dexie → 命中(ready) → 启动模拟器
//           → 未命中 → 显示下载按钮 → 触发引擎 → 进度/校验 → ready → 启动
//
// 全生命周期状态机（AGENTS.md "8 种拓扑状态"）：
//   idle / probing / downloading / verifying / ready / playing / error / paused
import { useState, useCallback } from 'react';
import {
  Download,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Gamepad2,
  Wifi,
  ShieldCheck,
} from 'lucide-react';
import type { GameInfo } from '@/types/game';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatBytes } from '@/lib/utils';
import { useDownload } from '@/features/download/use-download';
import { useGameLibrary } from '@/features/library/use-library';
import { EmulatorCanvas } from './emulator-canvas';
import { PlaycanvasCanvas } from '@/features/playcanvas/playcanvas-canvas';

export function GamePlayer({ game }: { game: GameInfo }) {
  const download = useDownload(game);
  const { meta } = useGameLibrary(game.identifier);
  const [playing, setPlaying] = useState(false);

  const handlePlay = useCallback(() => {
    setPlaying(true);
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      await download.start();
    } catch (err) {
      console.error('下载失败', err);
    }
  }, [download, game.identifier]);

  // 已进入播放态：按引擎分流
  if (playing && (download.ready || download.task?.phase === 'ready')) {
    return game.engine === 'playcanvas'
      ? <PlaycanvasCanvas game={game} />
      : <EmulatorCanvas game={game} />;
  }

  const phase = meta?.phase ?? (download.task?.phase ?? 'idle');
  const progress = meta ?? download.task?.progress;
  const percent =
    progress && progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : 0;

  return (
    <Card className="overflow-hidden">
      {/* 4:3 黑色画布占位 */}
      <div className="relative flex aspect-[4/3] items-center justify-center bg-black text-white/60">
        <CanvasPlaceholder phase={phase} />
      </div>

      {/* 进度条（下载中/校验中显示） */}
      {(phase === 'downloading' || phase === 'verifying' || phase === 'probing') && (
        <div className="border-t bg-muted/30">
          <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {phase === 'probing' && <><Wifi className="h-3 w-3" />探测镜像源…</>}
              {phase === 'downloading' && <><Loader2 className="h-3 w-3 animate-spin" />下载中 {percent}%</>}
              {phase === 'verifying' && <><ShieldCheck className="h-3 w-3" />校验完整性…</>}
            </span>
            {progress && phase === 'downloading' && (
              <span>
                {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
                {progress.speed > 0 && ` · ${formatBytes(progress.speed)}/s`}
              </span>
            )}
          </div>
          <div className="h-1 w-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${phase === 'probing' ? 5 : percent}%` }}
            />
          </div>
        </div>
      )}

      {/* 控制区 */}
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{formatBytes(game.filesize)}</span>
          {download.ready && (
            <Badge variant="secondary">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              已缓存
            </Badge>
          )}
          {download.error && (
            <Badge variant="destructive">
              <XCircle className="mr-1 h-3 w-3" />
              失败
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          {phase === 'idle' && !download.ready && (
            <Button onClick={handleDownload} disabled={!game.hasZip}>
              <Download className="h-4 w-4" />
              {game.hasZip ? '下载游戏' : '无下载资源'}
            </Button>
          )}

          {(phase === 'probing' || phase === 'downloading' || phase === 'verifying') && (
            <Button variant="outline" onClick={download.cancel}>
              取消
            </Button>
          )}

          {download.ready && phase !== 'downloading' && phase !== 'verifying' && (
            <Button onClick={handlePlay}>
              <Play className="h-4 w-4" />
              开始游戏
            </Button>
          )}

          {phase === 'error' && (
            <Button onClick={handleDownload} variant="outline">
              <Download className="h-4 w-4" />
              重试
            </Button>
          )}
        </div>
      </div>

      {/* 错误详情 */}
      {download.error && (
        <div className="border-t bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {download.error}
        </div>
      )}
    </Card>
  );
}

function CanvasPlaceholder({ phase }: { phase: string }) {
  const isBusy = phase === 'probing' || phase === 'downloading' || phase === 'verifying';
  return (
    <div className="text-center">
      {isBusy ? (
        <Loader2 className="mx-auto mb-2 h-10 w-10 animate-spin" />
      ) : (
        <Gamepad2 className="mx-auto mb-2 h-12 w-12" />
      )}
      <p className="text-sm">
        {phase === 'ready' && '游戏已就绪，点击开始'}
        {isBusy && '准备中…'}
        {phase === 'error' && '下载失败'}
        {phase === 'idle' && '点击下方按钮下载游戏'}
      </p>
    </div>
  );
}
