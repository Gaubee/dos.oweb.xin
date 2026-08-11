// Admin 共享搜索模块：Fuse.js 索引 + 拼音预处理。
//
// 供 games.tsx（列表筛选）和 featured.tsx（推荐搜索）共用。
// 数据来自 games.list() 全量加载，建一次 Fuse 索引缓存。
import Fuse from 'fuse.js';
import { pinyin } from 'pinyin-pro';
import type { RawGame } from '@/types';

/** 中文转无声调全拼（小写）。 */
function toPinyin(s: string): string {
  return pinyin(s, { toneType: 'none', type: 'array' }).join('').toLowerCase();
}

interface IndexEntry {
  game: RawGame;
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

let fuseCache: Fuse<IndexEntry> | null = null;

/**
 * 构建 Fuse 索引（幂等，重复调用返回同一实例）。
 * 多字段独立搜索（精度高于拼成一个大字符串），每字段预计算拼音。
 */
export function buildFuseIndex(games: RawGame[]): Fuse<IndexEntry> {
  if (fuseCache) return fuseCache;

  const entries: IndexEntry[] = games.map((g) => {
    const nameZh = g.name['zh-Hans'] || g.identifier;
    return {
      game: g,
      nameZh,
      pinyin: toPinyin(nameZh),
      initials: pinyin(nameZh, { pattern: 'first', type: 'array' }).join('').toLowerCase(),
      identifier: g.identifier,
      idPinyin: toPinyin(g.identifier),
      en: g.name.en ?? '',
      zhHant: g.name['zh-Hant'] ?? '',
      keywords: (g.keywords ?? []).join(' '),
      types: (g.types ?? []).join(' '),
    };
  });

  fuseCache = new Fuse(entries, {
    keys: [
      { name: 'nameZh', weight: 0.3 },    // 原文名（最高权重）
      { name: 'pinyin', weight: 0.25 },   // 全拼
      { name: 'initials', weight: 0.1 },  // 首字母
      { name: 'identifier', weight: 0.15 },
      { name: 'idPinyin', weight: 0.05 },
      { name: 'en', weight: 0.1 },
      { name: 'keywords', weight: 0.03 },
      { name: 'types', weight: 0.02 },
    ],
    threshold: 0.2,            // 更严格（0.2 vs 之前 0.3）
    ignoreLocation: true,
    minMatchCharLength: 1,
    includeScore: true,
  });
  return fuseCache;
}

/** Fuse 模糊搜索。返回匹配的 RawGame 数组。q 空串返回空数组。 */
export function fuseSearch(games: RawGame[], q: string): RawGame[] {
  const query = q.trim();
  if (!query) return [];
  const fuse = buildFuseIndex(games);
  return fuse.search(query).map((r) => r.item.game);
}

/** 重置索引（数据变更后调用，如删除/新增游戏后重新建索引）。 */
export function resetFuseIndex(): void {
  fuseCache = null;
}

/** 拼音排序辅助（供列表稳定排序）。 */
export function pinyinCompare(a: string, b: string): number {
  return toPinyin(a).localeCompare(toPinyin(b));
}
