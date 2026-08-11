// PlaycanvasCanvas：PlayCanvas 游戏运行时容器。
//
// 正交意图：
//   1. 从 Dexie 取缓存的 zip ArrayBuffer
//   2. 解包 zip → 解析清单 → 加载资产（pc.Asset file.contents 注入，零 XHR）
//   3. 启动引擎 + 执行游戏 boot() → cleanup
//
// 与 EmulatorCanvas 同构：useEffect + canvas ref + boot + cleanup。
// 关键技术（调研结论）：
//   - pc.Asset(name, type, { filename, contents }) 的 file.contents 通道零 XHR
//   - import('playcanvas') ESM 加载，不污染全局
//   - 游戏的 index.js 通过 blob URL 动态 import()
import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Maximize2, Gamepad2 } from 'lucide-react';
import type { GameInfo } from '@/types/game';
import { db } from '@/features/library/db';
import { unzipToFiles, parseManifest, loadEntryModule, type GameBootContext } from './zip-loader';

export function PlaycanvasCanvas({ game }: { game: GameInfo }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<{ destroy: () => void } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<'loading' | 'running' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;

    async function boot() {
      if (!canvas) return;
      try {
        // 1. Dexie 取 zip
        const record = await db.games.get(game.identifier);
        if (!record?.data) {
          throw new Error('游戏数据未缓存');
        }
        if (cancelled) return;

        // 2. 解包 + 解析清单
        const files = unzipToFiles(record.data);
        const manifest = parseManifest(files);
        if (cancelled) return;

        // 3. 动态加载 PlayCanvas 引擎（不打包进主 bundle，按需加载）
        const pc = await import('playcanvas');
        if (cancelled) return;

        // 4. 启动引擎
        const app = new pc.Application(canvas, {
          mouse: new pc.Mouse(canvas),
          keyboard: new pc.Keyboard(window),
        });
        app.setCanvasResolution(pc.RESOLUTION_AUTO);
        app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
        appRef.current = app;

        // 5. 加载清单中的资产（file.contents 注入，零 XHR）
        const assets = new Map<string, InstanceType<typeof pc.Asset>>();
        if (manifest.assets) {
          for (const a of manifest.assets) {
            const fileData = files.get(a.path);
            if (!fileData) {
              console.warn(`资产缺失: ${a.path}`);
              continue;
            }
            const buf = new ArrayBuffer(fileData.byteLength);
            new Uint8Array(buf).set(fileData);
            const asset = new pc.Asset(
              a.name,
              a.type as 'texture' | 'container' | 'audio' | 'json' | 'model' | 'shader',
              { filename: getBasename(a.path), contents: buf },
            );
            app.assets.add(asset);
            app.assets.load(asset);
            assets.set(a.name, asset);
          }
        }

        // 6. 启动渲染循环
        app.start();

        // 7. 加载并执行游戏入口
        if (cancelled) {
          app.destroy();
          return;
        }
        const entry = await loadEntryModule(files, manifest.entry);
        const ctx: GameBootContext = {
          canvas,
          app: app as unknown,
          pc: pc as unknown,
          assets: assets as unknown as Map<string, unknown>,
        };
        const cleanup = entry.boot(ctx);
        cleanupRef.current = typeof cleanup === 'function' ? cleanup : null;

        if (!cancelled) setStatus('running');
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(err instanceof Error ? err.message : String(err));
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
      try {
        cleanupRef.current?.();
      } catch {
        // 忽略清理异常
      }
      cleanupRef.current = null;
      try {
        appRef.current?.destroy();
      } catch {
        // 忽略
      }
      appRef.current = null;
    };
  }, [game.identifier]);

  const fullscreen = () => {
    canvasRef.current?.requestFullscreen?.();
  };

  return (
    <Card className="overflow-hidden">
      <div className="relative bg-black">
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ aspectRatio: '16/9' }}
        />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/60">
            <div className="text-center">
              <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" />
              <p className="text-sm">正在启动 PlayCanvas 引擎…</p>
            </div>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center text-destructive">
            <p className="text-sm">{errorMsg}</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Gamepad2 className="h-4 w-4" />
          <span>PlayCanvas</span>
        </div>
        <Button size="sm" variant="outline" onClick={fullscreen}>
          <Maximize2 className="h-4 w-4" />
          全屏
        </Button>
      </div>
    </Card>
  );
}

function getBasename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1];
}
