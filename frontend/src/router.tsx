// TanStack Router 代码式路由装配。
// 选用代码式（非文件路由）以避免 codegen 依赖，路由全貌集中可读。
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { Layout } from '@/components/layout';
import { HomePage } from '@/routes/index';
import { GamesPage } from '@/routes/games';
import { GamePage } from '@/routes/game';
import { SearchPage } from '@/routes/search';
import { LibraryPage } from '@/routes/library';
import { AboutPage } from '@/routes/about';

interface SearchSchema {
  q: string;
}

function RootComponent() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

const rootRoute = createRootRouteWithContext()({
  component: RootComponent,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/games',
  component: GamesPage,
});

function GameRouteComponent() {
  const { identifier } = gameRoute.useParams();
  return <GamePage identifier={identifier} />;
}

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/games/$identifier',
  component: GameRouteComponent,
});

function SearchRouteComponent() {
  const { q } = searchRoute.useSearch();
  return <SearchPage q={q} />;
}

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  validateSearch: (search: Record<string, unknown>): SearchSchema => ({
    q: String(search.q ?? ''),
  }),
  component: SearchRouteComponent,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library',
  component: LibraryPage,
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: AboutPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  gamesRoute,
  gameRoute,
  searchRoute,
  libraryRoute,
  aboutRoute,
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
