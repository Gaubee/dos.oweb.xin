// 游戏数据查询 hooks（TanStack Query 封装）。
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** 全部游戏列表 */
export function useGames() {
  return useQuery({
    queryKey: ['games'],
    queryFn: api.listGames,
    staleTime: Infinity, // games.json 静态，不过期
  });
}

/** 单游戏详情 */
export function useGame(identifier: string) {
  return useQuery({
    queryKey: ['game', identifier],
    queryFn: () => api.getGame(identifier),
    staleTime: Infinity,
  });
}

/** 搜索 */
export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => api.search(q),
    enabled: q.trim().length > 0,
    staleTime: Infinity,
  });
}
