// 搜索结果页（固定分页，避免大量结果一次渲染）。
import { useState } from 'react';
import { useSearch } from '@/hooks/use-games';
import { GameGrid } from '@/components/game-grid';
import { Loading, ErrorState } from '@/components/state';
import { Pagination } from '@/components/pagination';

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
          <Pagination page={curPage} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
