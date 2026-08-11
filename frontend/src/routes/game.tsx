// 游戏详情页（P5 实现 emularity 集成后补全，此处占位）。
import { useGame } from '@/hooks/use-games';
import { Loading, ErrorState } from '@/components/state';
import { displayName } from '@/types/game';
import { GamePlayer } from '@/features/emulator/game-player';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function GamePage({ identifier }: { identifier: string }) {
  const { data: game, isLoading, error } = useGame(identifier);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={error.message} />;
  if (!game) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* 主区：模拟器 */}
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{displayName(game.name)}</h1>
        <GamePlayer game={game} />
      </div>

      {/* 侧栏：信息 */}
      <div className="space-y-4">
        {game.types && game.types.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">类型</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {game.types.map((t) => (
                <Badge key={t} variant="secondary">{t}</Badge>
              ))}
            </CardContent>
          </Card>
        )}
        {game.keymaps && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">操作</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {Object.entries(game.keymaps).map(([k, v]) => (
                <div key={k}>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">{k}</kbd>{' '}
                  {v}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {game.cheats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">秘籍</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {Object.entries(game.cheats).map(([k, v]) => (
                <div key={k}>
                  <code className="rounded bg-muted px-1 text-xs">{k}</code> {v}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {game.links && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">相关链接</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {Object.entries(game.links).map(([k, v]) => (
                <a
                  key={k}
                  href={v}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-primary hover:underline"
                >
                  {k}
                </a>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
