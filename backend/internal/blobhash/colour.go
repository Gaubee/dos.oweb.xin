// 意图（2026-08-12；用户原始输入：「阅读 /tmp/lqip-handoff.md 修复算法问题」）：
//  1. 将 sRGB 像素转换为 CSS 解码器使用的 Oklab。
//  2. 量化和反量化固定的 2+3+3 基色字段。
package blobhash

import "math"

type rgb struct {
	r float64
	g float64
	b float64
}

type oklab struct {
	l float64
	a float64
	b float64
}

func rgbToOklab(value rgb) oklab {
	r := srgbToLinear(value.r)
	g := srgbToLinear(value.g)
	b := srgbToLinear(value.b)

	l := 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
	m := 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
	s := 0.0883024619*r + 0.2817188376*g + 0.6299787005*b

	lRoot := math.Cbrt(l)
	mRoot := math.Cbrt(m)
	sRoot := math.Cbrt(s)

	return oklab{
		l: 0.2104542553*lRoot + 0.7936177850*mRoot - 0.0040720468*sRoot,
		a: 1.9779984951*lRoot - 2.4285922050*mRoot + 0.4505937099*sRoot,
		b: 0.0259040371*lRoot + 0.7827717662*mRoot - 0.8086757660*sRoot,
	}
}

func oklabToBits(value oklab) (ll, aaa, bbb int) {
	// 与 frontend/src/index.css 的解码公式互逆。
	ll = clampRound((value.l-0.2)/0.6*3, 0, 3)
	aaa = clampRound((value.a+0.35)/0.7*8, 0, 7)
	bbb = clampRound((value.b+0.35)/0.7*8-1, 0, 7)
	return ll, aaa, bbb
}

func bitsToOklab(ll, aaa, bbb int) oklab {
	return oklab{
		l: float64(ll)/3*0.6 + 0.2,
		a: float64(aaa)/8*0.7 - 0.35,
		b: float64(bbb+1)/8*0.7 - 0.35,
	}
}

func srgbToLinear(value float64) float64 {
	if value <= 0.04045 {
		return value / 12.92
	}
	return math.Pow((value+0.055)/1.055, 2.4)
}

func clampRound(value float64, minimum, maximum int) int {
	rounded := int(math.Round(value))
	if rounded < minimum {
		return minimum
	}
	if rounded > maximum {
		return maximum
	}
	return rounded
}

func clamp(value, minimum, maximum float64) float64 {
	return math.Min(maximum, math.Max(minimum, value))
}
