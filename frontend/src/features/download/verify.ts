// 完整性校验：WebCrypto subtle SHA-256。
//
// 正交意图：仅校验，不含下载/存储逻辑。
//
// crypto.subtle.digest 是浏览器原生异步 API，底层由浏览器优化（可能用硬件加速），
// 不会阻塞主线程。toHex 用 Uint8Array→Array.from 批量转换，避免 for 循环字符串拼接。

/** 计算 ArrayBuffer 的 SHA-256，返回 hex 字符串。 */
export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return toHex(digest);
}

/** 校验 buffer 的 sha256 是否匹配期望值（大小写不敏感）。 */
export async function verifySha256(
  buffer: ArrayBuffer,
  expected: string,
): Promise<boolean> {
  const actual = await sha256(buffer);
  return actual.toLowerCase() === expected.toLowerCase();
}

/** ArrayBuffer → hex 字符串。用 Array.from 批量映射，比 for 循环拼接快。 */
function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
