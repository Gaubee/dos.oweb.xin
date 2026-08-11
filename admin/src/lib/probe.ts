// 镜像源探测工具：fetch Range:0-1024 提前 close，只读响应头。
//
// 正交意图：仅探测——返回镜像源可用性 + Content-Length + 状态码。
// 不下载完整文件，1KB 后立即 abort。

export interface ProbeResult {
  url: string;
  mirrorId: string;
  ok: boolean;
  status: number;
  /** 服务端报告的文件总大小（从 Content-Range 或 Content-Length 解析） */
  contentLength?: number;
  /** 延迟（毫秒） */
  latency: number;
  error?: string;
}

/**
 * 探测单个 URL：GET Range:0-1024，读到响应头后立即 abort（不传输 body）。
 */
export async function probeUrl(url: string, mirrorId?: string, timeoutMs = 8000): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-1024' },
      signal: controller.signal,
    });
    const latency = performance.now() - start;

    // 立即 abort body 传输（只关心头）
    controller.abort();

    // 从 Content-Range: bytes 0-1024/TOTAL 解析总大小
    const contentRange = res.headers.get('content-range');
    let contentLength: number | undefined;
    if (contentRange) {
      const m = /\/(\d+)$/.exec(contentRange);
      if (m) contentLength = Number(m[1]);
    }

    return {
      url,
      mirrorId: mirrorId ?? '',
      ok: res.ok || res.status === 206,
      status: res.status,
      contentLength,
      latency,
    };
  } catch (err) {
    return {
      url,
      mirrorId: mirrorId ?? '',
      ok: false,
      status: 0,
      latency: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 构造某游戏在各镜像源的下载 URL 列表。
 */
export function buildDownloadUrls(identifier: string, mirrors: Array<{ id: string; baseUrl: string }>): Array<{ mirrorId: string; url: string }> {
  const encoded = encodeURIComponent(identifier);
  return mirrors.map((m) => ({
    mirrorId: m.id,
    url: `${m.baseUrl}/${encoded}.zip`,
  }));
}
