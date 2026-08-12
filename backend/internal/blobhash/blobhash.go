// Package blobhash 实现 CSS-only LQIP 编码（参考 leanrada.com/notes/css-only-lqip）。
//
// 把图片压缩为 20bit 整数，前端用纯 CSS mod()/pow() 解码，零 JS、零 canvas。
//
// 编码结构（MSB→LSB）：
//   bits 19-18: ca (2bit)  3×2 灰度网格左上
//   bits 17-16: cb (2bit)  3×2 灰度网格中上
//   bits 15-14: cc (2bit)  3×2 灰度网格右上
//   bits 13-12: cd (2bit)  3×2 灰度网格左下
//   bits 11-10: ce (2bit)  3×2 灰度网格中下
//   bits 9-8:   cf (2bit)  3×2 灰度网格右下
//   bits 7-6:   ll (2bit)  主色亮度
//   bits 5-3:   aaa (3bit) 主色 a 轴
//   bits 2-0:   bbb (3bit) 主色 b 轴
package blobhash

import (
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"os"
)

// FromFile 从图片文件生成 20bit blobhash 整数。
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

// Encode 把 image.Image 编码为 20bit 整数。
func Encode(img image.Image) int {
	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()

	// 1. 提取平均色 → Oklab → 8bit
	var sumR, sumG, sumB float64
	var pxCount int
	for y := bounds.Min.Y; y < bounds.Max.Y; y += 4 { // 采样步长4加速
		for x := bounds.Min.X; x < bounds.Max.X; x += 4 {
			r, g, b, _ := img.At(x, y).RGBA()
			sumR += float64(r) / 65535.0
			sumG += float64(g) / 65535.0
			sumB += float64(b) / 65535.0
			pxCount++
		}
	}
	if pxCount == 0 {
		pxCount = 1
	}
	avgR, avgG, avgB := sumR/float64(pxCount), sumG/float64(pxCount), sumB/float64(pxCount)
	ll, aaa, bbb := rgbToOklabBits(avgR, avgG, avgB)

	// 2. 3×2 灰度网格 → 12bit
	ca, cb, cc, cd, ce, cf := grid3x2Greyscale(img, bounds, w, h)

	// 3. 位打包
	result := ca<<18 | cb<<16 | cc<<14 | cd<<12 | ce<<10 | cf<<8 | ll<<6 | aaa<<3 | bbb
	return result
}

// rgbToOklabBits 把 sRGB [0,1] 转 Oklab，量化为 8bit（2+3+3）。
func rgbToOklabBits(r, g, b float64) (ll, aaa, bbb int) {
	// sRGB → linear
	r = srgbToLinear(r)
	g = srgbToLinear(g)
	b = srgbToLinear(b)

	// linear RGB → LMS
	l := 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
	m := 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
	s := 0.0883024619*r + 0.2817188376*g + 0.6299787005*b

	// cube root
	l_ := math.Cbrt(l)
	m_ := math.Cbrt(m)
	s_ := math.Cbrt(s)

	// LMS → Oklab
	L := 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_
	a := 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_
	bOklab := 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_

	// 量化（与 CSS 解码公式互逆）
	// CSS: ll/3*0.6+0.2 → encode: (L-0.2)/0.6*3
	ll = clampRound((L-0.2)/0.6*3, 0, 3)
	// CSS: aaa/8*0.7-0.35 → encode: (a+0.35)/0.7*8
	aaa = clampRound((a+0.35)/0.7*8, 0, 7)
	// CSS: (bbb+1)/8*0.7-0.35 → encode: (b+0.35)/0.7*8-1
	bbb = clampRound((bOklab+0.35)/0.7*8-1, 0, 7)

	return ll, aaa, bbb
}

// grid3x2Greyscale 把图片分为 3×2 网格，每格取平均灰度，量化为 2bit。
// 网格顺序与 CSS radial-gradient 一致：
//
//	ca | cb | cc
//	cd | ce | cf
func grid3x2Greyscale(img image.Image, bounds image.Rectangle, w, h int) (ca, cb, cc, cd, ce, cf int) {
	cells := [6]float64{}
	counts := [6]int{}

	cellW := w / 3
	cellH := h / 2

	for y := bounds.Min.Y; y < bounds.Max.Y; y += 2 {
		for x := bounds.Min.X; x < bounds.Max.X; x += 2 {
			r, g, b, _ := img.At(x, y).RGBA()
			brightness := (0.299*float64(r) + 0.587*float64(g) + 0.114*float64(b)) / 65535.0

			cx := (x - bounds.Min.X) / max(cellW, 1)
			cy := (y - bounds.Min.Y) / max(cellH, 1)
			if cx > 2 {
				cx = 2
			}
			if cy > 1 {
				cy = 1
			}
			idx := cy*3 + cx
			cells[idx] += brightness
			counts[idx]++
		}
	}

	// 量化：CSS 是 X/3*60%+20%，即 [0.2,0.8] → encode: (v-0.2)/0.6*3
	result := [6]int{}
	for i := 0; i < 6; i++ {
		if counts[i] > 0 {
			avg := cells[i] / float64(counts[i])
			result[i] = clampRound((avg-0.2)/0.6*3, 0, 3)
		}
	}

	return result[0], result[1], result[2], result[3], result[4], result[5]
}

func srgbToLinear(c float64) float64 {
	if c <= 0.04045 {
		return c / 12.92
	}
	return math.Pow((c+0.055)/1.055, 2.4)
}

func clampRound(v float64, min, max int) int {
	r := int(math.Round(v))
	if r < min {
		return min
	}
	if r > max {
		return max
	}
	return r
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
