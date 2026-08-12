// 游戏卡片：列表/首页/搜索共用。
import { Link } from '@tanstack/react-router';
import { Gamepad2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { GameSummary } from '@/types/game';
import { TYPE_LABELS, displayName } from '@/types/game';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BlurhashImage } from '@/components/blurhash-image';
import { formatBytes } from '@/lib/utils';

// 强 ease-out，与 --ease-out token 一致。
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export function GameCard({ game }: { game: GameSummary }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      className="h-full"
    >
      <Link to="/games/$identifier" params={{ identifier: game.identifier }}>
        <Card className="group h-full overflow-hidden transition-shadow duration-200 hover:shadow-xl">
          {/* 封面：横向 3:2，contain 不裁剪，blurhash 作背景填充 */}
          <div className="relative">
            {game.coverUrl ? (
              <BlurhashImage
                src={game.coverUrl}
                lqip={game.lqip}
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
    </motion.div>
  );
}
