// 下载引擎状态机：编排 镜像探测 → 分片下载 → 校验 → 持久化。
//
// 正交意图：
//   1. downloadGame —— 下载入口（状态机主流程）
//   2. 任务管理 —— 单例 Map 跟踪进行中任务，防重复下载 + 支持取消
//
// 状态流转：
//   probing (HEAD竞速) → downloading (Range分片并发) → verifying (sha256)
//                       → ready (存Dexie) | error
//
// 断点续传：启动时读 Dexie chunks 表，跳过已完成分片；
//           暂停/中断后重启，已落库的分片不重下。
import { pickMirror, reportDownloadSuccess, reportDownloadFailure, type Mirror } from './mirrors';
import { downloadAllChunks, mergeChunks, planChunks, type DownloadProgress } from './chunker';
import { verifySha256 } from './verify';
import { db, type LibraryGame, type ChunkRecord } from '@/features/library/db';
import type { GameInfo } from '@/types/game';

export type DownloadPhase =
  | 'probing'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'error'
  | 'paused'
  | 'aborted';

export interface DownloadTask {
  gameId: string;
  phase: DownloadPhase;
  progress?: DownloadProgress;
  mirror?: Mirror;
  error?: string;
  /** 用于外部取消 */
  abort: () => void;
  /** 完成时 resolve（成功拿到 ArrayBuffer） */
  done: Promise<ArrayBuffer>;
}

/** 进行中的任务注册表（防重复下载） */
const tasks = new Map<string, DownloadTask>();

/** 查询某游戏是否正在下载 */
export function getTask(gameId: string): DownloadTask | undefined {
  return tasks.get(gameId);
}

/** 取消下载（清理 Dexie 中的半成品 chunks 由调用方决定） */
export function cancelDownload(gameId: string): void {
  tasks.get(gameId)?.abort();
}

/**
 * 下载一款游戏并缓存到 Dexie。
 *
 * @param game 游戏 DTO（含 sha256/filesize/identifier 等）
 * @returns 完整 zip 的 ArrayBuffer（同时已写库）
 *
 * 流程：
 *   1. 命中缓存（Dexie games.status=ready）→ 直接返回 data
 *   2. 去重（已有同 game 任务）→ 复用其 done promise
 *   3. probing：镜像竞速选最快
 *   4. downloading：Range 分片并发，逐片落库（断点续传），进度回流
 *   5. verifying：整体 sha256 校验
 *   6. ready：合并 → 写 games 表（status=ready, data=完整ArrayBuffer）→ 清 chunks 表
 */
export function downloadGame(game: GameInfo): DownloadTask {
  const existing = tasks.get(game.identifier);
  if (existing) return existing;

  const controller = new AbortController();
  let resolveDone!: (ab: ArrayBuffer) => void;
  let rejectDone!: (err: Error) => void;
  const done = new Promise<ArrayBuffer>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  const task: DownloadTask = {
    gameId: game.identifier,
    phase: 'probing',
    abort: () => controller.abort(),
    done,
  };
  tasks.set(game.identifier, task);

  // 异步执行主流程
  runPipeline(game, task, controller, resolveDone, rejectDone).finally(() => {
    // 保留 task 一段时间供查询，最终移除
    setTimeout(() => tasks.delete(game.identifier), 5000);
  });

  return task;
}

async function runPipeline(
  game: GameInfo,
  task: DownloadTask,
  controller: AbortController,
  resolveDone: (ab: ArrayBuffer) => void,
  rejectDone: (err: Error) => void,
): Promise<void> {
  const { identifier, sha256, filesize } = game;
  const setError = (err: string) => {
    task.phase = 'error';
    task.error = err;
    void updateGameRecord(identifier, { status: 'error', error: err });
    void updateMeta(identifier, task, { phase: 'error' });
    rejectDone(new Error(err));
  };

  try {
    // 0. 缓存命中检查
    const cached = await db.games.get(identifier);
    if (cached?.status === 'ready' && cached.data) {
      task.phase = 'ready';
      resolveDone(cached.data);
      return;
    }

    // 1. 写入/更新 library 记录（downloading 态）
    await upsertGameRecord(game, 'downloading');

    // 2. probing：镜像竞速
    task.phase = 'probing';
    await updateMeta(identifier, task, { phase: 'probing' });
    const probes = await pickMirror(identifier, filesize);
    const best = probes.find((p) => p.ok);
    if (!best) {
      const reasons = probes.map((p) => `${p.mirror.id}: ${p.error}`).join('; ');
      setError(`无可用镜像源 (${reasons})`);
      return;
    }
    task.mirror = best.mirror;

    // 3. 读取断点续传：已完成分片
    const completedRecords = await db.chunks.where('gameId').equals(identifier).toArray();
    const completedIdx = new Set(
      completedRecords.filter((c) => c.status === 'done').map((c) => c.idx),
    );

    // 4. downloading：Range 分片并发
    task.phase = 'downloading';
    const url = `${best.mirror.baseUrl}/${encodeURIComponent(identifier)}.zip`;

    const results = await downloadAllChunks({
      url,
      total: filesize,
      signal: controller.signal,
      completedIdx,
      onChunk: async (chunk, data) => {
        // 逐片落库（断点续传基础）
        const record: ChunkRecord = {
          gameId: identifier,
          idx: chunk.idx,
          start: chunk.start,
          end: chunk.end,
          data,
          status: 'done',
        };
        await db.chunks.put(record);
      },
      onProgress: async (p) => {
        task.progress = p;
        await updateMeta(identifier, task, {
          phase: 'downloading',
          downloaded: p.downloaded,
          total: p.total,
          speed: p.speed,
        });
      },
    });

    // 中止检查
    if (controller.signal.aborted) {
      task.phase = 'aborted';
      rejectDone(new DOMException('aborted', 'AbortError'));
      return;
    }

    // 5. verifying：整体 sha256
    task.phase = 'verifying';
    await updateMeta(identifier, task, { phase: 'verifying' });

    // 合并分片（含断点续传从 Dexie 读回的已完成片）
    const allResults = await assembleAllChunks(identifier, results, completedIdx, filesize);
    const merged = mergeChunks(allResults, filesize);

    const ok = await verifySha256(merged, sha256);
    if (!ok) {
      setError(`校验失败：SHA-256 不匹配（期望 ${sha256.slice(0, 12)}…）`);
      return;
    }

    // 6. ready：写完整记录，清理分片表
    task.phase = 'ready';
    const now = Date.now();
    await db.games.put({
      id: identifier,
      name: game.name['zh-Hans'] || game.name['zh-Hant'] || game.name.en || identifier,
      types: game.types,
      coverUrl: game.coverUrl,
      sha256,
      filesize,
      executable: game.executable,
      driveType: game.driveType,
      status: 'ready',
      downloadedAt: now,
      data: merged,
    });
    await db.chunks.where('gameId').equals(identifier).delete();
    await updateMeta(identifier, task, { phase: 'done' });

    // 通知镜像池：此镜像下载成功，重置健康状态
    if (task.mirror?.id) reportDownloadSuccess(task.mirror.id);

    resolveDone(merged);
  } catch (err) {
    if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      task.phase = 'aborted';
      rejectDone(err instanceof Error ? err : new Error(String(err)));
    } else {
      // 通知镜像池：下载失败，加速熔断判定（非用户取消）
      if (task.mirror?.id) reportDownloadFailure(task.mirror.id);
      setError(err instanceof Error ? err.message : String(err));
    }
  }
}

/** 合并本次下载的分片 + Dexie 中已完成的分片（断点续传场景） */
async function assembleAllChunks(
  gameId: string,
  fresh: Array<{ chunk: { idx: number; start: number; end: number }; data: ArrayBuffer }>,
  completedIdx: Set<number>,
  total: number,
): Promise<Array<{ chunk: { idx: number; start: number; end: number }; data: ArrayBuffer }>> {
  if (completedIdx.size === 0) return fresh;
  // 从 Dexie 读回历史分片
  const allChunks = planChunks(total);
  const result: Array<{ chunk: { idx: number; start: number; end: number }; data: ArrayBuffer }> =
    [];
  const freshMap = new Map(fresh.map((f) => [f.chunk.idx, f.data]));

  for (const plan of allChunks) {
    const data = freshMap.get(plan.idx);
    if (data) {
      result.push({ chunk: plan, data });
    } else if (completedIdx.has(plan.idx)) {
      const rec = await db.chunks.get([gameId, plan.idx]);
      if (rec?.data) result.push({ chunk: plan, data: rec.data });
    }
  }
  return result;
}

/** 写入或更新 games 表记录（下载前占位） */
async function upsertGameRecord(game: GameInfo, status: LibraryGame['status']): Promise<void> {
  const existing = await db.games.get(game.identifier);
  await db.games.put({
    id: game.identifier,
    name: game.name['zh-Hans'] || game.name['zh-Hant'] || game.name.en || game.identifier,
    types: game.types,
    coverUrl: game.coverUrl,
    sha256: game.sha256,
    filesize: game.filesize,
    executable: game.executable,
    driveType: game.driveType,
    status,
    error: undefined,
    downloadedAt: existing?.downloadedAt,
    data: existing?.data,
  });
}

async function updateGameRecord(
  gameId: string,
  patch: Partial<LibraryGame>,
): Promise<void> {
  await db.games.update(gameId, patch);
}

async function updateMeta(
  gameId: string,
  task: DownloadTask,
  patch: Partial<{ phase: string; downloaded: number; total: number; speed: number }>,
): Promise<void> {
  await db.meta.put({
    gameId,
    downloaded: patch.downloaded ?? task.progress?.downloaded ?? 0,
    total: patch.total ?? task.progress?.total ?? 0,
    speed: patch.speed ?? task.progress?.speed ?? 0,
    mirrorId: task.mirror?.id,
    phase: patch.phase as DownloadMetaPhase,
    updatedAt: Date.now(),
  });
}

// 避免 import 循环的类型别名
type DownloadMetaPhase = 'probing' | 'downloading' | 'verifying' | 'paused' | 'done' | 'error';
