// 游戏库响应式 hooks。
//
// 基于 dexie-react-hooks 的 useLiveQuery，数据变化时自动重渲染。
// 正交意图：仅查询，不含下载逻辑（下载在 features/download/）。
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LibraryGame, type DownloadMeta } from './db';

/** 查询单游戏的库状态（缓存命中？下载中？） */
export function useGameLibrary(identifier: string): {
  game?: LibraryGame;
  meta?: DownloadMeta;
  cached: boolean; // status === 'ready'
  downloading: boolean; // meta.phase 在下载中
} {
  const game = useLiveQuery(() => db.games.get(identifier), [identifier]);
  const meta = useLiveQuery(() => db.meta.get(identifier), [identifier]);

  const cached = game?.status === 'ready';
  const downloading =
    meta?.phase === 'probing' ||
    meta?.phase === 'downloading' ||
    meta?.phase === 'verifying';

  return { game, meta, cached, downloading };
}

/** 全部游戏库记录（按下载时间倒序） */
export function useLibraryGames(): LibraryGame[] | undefined {
  return useLiveQuery(() => db.games.orderBy('downloadedAt').reverse().toArray());
}

/** 仅已就绪（可玩）的游戏 */
export function useReadyGames(): LibraryGame[] | undefined {
  return useLiveQuery(
    () => db.games.where('status').equals('ready').reverse().sortBy('downloadedAt'),
  );
}

/** 下载进度（用于全局指示器） */
export function useActiveDownloads(): DownloadMeta[] | undefined {
  return useLiveQuery(() =>
    db
      .meta
      .where('phase')
      .anyOf('probing', 'downloading', 'verifying')
      .toArray(),
  );
}
