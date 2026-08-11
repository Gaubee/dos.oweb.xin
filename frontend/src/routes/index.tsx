// 首页：封面墙。
// 优先用 featured.json 配置的推荐游戏；为空则回退到按字母序前 42 条。
import { useGames } from '@/hooks/use-games';
import { useFeatured } from '@/hooks/use-featured';
import { GameGrid } from '@/components/game-grid';
import { Loading, ErrorState } from '@/components/state';

export function HomePage() {
  const { data, isLoading, error } = useGames();
  const { data: featured } = useFeatured();

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={error.message} />;
  if (!data) return null;

  // 推荐逻辑：featured 非空时用其顺序，否则取前 42
  const featuredIds = featured?.identifiers ?? [];
  const show = featuredIds.length > 0
    ? featuredIds
        .map((id) => data.games.find((g) => g.identifier === id))
        .filter((g): g is NonNullable<typeof g> => Boolean(g))
    : data.games.slice(0, 42);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">
          {featuredIds.length > 0 ? '推荐游戏' : '热门游戏'}
        </h1>
        <p className="text-sm text-muted-foreground">共 {data.total} 款游戏</p>
      </div>
      <GameGrid games={show} />
    </div>
  );
}
