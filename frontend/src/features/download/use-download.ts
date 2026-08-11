// 下载引擎 React 适配层。
//
// 把命令式的 engine 包装成声明式 hook，供 GamePlayer 使用。
// 进度数据来自 Dexie useLiveQuery（engine 持续写 meta 表）。
import { useCallback, useEffect, useState } from 'react';
import { useGameLibrary } from '@/features/library/use-library';
import { downloadGame, getTask, cancelDownload, type DownloadTask } from './engine';
import type { GameInfo } from '@/types/game';

export interface UseDownload {
  /** 缓存命中（已下载完成，可立即玩） */
  ready: boolean;
  /** 下载中（probing/downloading/verifying） */
  downloading: boolean;
  /** 当前任务（含进度/镜像/错误） */
  task?: DownloadTask;
  /** 错误信息 */
  error?: string;
  /** 触发下载 */
  start: () => Promise<ArrayBuffer | undefined>;
  /** 取消下载 */
  cancel: () => void;
}

export function useDownload(game: GameInfo): UseDownload {
  const { game: libGame, meta, cached } = useGameLibrary(game.identifier);
  const [task, setTask] = useState<DownloadTask | undefined>(() => getTask(game.identifier));
  const [error, setError] = useState<string | undefined>(undefined);

  // 同步 tasks map 的 task 到 state（引擎刚创建时 task 不存在）
  useEffect(() => {
    const t = getTask(game.identifier);
    if (t && t !== task) setTask(t);
  }, [game.identifier, task]);

  // 错误从 library record 或 task 取
  useEffect(() => {
    setError(libGame?.error ?? task?.error);
  }, [libGame?.error, task?.error]);

  const start = useCallback(async () => {
    setError(undefined);
    try {
      const t = downloadGame(game);
      setTask(t);
      const ab = await t.done;
      return ab;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return undefined;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    }
  }, [game]);

  const cancel = useCallback(() => {
    cancelDownload(game.identifier);
  }, [game.identifier]);

  return {
    ready: cached && libGame?.status === 'ready',
    downloading:
      meta?.phase === 'probing' ||
      meta?.phase === 'downloading' ||
      meta?.phase === 'verifying' ||
      (task?.phase === 'probing' ||
        task?.phase === 'downloading' ||
        task?.phase === 'verifying' && !meta),
    task,
    error,
    start,
    cancel,
  };
}
