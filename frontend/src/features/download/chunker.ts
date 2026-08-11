// Range 分片并发下载器。
//
// 正交意图：
//   1. planChunks —— 把文件切成固定大小分片
//   2. downloadChunk —— 单分片 HTTP Range 请求（含重试）
//   3. ChunkDownloader —— 并发调度，进度回调
//
// 断点续传：已完成的分片（来自 Dexie chunks 表）跳过，只下缺失片。
// 失败重试：单分片最多重试 maxRetries 次，全部失败才抛错。
export interface ChunkPlan {
  idx: number;
  start: number;
  end: number; // inclusive（HTTP Range 右闭）
}

/** 默认分片 8MB（平衡并发度与内存）。大文件分更多片，并行度更好。 */
export const CHUNK_SIZE = 8 * 1024 * 1024;

/** 并发下载数（浏览器对同源并发上限约 6，跨源同理，留余量）。 */
export const DEFAULT_CONCURRENCY = 4;

/** 单分片最大重试次数。 */
const MAX_RETRIES = 3;

/** 把 [0, total) 切成 CHUNK_SIZE 分片。 */
export function planChunks(total: number, chunkSize = CHUNK_SIZE): ChunkPlan[] {
  const chunks: ChunkPlan[] = [];
  for (let start = 0; start < total; start += chunkSize) {
    const end = Math.min(start + chunkSize, total) - 1;
    chunks.push({ idx: chunks.length, start, end });
  }
  // total===0 的边界：返回空数组
  return chunks;
}

/** 下载单分片。失败抛 Error（含重试逻辑）。 */
export async function downloadChunk(
  url: string,
  chunk: ChunkPlan,
  signal: AbortSignal,
  maxRetries = MAX_RETRIES,
): Promise<ArrayBuffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    try {
      const res = await fetch(url, {
        headers: { Range: `bytes=${chunk.start}-${chunk.end}` },
        signal,
        mode: 'cors',
      });
      if (!res.ok && res.status !== 206) {
        throw new Error(`chunk ${chunk.idx} HTTP ${res.status}`);
      }
      return await res.arrayBuffer();
    } catch (err) {
      if (signal.aborted) throw err;
      lastErr = err;
      // 指数退避
      if (attempt < maxRetries) {
        await delay(500 * Math.pow(2, attempt));
      }
    }
  }
  throw new Error(
    `chunk ${chunk.idx} failed after ${maxRetries + 1} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

export interface DownloadProgress {
  /** 已下载字节数 */
  downloaded: number;
  /** 总字节数 */
  total: number;
  /** 已完成分片数 */
  doneChunks: number;
  /** 总分片数 */
  totalChunks: number;
  /** 当前速度（字节/秒） */
  speed: number;
}

export interface ChunkDownloaderOptions {
  url: string;
  total: number;
  chunkSize?: number;
  concurrency?: number;
  /** 已完成分片的 idx 集合（断点续传，跳过这些） */
  completedIdx?: Set<number>;
  signal: AbortSignal;
  /** 每个分片下载完成回调（用于持久化到 Dexie） */
  onChunk?: (chunk: ChunkPlan, data: ArrayBuffer) => void;
  /** 进度回调（节流到 ~4Hz） */
  onProgress?: (p: DownloadProgress) => void;
}

/**
 * 并发下载全部分片，返回按 idx 排序的 ArrayBuffer 数组（调用方负责合并）。
 */
export async function downloadAllChunks(
  opts: ChunkDownloaderOptions,
): Promise<Array<{ chunk: ChunkPlan; data: ArrayBuffer }>> {
  const {
    url,
    total,
    chunkSize = CHUNK_SIZE,
    concurrency = DEFAULT_CONCURRENCY,
    completedIdx,
    signal,
    onChunk,
    onProgress,
  } = opts;

  const allChunks = planChunks(total, chunkSize);
  const pending = allChunks.filter((c) => !completedIdx?.has(c.idx));

  const results: Array<{ chunk: ChunkPlan; data: ArrayBuffer }> = [];
  let downloaded = total - pending.reduce((s, c) => s + (c.end - c.start + 1), 0);
  let doneChunks = allChunks.length - pending.length;
  const totalChunks = allChunks.length;
  const startTime = performance.now();

  const reportProgress = () => {
    if (!onProgress) return;
    const elapsed = (performance.now() - startTime) / 1000;
    const speed = elapsed > 0 ? downloaded / elapsed : 0;
    onProgress({ downloaded, total, doneChunks, totalChunks, speed });
  };

  // 并发调度：简单的工作池
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      if (signal.aborted) return;
      const current = cursor++;
      const chunk = pending[current];
      const data = await downloadChunk(url, chunk, signal);
      results.push({ chunk, data });
      downloaded += chunk.end - chunk.start + 1;
      doneChunks++;
      onChunk?.(chunk, data);
      reportProgress();
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, worker);
  await Promise.all(workers);

  // signal 中止后，results 可能不全，调用方应判断
  results.sort((a, b) => a.chunk.idx - b.chunk.idx);
  return results;
}

/** 合并分片为单个 ArrayBuffer。 */
export function mergeChunks(
  chunks: Array<{ chunk: ChunkPlan; data: ArrayBuffer }>,
  total: number,
): ArrayBuffer {
  const merged = new ArrayBuffer(total);
  const view = new Uint8Array(merged);
  for (const { chunk, data } of chunks) {
    view.set(new Uint8Array(data), chunk.start);
  }
  return merged;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
