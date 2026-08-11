// 管理后台领域类型，与 Go model 1:1 对应。
export interface LocalizedName {
  'zh-Hans': string;
  'zh-Hant'?: string;
  en?: string;
}

export interface RawGame {
  identifier: string;
  name: LocalizedName;
  executable: string;
  sha256: string;
  filesize: number;
  engine?: 'dosbox' | 'playcanvas';
  types?: string[];
  coverFilename?: string;
  coverBlurhash?: string;
  keywords?: string[];
  img?: string;
  cdrom?: string;
  floppy?: string;
  releaseYear?: number;
  links?: Record<string, string>;
  keymaps?: Record<string, string>;
  cheats?: Record<string, string>;
}

/** 封面 URL 派生（与 frontend 一致） */
/**
 * 封面 URL 派生。
 * dev 模式下 Vite proxy 对中文多层路径有截断 bug，故直连 Go 后端（7780）。
 * prod 模式 admin 和 covers 同域，用相对路径。
 */
const COVERS_BASE = (import.meta as { env?: { DEV?: boolean } }).env?.DEV
  ? 'http://localhost:7780/covers'
  : '/covers';

export function coverUrl(g: RawGame): string | undefined {
  if (!g.coverFilename) return undefined;
  const real = g.coverFilename.split('?')[0];
  return `${COVERS_BASE}/${encodeURIComponent(g.identifier)}/${real}`;
}

export interface Featured {
  identifiers: string[];
}

export interface Mirror {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  weight?: number;
}

export interface MirrorConfig {
  mirrors: Mirror[];
}

/** 游戏类型缩写 → 中文（与公开站一致） */
export const TYPE_LABELS: Record<string, string> = {
  ACT: '动作', SIM: '模拟', RPG: '角色扮演', AVG: '冒险',
  PUZ: '益智', SLG: '策略', HGA: '成人', SPG: '体育', RTS: '即时战略',
  DOS: 'DOS', HTML5: 'HTML5',
};

/** 构建状态（builder.go Phase） */
export type PublishPhase = 'idle' | 'flushing' | 'publishing' | 'done' | 'failed';

export interface PublishStatus {
  phase: PublishPhase;
  startedAt?: number;
  endedAt?: number;
  hook?: string;
  exitCode?: number;
  error?: string;
  progress?: number;
}

export interface LogLine {
  stream: string; // stdout | stderr | system
  line: string;
  time: number;
}
