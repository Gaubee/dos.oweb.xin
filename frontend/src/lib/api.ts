// 数据访问层：薄封装 game-store，保持 hooks 调用接口不变。
//
// 历史背景：原为对接 Go 后端的 HTTP 客户端，现已静态化，
// 内部改为读本地 games.json 内存索引。hooks（useGames/useGame/useSearch）
// 的签名与返回类型完全不变，4 个路由调用点零改动。
import { listGames, getGame as fetchGame, searchGames } from './game-store';

export const api = {
  /** 全部游戏列表（精简字段） */
  listGames,

  /** 单游戏完整详情。不存在抛 Error（供 TanStack Query 捕获） */
  async getGame(identifier: string) {
    const g = await fetchGame(identifier);
    if (!g) throw new Error(`游戏不存在: ${identifier}`);
    return g;
  },

  /** 关键词搜索 */
  search: searchGames,
};
