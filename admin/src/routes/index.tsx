// 首页占位组件。/ 已在 router.tsx 中通过 beforeLoad redirect 到 /games，
// 此文件仅保留导出以兼容历史 import；路由本身不再挂载该组件。
export function HomePage() {
  return null;
}
