// 关于页。
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">关于</h1>

      <Card>
        <CardHeader>
          <CardTitle>中文 DOS 游戏</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            本站复刻自{' '}
            <a
              href="https://github.com/rwv/chinese-dos-games"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              rwv/chinese-dos-games
              <ExternalLink className="h-3 w-3" />
            </a>
            ，使用 Go + React 重新开发。
          </p>
          <p>游戏数据由原作者及社区整理，共 1898 款经典中文 DOS 游戏。</p>
          <p>
            游戏通过 emularity（DOSBox 的 Emscripten 移植）在浏览器中实时运行，
            支持分片下载与本地缓存，下载一次即可离线游玩。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>技术栈</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>后端：Go + Gin（单二进制，内嵌全部静态资源）</li>
            <li>前端：React 19 + TanStack Router/Query + tailwindcss v4</li>
            <li>模拟器：em-dosbox + emularity + BrowserFS</li>
            <li>本地存储：Dexie (IndexedDB)，断点续传下载</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>鸣谢</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <a
            href="https://github.com/dreamlayers/em-dosbox"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            dreamlayers/em-dosbox
            <ExternalLink className="h-3 w-3" />
          </a>
          <br />
          <a
            href="https://github.com/db48x/emularity"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            db48x/emularity
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
