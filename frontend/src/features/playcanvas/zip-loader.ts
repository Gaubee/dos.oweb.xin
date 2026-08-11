// PlayCanvas 游戏 zip 解包工具。
//
// 正交意图：
//   1. unzipToFiles —— fflate 解压 zip → { path: Uint8Array } 映射
//   2. parseManifest —— 从文件映射读 game.json 清单
//   3. loadEntryModule —— 动态加载 index.js（blob URL + import()）
//
// 与 DOS 游戏不同：DOS zip 是整体 ArrayBuffer 喂给 DosBoxLoader.localFile；
// PlayCanvas 需要解包后逐文件处理（清单解析 + index.js 执行 + assets 注入）。
import { unzipSync, strFromU8 } from 'fflate';

/** zip 内的文件映射：相对路径 → 字节数据 */
export type ZipFiles = Map<string, Uint8Array>;

/** game.json 清单结构（自定义打包标准） */
export interface GameManifest {
  title: string;
  engine: 'playcanvas';
  /** index.js 入口（相对 zip 根） */
  entry: string;
  /** 引擎版本（可选，用于兼容性提示） */
  engineVersion?: string;
  /** 资产清单（可选） */
  assets?: Array<{
    path: string; // zip 内相对路径
    type: string; // playcanvas asset type: texture | container | audio | json | ...
    name: string;
  }>;
}

/** 解压 zip ArrayBuffer → 文件映射。 */
export function unzipToFiles(zipData: ArrayBuffer): ZipFiles {
  const files = unzipSync(new Uint8Array(zipData));
  const map: ZipFiles = new Map();
  for (const [path, data] of Object.entries(files)) {
    // 规范化路径：去掉可能的目录前缀（打包工具可能加了顶层目录）
    const normalized = normalizePath(path);
    map.set(normalized, data);
  }
  return map;
}

/** 从文件映射解析 game.json 清单。找不到则抛错。 */
export function parseManifest(files: ZipFiles): GameManifest {
  const raw = files.get('game.json');
  if (!raw) throw new Error('zip 内缺少 game.json 清单');
  const text = strFromU8(raw);
  const manifest = JSON.parse(text) as GameManifest;
  if (manifest.engine !== 'playcanvas') {
    throw new Error(`game.json engine 字段必须为 "playcanvas"，当前为 "${manifest.engine}"`);
  }
  if (!manifest.entry) throw new Error('game.json 缺少 entry 字段');
  return manifest;
}

/**
 * 动态加载 index.js 入口模块。
 *
 * zip 内的 index.js 不是 URL 可达的文件，需用 blob URL 让浏览器 import()。
 * 返回 boot 函数（游戏作者实现的入口）。
 */
export async function loadEntryModule(
  files: ZipFiles,
  entryPath: string,
): Promise<{ boot: GameBootFn }> {
  const code = files.get(entryPath);
  if (!code) throw new Error(`zip 内缺少入口文件 ${entryPath}`);

  const blob = new Blob([code as BlobPart], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ url);
    if (typeof mod.boot !== 'function') {
      throw new Error(`${entryPath} 未导出 boot 函数`);
    }
    return mod as { boot: GameBootFn };
  } finally {
    // import 完成后可释放 blob URL（模块已缓存）
    URL.revokeObjectURL(url);
  }
}

/** 游戏 boot 函数契约：作者实现，返回 cleanup */
export type GameBootFn = (ctx: GameBootContext) => (() => void) | void;

/** boot 上下文：注入引擎、canvas、已加载资产 */
export interface GameBootContext {
  canvas: HTMLCanvasElement;
  app: unknown; // pc.Application（避免在此处强依赖 playcanvas 类型）
  pc: unknown; // playcanvas 命名空间
  assets: Map<string, unknown>; // name → pc.Asset
}

// —— 工具 ——

/** 规范化 zip 内路径：去前导 ./ 和可能的顶层目录 */
function normalizePath(path: string): string {
  let p = path.replace(/^\.\//, '');
  // 若所有文件都在同一个顶层目录下，去掉它（兼容某些打包工具）
  // 这里暂不做自动剥离，保持原样，让清单里的 path 与实际一致
  return p;
}
