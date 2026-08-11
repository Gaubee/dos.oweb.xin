// Admin API 客户端。
// 对接 Go 后端 /api/* 与 /api/admin/*，带 cookie 鉴权（credentials: include）。
import type { RawGame, Featured, MirrorConfig, PublishStatus, LogLine } from '@/types';

const BASE = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin', // 同源请求（dev 由 vite proxy 转 Go，prod 同域）
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
    } catch {
      // 非 JSON 错误
    }
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

// ———— 鉴权 ————
export const auth = {
  login: (password: string) =>
    request<{ ok: boolean }>('/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: boolean }>('/admin/logout', { method: 'POST' }),
  session: () => request<{ authed: boolean }>('/admin/session'),
};

// ———— Games ————
export const games = {
  list: (q?: string) =>
    request<{ total: number; games: RawGame[] }>(`/games${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  get: (id: string) => request<RawGame>(`/games/${encodeURIComponent(id)}`),
  add: (g: RawGame) =>
    request<RawGame>('/admin/games', { method: 'POST', body: JSON.stringify(g) }),
  update: (id: string, g: RawGame) =>
    request<RawGame>(`/admin/games/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(g) }),
  remove: (id: string) =>
    request<{ ok: boolean }>(`/admin/games/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  uploadCover: async (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    // 上传不能用 JSON content-type，用 multipart
    const res = await fetch(`${BASE}/admin/games/${encodeURIComponent(id)}/cover`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, '上传失败');
    return res.json() as Promise<{ ok: boolean; coverFilename: string; coverUrl: string }>;
  },
  uploadGame: async (file: File) => {
    // 上传 PlayCanvas 游戏 zip，后端自动解压解析 game.json
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/admin/games/upload`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    if (!res.ok) {
      let msg = '上传失败';
      try { const b = await res.json(); if (b.error) msg = b.error; } catch {}
      throw new ApiError(res.status, msg);
    }
    return res.json() as Promise<{ game: RawGame; manifest: unknown; zipUrl: string }>;
  },
};

// ———— Featured ————
export const featured = {
  get: () => request<Featured>('/featured'),
  set: (f: Featured) =>
    request<Featured>('/admin/featured', { method: 'PUT', body: JSON.stringify(f) }),
};

// ———— Mirrors ————
export const mirrors = {
  get: () => request<MirrorConfig>('/mirrors'),
  set: (m: MirrorConfig) =>
    request<MirrorConfig>('/admin/mirrors', { method: 'PUT', body: JSON.stringify(m) }),
};

// ———— Hook 配置 ————
export interface HookConfig {
  commandHook?: string;
  webHook?: string;
  host?: string;
  packageDist?: boolean;
}

export const hook = {
  get: () => request<HookConfig>('/admin/hook'),
  set: (cfg: HookConfig) =>
    request<HookConfig>('/admin/hook', { method: 'PUT', body: JSON.stringify(cfg) }),
};

// ———— Publish ————
export const publish = {
  trigger: () =>
    request<PublishStatus>('/admin/publish', { method: 'POST' }),
  status: () => request<PublishStatus>('/admin/publish/status'),
  // SSE 日志流：返回 EventSource 的订阅/取消订阅函数
  subscribeLogs: (onLog: (line: LogLine) => void): (() => void) => {
    // 用 fetch + ReadableStream 读 SSE（比 EventSource 更灵活，可带 cookie）
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${BASE}/admin/publish/logs`, {
          credentials: 'same-origin',
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        const reader = res.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                onLog(JSON.parse(line.slice(6)) as LogLine);
              } catch {
                // 跳过非 JSON 行
              }
            }
          }
        }
      } catch {
        // abort 或网络错误，静默
      }
    })();
    return () => controller.abort();
  },
};

export { ApiError };
