// 页码组件：1 ... 4 [5] 6 ... 20 + 上一页/下一页。
// 用于游戏列表/搜索结果分页。
import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}

export function Pagination({ page, totalPages, onPage }: Props) {
  // 生成页码：1 ... cur-2 cur-1 cur cur+1 cur+2 ... totalPages
  const pages = useMemo<(number | string)[]>(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: (number | string)[] = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    if (start > 2) out.push('...');
    for (let i = start; i <= end; i++) out.push(i);
    if (end < totalPages - 1) out.push('...');
    out.push(totalPages);
    return out;
  }, [page, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1 pt-4">
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
        ) : (
          <Button
            key={p}
            size="sm"
            variant={p === page ? 'default' : 'outline'}
            className="h-9 min-w-9 px-2"
            onClick={() => onPage(p as number)}
          >
            {p}
          </Button>
        ),
      )}
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
