// 搜索结果页（固定分页，避免大量结果一次渲染）。
import { useState } from 'react';
import { useSearch } from '@/hooks/use-games';
import { GameGrid } from '@/components/game-grid';
import { Loading, ErrorState } from '@/components/state';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 60;

export function SearchPage({ q }: { q: string }) {
  const { data, isLoading, error } = useSearch(q);
  const [page, setPage] = useState(1);

  const all = data?.games ?? [];
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageItems = all.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

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
        <>
          <GameGrid games={pageItems} />
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button size="icon" variant="outline" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm tabular-nums">{curPage} / {totalPages}</span>
              <Button size="icon" variant="outline" disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
