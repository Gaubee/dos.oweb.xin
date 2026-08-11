// 动态镜像池 + 熔断器：运行时从 /mirrors.json 加载配置，对不可用节点自动熔断。
//
// 正交意图：
//   1. 配置加载 —— 启动时 fetch /mirrors.json（CMS 管理），缓存内存
//   2. 熔断器 —— 连续失败 N 次 → 开启熔断（跳过），定时 half-open 探测恢复
//   3. pickMirror —— 对未熔断镜像并发嗅探，按 latency/weight 选最快
//
// 健康状态持久化到 localStorage，跨会话记忆坏节点（避免每次重启都试）。
// engine.ts 的 pickMirror 调用点接口不变（返回 MirrorProbe[]），零改动接入。
export interface Mirror {
  id: string;
  name: string;
  /** baseUrl 形如 https://dos-bin.zczc.cz，zip URL = baseUrl + '/' + encodedIdentifier + '.zip' */
  baseUrl: string;
  enabled: boolean;
  /** 权重（同延迟下优先级，默认 100） */
  weight?: number;
}

export interface MirrorProbe {
  mirror: Mirror;
  ok: boolean;
  /** 往返延迟（毫秒），失败为 Infinity */
  latency: number;
  /** 服务端报告的 Content-Length（字节） */
  contentLength?: number;
  error?: string;
  /** 是否被熔断（前端可据此展示状态） */
  circuitOpen?: boolean;
}

// ———— 熔断器配置 ————

/** 连续失败多少次后开启熔断 */
const FAILURE_THRESHOLD = 3;
/** 熔断后多久尝试 half-open 恢复探测（毫秒） */
const RECOVERY_INTERVAL = 5 * 60 * 1000; // 5 分钟
/** localStorage key */
const HEALTH_KEY = 'dos-mirror-health';

interface HealthState {
  /** mirrorId → { failures, circuitOpenUntil } */
  [mirrorId: string]: {
    failures: number;
    /** 熔断恢复探测时间戳（毫秒），0=未熔断 */
    circuitOpenUntil: number;
  };
}

// ———— 配置加载 ————

let mirrorsCache: Mirror[] | null = null;

async function loadMirrors(): Promise<Mirror[]> {
  if (mirrorsCache) return mirrorsCache;
  let configed: Mirror[] = [];
  try {
    const res = await fetch('/mirrors.json');
    if (res.ok) {
      const data = (await res.json()) as { mirrors: Mirror[] };
      configed = data.mirrors ?? [];
    }
  } catch {
    // 静态站可能无 mirrors.json，回退默认
  }
  if (configed.length === 0) {
    configed = [
      { id: 'dos-bin', name: 'dos-bin.zczc.cz', baseUrl: 'https://dos-bin.zczc.cz', enabled: true, weight: 100 },
    ];
  }
  // 自动 prepend 自托管源（PlayCanvas 游戏 zip 存这里，本地优先 weight 最高）
  const selfHosted: Mirror = {
    id: 'self-hosted',
    name: '自托管',
    baseUrl: `${location.origin}/storage/zips`,
    enabled: true,
    weight: 200, // 最高优先级（本地，延迟最低）
  };
  mirrorsCache = [selfHosted, ...configed.filter((m) => m.id !== 'self-hosted')];
  return mirrorsCache;
}

// ———— 健康状态持久化 ——

function loadHealth(): HealthState {
  try {
    const raw = localStorage.getItem(HEALTH_KEY);
    return raw ? (JSON.parse(raw) as HealthState) : {};
  } catch {
    return {};
  }
}

function saveHealth(h: HealthState): void {
  try {
    localStorage.setItem(HEALTH_KEY, JSON.stringify(h));
  } catch {
    // localStorage 满或禁用，忽略
  }
}

/** 判断某镜像当前是否被熔断 */
function isCircuitOpen(h: HealthState, mirrorId: string): boolean {
  const s = h[mirrorId];
  if (!s || s.circuitOpenUntil === 0) return false;
  // 熔断过期 → 视为 half-open（允许探测，但状态未清）
  return Date.now() < s.circuitOpenUntil;
}

/** 记录探测/下载失败，返回是否因此触发熔断 */
function recordFailure(h: HealthState, mirrorId: string): boolean {
  const s = h[mirrorId] ?? { failures: 0, circuitOpenUntil: 0 };
  s.failures += 1;
  let opened = false;
  if (s.failures >= FAILURE_THRESHOLD && s.circuitOpenUntil === 0) {
    s.circuitOpenUntil = Date.now() + RECOVERY_INTERVAL;
    opened = true;
  }
  h[mirrorId] = s;
  saveHealth(h);
  return opened;
}

/** 记录成功，重置失败计数 + 关闭熔断 */
function recordSuccess(h: HealthState, mirrorId: string): void {
  const s = h[mirrorId];
  if (s && (s.failures > 0 || s.circuitOpenUntil > 0)) {
    h[mirrorId] = { failures: 0, circuitOpenUntil: 0 };
    saveHealth(h);
  }
}

/** 手动重置某镜像健康状态（admin 镜像管理页可调用） */
export function resetMirrorHealth(mirrorId?: string): void {
  const h = loadHealth();
  if (mirrorId) {
    delete h[mirrorId];
  } else {
    for (const k of Object.keys(h)) delete h[k];
  }
  saveHealth(h);
}

// ———— 单镜像探测 ——

/** 探测单镜像：GET Range:0-0 验证 CORS + Range + 大小。 */
export async function probeMirror(
  mirror: Mirror,
  identifier: string,
  expectedSize?: number,
  timeoutMs = 8000,
): Promise<MirrorProbe> {
  const url = zipUrl(mirror, identifier);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: controller.signal,
      mode: 'cors',
    });
    const latency = performance.now() - start;

    if (!res.ok && res.status !== 206 && res.status !== 200) {
      return { mirror, ok: false, latency: Infinity, error: `HTTP ${res.status}` };
    }

    // 从 Content-Range: bytes 0-0/TOTAL 解析总大小
    const contentRange = res.headers.get('content-range');
    let contentLength: number | undefined;
    if (contentRange) {
      const m = /\/(\d+)$/.exec(contentRange);
      if (m) contentLength = Number(m[1]);
    }
    await res.arrayBuffer().catch(() => {});

    if (expectedSize && contentLength && contentLength !== expectedSize) {
      return {
        mirror,
        ok: false,
        latency,
        contentLength,
        error: `size mismatch: expected ${expectedSize}, got ${contentLength}`,
      };
    }
    return { mirror, ok: true, latency, contentLength };
  } catch (err) {
    return {
      mirror,
      ok: false,
      latency: Infinity,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ———— pickMirror：并发嗅探 + 熔断过滤 ——

/**
 * 并发嗅探所有启用的镜像（跳过被熔断的），返回按 (ok, latency/weight) 排序的结果。
 * 探测结果会更新健康状态：成功重置失败计数，失败累计（达阈值则熔断）。
 *
 * 熔断的镜像也会出现在返回结果中（circuitOpen=true, ok=false），供 UI 展示状态。
 * 调用方取首个 ok 的即可（engine.ts 的约定）。
 */
export async function pickMirror(
  identifier: string,
  expectedSize?: number,
): Promise<MirrorProbe[]> {
  const [mirrors, health] = await Promise.all([loadMirrors(), Promise.resolve(loadHealth())]);

  const enabled = mirrors.filter((m) => m.enabled);
  // 分组：未熔断（参与探测） vs 已熔断（仅返回状态）
  const active = enabled.filter((m) => !isCircuitOpen(health, m.id));
  const circuitOpen = enabled.filter((m) => isCircuitOpen(health, m.id));

  // 并发探测活跃镜像
  const probes = await Promise.all(active.map((m) => probeMirror(m, identifier, expectedSize)));

  // 更新健康状态
  for (const p of probes) {
    if (p.ok) {
      recordSuccess(health, p.mirror.id);
    } else if (p.error && !p.error.includes('size mismatch')) {
      // size mismatch 不计入熔断（是数据问题不是源不可用）
      recordFailure(health, p.mirror.id);
    }
  }

  // 构造熔断镜像的 probe（标记 circuitOpen）
  const circuitProbes: MirrorProbe[] = circuitOpen.map((m) => {
    const s = health[m.id];
    const remaining = s ? Math.ceil((s.circuitOpenUntil - Date.now()) / 1000) : 0;
    return {
      mirror: m,
      ok: false,
      latency: Infinity,
      circuitOpen: true,
      error: `熔断中（${remaining}s 后恢复探测）`,
    };
  });

  // 合并 + 排序：ok 优先，再按 latency/weight 升序；熔断的排最后
  return [...probes, ...circuitProbes].sort((a, b) => {
    // 不可达/熔断排最后
    const aBad = !a.ok;
    const bBad = !b.ok;
    if (aBad !== bBad) return aBad ? 1 : -1;
    const scoreA = a.latency / (a.mirror.weight ?? 100);
    const scoreB = b.latency / (b.mirror.weight ?? 100);
    return scoreA - scoreB;
  });
}

// ———— 工具 ——

/** 构造某游戏的 zip URL */
export function zipUrl(mirror: Mirror, identifier: string): string {
  return `${mirror.baseUrl}/${encodeURIComponent(identifier)}.zip`;
}

/**
 * 通知镜像池某镜像在实际下载中失败（非探测）。
 * engine.ts 的分片下载失败时可调用此函数加速熔断判定。
 */
export function reportDownloadFailure(mirrorId: string): void {
  const h = loadHealth();
  recordFailure(h, mirrorId);
}

/** 通知镜像池某镜像下载成功（重置健康状态） */
export function reportDownloadSuccess(mirrorId: string): void {
  const h = loadHealth();
  recordSuccess(h, mirrorId);
}

/** 获取所有镜像的当前健康状态（admin 镜像管理页用） */
export function getMirrorsHealth(): HealthState {
  return loadHealth();
}
