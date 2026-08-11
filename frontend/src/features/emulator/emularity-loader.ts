// emularity 脚本按需加载器。
//
// DOS 引擎的 3 个脚本（es6-promise / browserfs / loader）不再全局加载，
// 仅在用户打开 DOS 游戏页时动态注入，避免阻塞首页和列表页。
//
// 加载顺序严格：es6-promise → browserfs → loader（loader 依赖前两者）。
// 使用 promise 缓存，全应用只加载一次。

let loadPromise: Promise<void> | null = null;

/** 加载 emularity 三脚本（幂等，重复调用返回同一 promise）。 */
export function loadEmularity(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // 按序加载（后者依赖前者）
    await loadScript('/emularity/es6-promise.js');
    await loadScript('/emularity/browserfs.min.js');
    await loadScript('/emularity/loader.js');
  })().catch((err) => {
    loadPromise = null; // 失败后允许重试
    throw err;
  });

  return loadPromise;
}

/** 动态注入单个 script 标签，加载完成后 resolve。 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`加载失败: ${src}`));
    document.head.appendChild(script);
  });
}
