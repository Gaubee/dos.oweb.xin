// 路由切换淡入。
//
// 不用 key={pathname}：key 变化会导致组件树完全卸载重挂载，
// 触发 useQuery 重查 + 1898 条数据重渲染 + stagger 重播，造成卡顿。
// 改为用 animation controls 在 pathname 变化时重播 opacity 淡入（不重挂载）。
import { Outlet, useRouterState } from '@tanstack/react-router';
import { motion, useAnimationControls } from 'motion/react';
import { useEffect } from 'react';

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export function PageTransition() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const controls = useAnimationControls();

  // pathname 变化时重播淡入（不重挂载组件，保持 useQuery 缓存）
  useEffect(() => {
    controls.start({ opacity: [0.4, 1], transition: { duration: 0.2, ease: EASE_OUT } });
  }, [pathname, controls]);

  return (
    <motion.div animate={controls} initial={{ opacity: 1 }}>
      <Outlet />
    </motion.div>
  );
}
