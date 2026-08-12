// Package blobhash 把封面图片编码为 20bit CSS-only LQIP 整数。
//
// 意图（记录时间：2026-08-12 15:44 CST；用户原始输入：「阅读 /tmp/lqip-handoff.md 修复算法问题」）：
//  1. 保持前端 CSS 固定的位布局和偏移协议。
//  2. 提取有代表性的彩色基色，避免小面积强调色主导。
//  3. 编码稳定的 3×2 感知亮度变化，不放大低对比噪声。
package blobhash
