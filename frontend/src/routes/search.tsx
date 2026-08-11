// 搜索结果页。
import { useSearch } from '@/hooks/use-games';
import { GameGrid } from '@/components/game-grid';
import { Loading, ErrorState } from '@/components/state';

export function SearchPage({ q }: { q: string }) {
  const { data, isLoading, error } = useSearch(q);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        搜索 “{q}”
        {data && <span className="ml-2 text-base font-normal text-muted-foreground">找到 {data.total} 款</span>}
      </h1>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} />
      ) : (
        <GameGrid games={data?.games ?? []} />
      )}
    </div>
  );
}
