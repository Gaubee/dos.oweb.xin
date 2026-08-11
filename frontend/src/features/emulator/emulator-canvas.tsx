// EmulatorCanvas：emularity DOSBox 真实挂载容器。
//
// 正交意图：
//   1. 从 Dexie 取已缓存的 ArrayBuffer
//   2. 用 DosBoxLoader.localFile 注入（绕过内置 XHR，零重复下载）
//   3. emularity 生命周期管理（挂载/卸载/全屏）
//
// 关键技术点（调研结论）：
//   - loader.js:1263-1268 对 file.data 字段直接 resolve，跳过 fetch_file
//   - 故 mountZip 第二参用 localFile(title, arrayBuffer) 而非 fetchFile(title, url)
//   - emularity 的 es6-promise/browserfs/loader 三脚本在 index.html 全局加载，
//     此处通过 window 全局访问 Emulator/DosBoxLoader
import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Monitor, Loader2 } from 'lucide-react';
import type { GameInfo } from '@/types/game';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { db } from '@/features/library/db';
import { loadEmularity } from './emularity-loader';

// emularity 注入到 window 的全局（IIFE，非 module，无法 import 类型）
// DosBoxLoader 既是构造函数（new 出 config），又有静态工厂方法。
interface DosBoxLoaderConfig {
  [key: string]: unknown;
}
interface DosBoxLoaderStatic {
  new (...configs: DosBoxLoaderConfig[]): DosBoxLoaderConfig;
  emulatorJS: (url: string) => DosBoxLoaderConfig;
  locateAdditionalEmulatorJS: (fn: (filename: string) => string) => DosBoxLoaderConfig;
  nativeResolution: (w: number, h: number) => DosBoxLoaderConfig;
  fileSystemKey: (key: string) => DosBoxLoaderConfig;
  mountZip: (
    drive: string,
    file: DosBoxLoaderConfig,
    driveType: string,
  ) => DosBoxLoaderConfig;
  fetchFile: (title: string, url: string) => DosBoxLoaderConfig;
  localFile: (title: string, data: ArrayBuffer) => DosBoxLoaderConfig;
  startExe: (path: string) => DosBoxLoaderConfig;
}

declare global {
  interface Window {
    Emulator?: new (
      canvas: HTMLCanvasElement,
      callbacks: unknown,
      config: unknown,
    ) => EmulatorInstance;
    DosBoxLoader?: DosBoxLoaderStatic;
  }
}

interface EmulatorInstance {
  start: (opts?: { waitAfterDownloading?: boolean }) => Promise<unknown> | void;
  requestFullScreen: () => void;
  stop?: () => void;
  destroy?: () => void;
  exit?: () => void;
}

export function EmulatorCanvas({ game }: { game: GameInfo }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const emulatorRef = useRef<EmulatorInstance | null>(null);
  const [htmlFs, setHtmlFs] = useState(false);
  const [status, setStatus] = useState<'loading' | 'running' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;

    async function boot() {
      if (!canvas) return;

      // 1. 按需加载 emularity（不在 index.html 全局加载，避免阻塞其它页面）
      await loadEmularity();
      const { Emulator: EmulatorCtor, DosBoxLoader: DL } = window;
      if (!EmulatorCtor || !DL) {
        setStatus('error');
        setErrorMsg('emularity 加载失败');
        return;
      }

      // 2. 从 Dexie 取缓存的 zip ArrayBuffer
      const record = await db.games.get(game.identifier);
      if (!record?.data) {
        setStatus('error');
        setErrorMsg('游戏数据未缓存，请先下载');
        return;
      }
      if (cancelled) return;

      try {
        // 3. locateAdditionalJS：把 emscripten 请求的 dosbox.html.mem 映射到实际 URL
        const memUrl = '/emularity/dosbox/dosbox-sync.mem';
        const locateAdditionalFiles = (filename: string) =>
          filename === 'dosbox.html.mem' ? memUrl : memUrl + filename;

        // 4. 构造 DosBoxLoader config —— 与原版 game.html 第 68-81 行一一对应
        //    唯一差异：mountZip 用 localFile（带 data）而非 fetchFile（带 url）
        const config = new DL(
          DL.emulatorJS('/emularity/dosbox/dosbox-sync.js'),
          DL.locateAdditionalEmulatorJS(locateAdditionalFiles),
          DL.nativeResolution(640, 480),
          DL.fileSystemKey(game.identifier),
          DL.mountZip(
            'c',
            // ★ 核心：localFile 直接注入 ArrayBuffer，跳过 loader 内置 XHR
            DL.localFile('Game File', record.data),
            game.driveType,
          ),
          DL.startExe(game.executable),
        );

        // 5. 构造 Emulator 并启动
        const emulator = new EmulatorCtor(canvas, null, config);
        emulatorRef.current = emulator;
        emulator.start({ waitAfterDownloading: true });
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
      // 清理：emularity 会注入全局 Module 与大量 canvas 子节点
      const em = emulatorRef.current;
      try {
        em?.stop?.();
        em?.destroy?.();
        em?.exit?.();
      } catch {
        // 忽略清理异常
      }
      emulatorRef.current = null;
    };
  }, [game.identifier, game.executable, game.driveType]);

  const toggleHtmlFullscreen = () => setHtmlFs((v) => !v);

  return (
    <Card className="overflow-hidden">
      <div className="relative bg-black">
        <canvas
          ref={canvasRef}
          id="canvas"
          className={`emscripten ${htmlFs ? 'fixed left-0 top-0 z-[2000] h-full w-full' : ''}`}
          onContextMenu={(e) => e.preventDefault()}
        />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/60">
            <div className="text-center">
              <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" />
              <p className="text-sm">正在启动模拟器…</p>
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
          <Monitor className="h-4 w-4" />
          <span>{game.executable}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={toggleHtmlFullscreen}>
            {htmlFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {htmlFs ? '退出网页全屏' : '网页全屏'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => emulatorRef.current?.requestFullScreen()}
          >
            <Maximize2 className="h-4 w-4" />
            全屏游戏
          </Button>
        </div>
      </div>

      {/* 网页全屏退出按钮（悬浮右下角） */}
      {htmlFs && (
        <Button
          size="sm"
          variant="secondary"
          onClick={toggleHtmlFullscreen}
          className="fixed bottom-4 right-4 z-[3000] opacity-30 hover:opacity-100"
        >
          退出
        </Button>
      )}
    </Card>
  );
}
