// 意图（记录时间：2026-08-12 15:44 CST；用户原始输入：「阅读 /tmp/lqip-handoff.md 修复算法问题」）：
//  1. 解码图像文件为 image.Image。
//  2. 编排 LQIP 分析并保持固定的 20bit 传输格式。
package blobhash

import (
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	_ "golang.org/x/image/webp"
	"os"
)

const lqipOffset = 1 << 19

// FromFile 从图像文件生成 CSS-only LQIP 整数。
func FromFile(path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, fmt.Errorf("打开图片失败: %w", err)
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	if err != nil {
		return 0, fmt.Errorf("解码图片失败: %w", err)
	}

	return Encode(img), nil
}

// Encode 把 img 转为 CSS 解码器所需的有符号 20bit 整数。
func Encode(img image.Image) int {
	if img.Bounds().Empty() {
		return -lqipOffset
	}

	base := representativeColour(img)
	ll, aaa, bbb := oklabToBits(rgbToOklab(base))
	baseL := bitsToOklab(ll, aaa, bbb).l
	greyscale := grid3x2Greyscale(img)

	packed := packLQIP(greyscale, baseL, ll, aaa, bbb)
	// CSS 解码前会加 pow(2, 19)，这里保留有符号形式。
	return packed - lqipOffset
}

func packLQIP(greyscale [6]float64, baseL float64, ll, aaa, bbb int) int {
	values := quantizeGreyscale(greyscale, baseL)
	return values[0]<<18 |
		values[1]<<16 |
		values[2]<<14 |
		values[3]<<12 |
		values[4]<<10 |
		values[5]<<8 |
		ll<<6 |
		aaa<<3 |
		bbb
}
