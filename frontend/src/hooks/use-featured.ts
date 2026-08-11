// 推荐游戏 hooks。
// featured.json 由 CMS 管理（admin /featured 页），发布时注入 public/。
// 为空则首页回退到按字母序前 42 条（routes/index.tsx 处理回退逻辑）。
import { useQuery } from '@tanstack/react-query';

export interface Featured {
  identifiers: string[];
}

async function fetchFeatured(): Promise<Featured> {
  const res = await fetch('/featured.json');
  if (!res.ok) return { identifiers: [] };
  const data = (await res.json()) as Featured;
  return { identifiers: data.identifiers ?? [] };
}

export function useFeatured() {
  return useQuery({
    queryKey: ['featured'],
    queryFn: fetchFeatured,
    // SWR 策略：发布后重载生效。这里用较短 staleTime 让 TanStack Query 偶尔重查
    staleTime: 60 * 60 * 1000, // 1 小时
  });
}
