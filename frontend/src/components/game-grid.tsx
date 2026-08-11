// 游戏卡片网格：响应式 CSS grid，自动填充。
import type { GameSummary } from '@/types/game';
import { GameCard } from '@/components/game-card';

export function GameGrid({ games }: { games: GameSummary[] }) {
  if (games.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        没有找到游戏
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
      {games.map((g) => (
        <GameCard key={g.identifier} game={g} />
      ))}
    </div>
  );
}
