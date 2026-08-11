// 游戏领域类型。
// 派生字段（driveType/coverUrl/hasZip）由 lib/game-store.ts 的 toDTO 注入。

export interface LocalizedName {
  'zh-Hans': string;
  'zh-Hant'?: string;
  en?: string;
}

export type DriveType = 'hdd' | 'floppy' | 'cdrom';

/** 游戏类型缩写 → 中文（与上游 type 字段 9 种值对齐） */
export const TYPE_LABELS: Record<string, string> = {
  ACT: '动作',
  SIM: '模拟',
  RPG: '角色扮演',
  AVG: '冒险',
  PUZ: '益智',
  SLG: '策略',
  HGA: '成人',
  SPG: '体育',
  RTS: '即时战略',
  DOS: 'DOS',
  HTML5: 'HTML5',
};

/** 游戏名（优先简中，回退繁中/英文） */
export function displayName(n: LocalizedName): string {
  return n['zh-Hans'] || n['zh-Hant'] || n.en || '未命名';
}

/** 列表页精简结构 */
export interface GameSummary {
  identifier: string;
  name: LocalizedName;
  types?: string[];
  releaseYear?: number;
  coverUrl?: string;
  coverBlurhash?: string;
  filesize: number;
  hasZip: boolean;
}

/** 游戏详情完整结构 */
export interface GameInfo {
  identifier: string;
  name: LocalizedName;
  executable: string;
  sha256: string;
  filesize: number;
  /** 游戏引擎：dosbox（默认）| playcanvas。决定 GamePlayer 用哪个运行时 */
  engine?: 'dosbox' | 'playcanvas';
  /** 封面 blurhash（base83 字符串，加载前的模糊占位） */
  coverBlurhash?: string;
  types?: string[];
  keywords?: string[];
  coverFilename?: string;
  img?: string;
  cdrom?: string;
  floppy?: string;
  releaseYear?: number;
  links?: Record<string, string>;
  keymaps?: Record<string, string>;
  cheats?: Record<string, string>;
  /** 后端派生：挂载类型 */
  driveType: DriveType;
  /** 后端派生：拼好的封面 URL */
  coverUrl?: string;
  /** 后端派生：是否存在可下载 zip */
  hasZip: boolean;
}

/** /api/games 与 /api/search 的列表响应 */
export interface ListResponse {
  total: number;
  games: GameSummary[];
}
