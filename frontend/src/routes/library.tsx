// 我的游戏库页：管理浏览器本地缓存的游戏。
//
// 功能：列出已下载/下载中的游戏，支持删除（释放存储）、进入游戏。
// 数据源：Dexie useLiveQuery，下载完成自动刷新。
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Library as LibraryIcon, Trash2, Play, Loader2, HardDrive, Gamepad2 } from 'lucide-react';
import { useLibraryGames, useReadyGames } from '@/features/library/use-library';
import { deleteGame, getStorageEstimate } from '@/features/library/db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/state';
import { formatBytes } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

export function LibraryPage() {
  const games = useLibraryGames();
  const ready = useReadyGames();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { data: storage } = useQuery({
    queryKey: ['storage-estimate'],
    queryFn: getStorageEstimate,
    staleTime: 30000,
  });

  if (!games || !ready) return <Loading />;

  const readyCount = ready.length;
  const totalSize = ready.reduce((s, g) => s + g.filesize, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">我的游戏库</h1>
        <div className="text-right text-sm text-muted-foreground">
          <div>{readyCount} 款已下载</div>
          {storage?.quota ? (
            <div className="flex items-center gap-1 text-xs">
              <HardDrive className="h-3 w-3" />
              {formatBytes(totalSize)} / {formatBytes(storage.quota)}
            </div>
          ) : null}
        </div>
      </div>

      {games.length === 0 ? (
        <div className="flex h-60 flex-col items-center justify-center gap-3 text-muted-foreground">
          <LibraryIcon className="h-12 w-12" />
          <p className="text-sm">你的游戏库还是空的</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/games">去游戏列表下载</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {games.map((g) => (
            <Card key={g.id}>
              <CardContent className="flex items-center gap-4 p-3">
                {/* 封面缩略图（横向 contain） */}
                <Link to="/games/$identifier" params={{ identifier: g.id }}>
                  <div className="h-12 w-16 shrink-0 overflow-hidden rounded bg-muted">
                    {g.coverUrl ? (
                      <img
                        src={g.coverUrl}
                        alt={g.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Gamepad2 className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                </Link>

                {/* 信息 */}
                <div className="min-w-0 flex-1">
                  <Link
                    to="/games/$identifier"
                    params={{ identifier: g.id }}
                    className="block truncate font-medium hover:underline"
                  >
                    {g.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatBytes(g.filesize)}</span>
                    {g.status === 'ready' && <Badge variant="secondary">已下载</Badge>}
                    {g.status === 'downloading' && (
                      <Badge variant="outline">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        下载中
                      </Badge>
                    )}
                    {g.status === 'error' && (
                      <Badge variant="destructive">下载失败</Badge>
                    )}
                  </div>
                </div>

                {/* 操作 */}
                <div className="flex shrink-0 gap-2">
                  {g.status === 'ready' && (
                    <Button asChild size="sm">
                      <Link to="/games/$identifier" params={{ identifier: g.id }}>
                        <Play className="h-4 w-4" />
                        玩
                      </Link>
                    </Button>
                  )}
                  {confirmId === g.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          await deleteGame(g.id);
                          setConfirmId(null);
                        }}
                      >
                        确认删除
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                        取消
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmId(g.id)}
                      aria-label="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
