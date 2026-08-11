// 路由切换淡入：以 pathname 为 key，每次导航触发新节点淡入。
//
// 正交意图：仅路由级入场过渡。
//
// 设计取舍（克制）：不做 exit 动画。TanStack Router 的 <Outlet /> 随路由即时
// 切换到新内容；若用 AnimatePresence + exit，退出节点会渲染到新路由内容，
// 造成“旧壳套新内容”的视觉错位。故仅保留入场淡入，稳定无 glitch。
import { Outlet, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';

// 强 ease-out，与 --ease-out token 一致（入场专用）。
// 显式 4 元组类型：motion 的 ease bezier 需要可变元组（as const 的 readonly 不可赋值）。
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export function PageTransition() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      <Outlet />
    </motion.div>
  );
}
