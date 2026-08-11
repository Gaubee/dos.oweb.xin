// Dexie 数据库：浏览器本地游戏库。
//
// 正交意图：
//   1. games 表 —— 已下载游戏的完整记录（含 zip ArrayBuffer + 元数据）
//   2. chunks 表 —— 分片下载进度（断点续传）
//   3. meta 表 —— 下载任务实时状态（进度/速度/选中镜像）
//
// 与 emularity 存档库完全独立：emularity 用游戏 identifier 作 IndexedDB 库名存存档，
// 本库用独立的 "dos-oweb-xin-library" 库名存 zip 缓存，互不冲突。
import Dexie, { type Table } from 'dexie';

/** 游戏库记录状态 */
export type GameStatus = 'downloading' | 'ready' | 'error';

/** games 表记录：一条 = 一款已（曾）下载的游戏 */
export interface LibraryGame {
  /** 主键 = 游戏 identifier */
  id: string;
  /** 显示名（冗余存储，列表页免查 API） */
  name: string;
  types?: string[];
  coverUrl?: string;
  /** zip sha256（来自 games.json，用于完整性校验） */
  sha256: string;
  /** 期望文件大小（字节） */
  filesize: number;
  /** emularity 启动所需 */
  executable: string;
  driveType: 'hdd' | 'floppy' | 'cdrom';
  /** 当前状态 */
  status: GameStatus;
  /** 错误信息（status=error 时） */
  error?: string;
  /** 下载完成时间戳（status=ready 时） */
  downloadedAt?: number;
  /** zip 数据（仅 status=ready 时存在） */
  data?: ArrayBuffer;
}

/** chunks 表记录：一个分片的下载状态（断点续传用） */
export interface ChunkRecord {
  /** 复合主键 [gameId+idx] */
  gameId: string;
  idx: number;
  /** 分片在文件中的字节范围 */
  start: number;
  end: number;
  /** 分片数据（已下载） */
  data?: ArrayBuffer;
  /** 分片状态 */
  status: 'pending' | 'done';
}

/** meta 表：单游戏下载任务实时状态 */
export interface DownloadMeta {
  /** 主键 = gameId */
  gameId: string;
  /** 已下载字节数 */
  downloaded: number;
  /** 总字节数 */
  total: number;
  /** 下载速度（字节/秒） */
  speed: number;
  /** 选中的镜像 id */
  mirrorId?: string;
  /** 任务阶段 */
  phase: 'probing' | 'downloading' | 'verifying' | 'paused' | 'done' | 'error';
  /** 更新时间戳 */
  updatedAt: number;
}

class GameLibraryDB extends Dexie {
  games!: Table<LibraryGame, string>;
  chunks!: Table<ChunkRecord, string>;
  meta!: Table<DownloadMeta, string>;

  constructor() {
    super('dos-oweb-xin-library');
    this.version(1).stores({
      // 主键 & 索引：& = 主键，逗号 = 二级索引
      games: 'id, status, name, downloadedAt',
      chunks: '[gameId+idx], gameId, status',
      meta: 'gameId, phase',
    });
  }
}

export const db = new GameLibraryDB();

/** 存储用量估算 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number }> {
  if (navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  }
  return { usage: 0, quota: 0 };
}

/** 删除某游戏的所有数据（游戏记录 + 分片 + 任务元数据） */
export async function deleteGame(gameId: string): Promise<void> {
  await db.transaction('rw', db.games, db.chunks, db.meta, async () => {
    await db.games.delete(gameId);
    await db.chunks.where('gameId').equals(gameId).delete();
    await db.meta.delete(gameId);
  });
}
