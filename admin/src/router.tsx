// TanStack Router 代码式路由装配。
// 意图：
//   1. /login 无需鉴权；/ 重定向到 /games
//   2. 其余后台页面挂在 adminLayout 下，统一由 RequireAuth 守卫 + Layout 呈现
//   3. validateSearch 声明各路由的 search schema（q / redirect）
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { Layout } from '@/components/layout';
import { RequireAuth } from '@/lib/auth-context';
import { LoginPage } from '@/routes/login';
import { GamesListPage } from '@/routes/games';
import { GameEditPage } from '@/routes/game-edit';
import { GameNewPage } from '@/routes/game-new';
import { FeaturedPage } from '@/routes/featured';
import { MirrorsPage } from '@/routes/mirrors';
import { TypesPage } from '@/routes/types';
import { PublishPage } from '@/routes/publish';

function RootComponent() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRouteWithContext()({
  component: RootComponent,
});

// /login：无需鉴权。
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

// /：直接重定向到 /games。
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/games', replace: true });
  },
  component: () => null,
});

// 后台布局路由：统一守卫 + 头部导航。子路由通过 <Outlet/> 渲染。
const adminLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_admin',
  component: () => (
    <RequireAuth>
      <Layout />
    </RequireAuth>
  ),
});

const gamesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/games',
  component: GamesListPage,
});

// /games/new：新增游戏（多 Tab：DOS + PlayCanvas）。
// 需排在 /games/$id/edit 之前以便匹配优先级。
const gameNewRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/games/new',
  component: GameNewPage,
});

// /games/upload：保留路由兼容旧链接，重定向到 /games/new 的 PlayCanvas Tab。
const gameUploadRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/games/upload',
  beforeLoad: () => {
    throw redirect({ to: '/games/new', replace: true });
  },
  component: () => null,
});

const gameEditRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/games/$id/edit',
  component: GameEditPage,
});

const featuredRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/featured',
  component: FeaturedPage,
});

const mirrorsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/mirrors',
  component: MirrorsPage,
});

const typesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/types',
  component: TypesPage,
});

const publishRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/publish',
  component: PublishPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  adminLayoutRoute.addChildren([
    gamesRoute,
    gameNewRoute,
    gameUploadRoute,
    gameEditRoute,
    featuredRoute,
    mirrorsRoute,
    typesRoute,
    publishRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
