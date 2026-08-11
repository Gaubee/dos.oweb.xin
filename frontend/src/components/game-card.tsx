// 游戏卡片：列表/首页/搜索共用。
import { Link } from '@tanstack/react-router';
import { Gamepad2 } from 'lucide-react';
import type { GameSummary } from '@/types/game';
import { TYPE_LABELS, displayName } from '@/types/game';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BlurhashImage } from '@/components/blurhash-image';
import { formatBytes } from '@/lib/utils';

export function GameCard({ game }: { game: GameSummary }) {
  return (
    <Link to="/games/$identifier" params={{ identifier: game.identifier }}>
      <Card className="group overflow-hidden transition-all hover:ring-2 hover:ring-ring hover:shadow-lg">
        {/* 封面：横向 3:2，contain 不裁剪，blurhash 作背景填充 */}
        <div className="relative">
          {game.coverUrl ? (
            <BlurhashImage
              src={game.coverUrl}
              blurhash={game.coverBlurhash}
              aspect="3/2"
              alt={displayName(game.name)}
            />
          ) : (
            <div className="flex aspect-[3/2] items-center justify-center bg-muted text-muted-foreground">
              <Gamepad2 className="h-10 w-10" />
            </div>
          )}
          {!game.hasZip && (
            <div className="absolute right-1 top-1">
              <Badge variant="secondary" className="bg-black/60 text-white">
                无资源
              </Badge>
            </div>
          )}
        </div>
        <CardContent className="p-2.5">
          <h3 className="line-clamp-1 text-sm font-medium" title={displayName(game.name)}>
            {displayName(game.name)}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {game.types?.map((t) => (
              <Badge key={t} variant={t === 'DOS' ? 'secondary' : 'outline'}>
                {TYPE_LABELS[t] ?? t}
              </Badge>
            ))}
            <span>{formatBytes(game.filesize)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
