// 游戏数据内存索引 + Fuse.js 模糊搜索。
//
// 正交意图：
//   1. 加载 —— fetch /games.json，反序列化，预计算 searchText（含拼音）
//   2. 派生 —— toDTO/toSummary
//   3. 查询 —— listGames/getGame/searchGames（Fuse.js 索引，O(1) 搜索）
//
// 性能：加载时一次性建 Fuse 索引（含预计算拼音 searchText），
// 搜索时不再遍历全量数据 + 不再实时调 pinyin()。
import Fuse from 'fuse.js';
import type { GameInfo, GameSummary, LocalizedName } from '@/types/game';
import { pinyin } from 'pinyin-pro';

/** 中文转无声调全拼（小写）。 */
function toPinyin(s: string): string {
  return pinyin(s, { toneType: 'none', type: 'array' }).join('').toLowerCase();
}

/** games.json 原始结构 */
interface GamesFile {
  games: Record<string, RawGame>;
}

interface RawGame {
  identifier: string;
  name: LocalizedName;
  executable: string;
  sha256: string;
  filesize: number;
  engine?: 'dosbox' | 'playcanvas';
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
}

const COVERS_BASE = '/covers';

/** 索引条目：GameInfo + 预计算的多字段（供 Fuse 独立搜索） */
interface IndexEntry {
  game: GameInfo;
  nameZh: string;
  pinyin: string;
  initials: string;
  identifier: string;
  idPinyin: string;
  en: string;
  zhHant: string;
  keywords: string;
  types: string;
}

interface StoreData {
  games: Map<string, GameInfo>;
  ordered: string[];
  fuse: Fuse<IndexEntry>;
}

let cache: StoreData | null = null;

/** 加载 games.json 并构建 Fuse 索引。全应用生命周期只调一次。 */
async function load(): Promise<StoreData> {
  if (cache) return cache;
  const res = await fetch('/games.json');
  if (!res.ok) throw new Error(`加载 games.json 失败: ${res.status}`);
  const data = (await res.json()) as GamesFile;

  const games = new Map<string, GameInfo>();
  const entries: IndexEntry[] = [];
  const ordered: string[] = [];

  for (const [id, raw] of Object.entries(data.games)) {
    const game = toDTO(raw);
    games.set(id, game);
    ordered.push(id);

    const nameZh = displayName(game.name);
    entries.push({
      game,
      nameZh,
      pinyin: toPinyin(nameZh),
      initials: pinyin(nameZh, { pattern: 'first', type: 'array' }).join('').toLowerCase(),
      identifier: id,
      idPinyin: toPinyin(id),
      en: game.name.en ?? '',
      zhHant: game.name['zh-Hant'] ?? '',
      keywords: (game.keywords ?? []).join(' '),
      types: (game.types ?? []).join(' '),
    });
  }

  ordered.sort((a, b) =>
    toPinyin(displayName(games.get(a)!.name)).localeCompare(toPinyin(displayName(games.get(b)!.name))),
  );

  const fuse = new Fuse(entries, {
    keys: [
      { name: 'nameZh', weight: 0.3 },
      { name: 'pinyin', weight: 0.25 },
      { name: 'initials', weight: 0.1 },
      { name: 'identifier', weight: 0.15 },
      { name: 'idPinyin', weight: 0.05 },
      { name: 'en', weight: 0.1 },
      { name: 'keywords', weight: 0.03 },
      { name: 'types', weight: 0.02 },
    ],
    threshold: 0.2,
    ignoreLocation: true,
    minMatchCharLength: 1,
  });

  cache = { games, ordered, fuse };
  return cache;
}

/** 全部游戏列表（精简字段），按拼音排序。 */
export async function listGames(): Promise<{ total: number; games: GameSummary[] }> {
  const { games, ordered } = await load();
  return { total: ordered.length, games: ordered.map((id) => toSummary(games.get(id)!)) };
}

/** 单游戏完整详情。不存在返回 null。 */
export async function getGame(identifier: string): Promise<GameInfo | null> {
  const { games } = await load();
  return games.get(identifier) ?? null;
}

/** Fuse.js 模糊搜索（含拼音/首字母/原文）。q 空串返回空结果。 */
export async function searchGames(q: string): Promise<{ total: number; games: GameSummary[] }> {
  const query = q.trim();
  if (!query) return { total: 0, games: [] };
  const { fuse } = await load();
  const results = fuse.search(query);
  return {
    total: results.length,
    games: results.map((r) => toSummary(r.item.game)),
  };
}

// —— 派生逻辑 ——

function toDTO(raw: RawGame): GameInfo {
  const driveType = raw.cdrom ? 'cdrom' : raw.floppy ? 'floppy' : 'hdd';
  return {
    ...raw,
    engine: raw.engine ?? 'dosbox',
    driveType,
    hasZip: raw.filesize > 0,
    coverUrl: raw.coverFilename ? `${COVERS_BASE}/${raw.identifier}/${raw.coverFilename}` : undefined,
  };
}

function toSummary(g: GameInfo): GameSummary {
  return {
    identifier: g.identifier,
    name: g.name,
    types: g.types,
    releaseYear: g.releaseYear,
    coverUrl: g.coverUrl,
    coverBlurhash: g.coverBlurhash,
    filesize: g.filesize,
    hasZip: g.hasZip,
  };
}

function displayName(n: LocalizedName): string {
  return n['zh-Hans'] || n['zh-Hant'] || n.en || '';
}
