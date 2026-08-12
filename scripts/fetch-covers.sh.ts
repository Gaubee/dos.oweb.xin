// 游戏封面下载脚本（dos.lol API → images.dos.lol CDN）。
//
// 用法：bun run scripts/fetch-covers.sh.ts [--limit N] [--dry-run]
//
// 流程：
//   1. 读 games.json 找出缺封面的游戏
//   2. 调 api.dos.lol 搜游戏 → 取 image hash
//   3. 从 images.dos.lol 下载 webp 封面
//   4. 更新 games.json 的 coverFilename
import { $ } from "bun";

const gamesData = JSON.parse(await Bun.file("frontend/public/games.json").text());
const noCover = Object.entries(gamesData.games)
  .filter(([_, v]: [string, any]) => !v.coverFilename)
  .map(([id, v]: [string, any]) => ({ id, name: v.name?.["zh-Hans"] || id }));

const limit = parseInt(process.argv.includes("--limit") ? process.argv[process.argv.indexOf("--limit") + 1] : "0", 10);
const dryRun = process.argv.includes("--dry-run");
const targets = limit > 0 ? noCover.slice(0, limit) : noCover;
console.log(`待处理: ${targets.length} 款${dryRun ? " (dry-run)" : ""}\n`);

const API = "https://api.dos.lol/v1/games";
const CDN = "https://images.dos.lol";

// —— 搜游戏拿 image hash ——
async function searchCover(gameName: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}?query=${encodeURIComponent(gameName)}&pageSize=5&pageNumber=1`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const games: any[] = data.games || [];
    // 精确匹配优先
    const exact = games.find((g) => g.identifier === gameName || g.name?.["zh-Hans"] === gameName);
    const target = exact || games[0];
    return target?.image || null;
  } catch { return null; }
}

// —— 下载 ——
async function download(imageHash: string, gameId: string): Promise<boolean> {
  const dir = `frontend/public/covers/${gameId}`;
  const url = `${CDN}/${imageHash}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 500) return false;
    await $`mkdir -p ${dir}`;
    // 全部存为 webp（上游就是 webp）
    await Bun.write(`${dir}/cover.webp`, buf);
    gamesData.games[gameId].coverFilename = "cover.webp";
    return true;
  } catch { return false; }
}

// —— 主循环 ——
let success = 0, failed = 0, notFound = 0;

for (let i = 0; i < targets.length; i++) {
  const game = targets[i];
  process.stdout.write(`[${i + 1}/${targets.length}] ${game.name} ... `);
  if (dryRun) { console.log("(dry-run)"); continue; }

  const hash = await searchCover(game.name);
  if (!hash) { console.log("✗ 未找到"); notFound++; continue; }

  if (await download(hash, game.id)) {
    console.log("✓");
    success++;
  } else {
    console.log("✗ 下载失败");
    failed++;
  }

  if ((i + 1) % 10 === 0)
    await Bun.write("frontend/public/games.json", JSON.stringify(gamesData, null, 2));
  await new Promise((r) => setTimeout(r, 300));
}

if (!dryRun) await Bun.write("frontend/public/games.json", JSON.stringify(gamesData, null, 2));
console.log(`\n完成：成功 ${success}，未找到 ${notFound}，失败 ${failed}`);
