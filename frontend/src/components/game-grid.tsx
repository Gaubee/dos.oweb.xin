// 游戏卡片网格：响应式 CSS grid，自动填充。
import { motion, type Variants } from 'motion/react';
import type { GameSummary } from '@/types/game';
import { GameCard } from '@/components/game-card';

// 强 ease-out，与 --ease-out token 一致。
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// 容器：驱动子项 stagger 入场（30ms 间隔，克制不阻塞交互）。
const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};

// 单卡：淡入 + 轻微上移。子项自动继承父级 initial/animate。
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } },
};

export function GameGrid({ games }: { games: GameSummary[] }) {
  if (games.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        没有找到游戏
      </div>
    );
  }
  return (
    <motion.div
      className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {games.map((g) => (
        <motion.div key={g.identifier} variants={itemVariants}>
          <GameCard game={g} />
        </motion.div>
      ))}
    </motion.div>
  );
}
