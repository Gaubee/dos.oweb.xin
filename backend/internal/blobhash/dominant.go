// 意图（记录时间：2026-08-12 15:44 CST；用户原始输入：「阅读 /tmp/lqip-handoff.md 修复算法问题」）：
//  1. 从图像采样构建有界 Oklab 调色板。
//  2. 用覆盖面积和色度共同选择代表性基色。
package blobhash

import (
	"image"
	"math"
)

const (
	paletteSampleLimit    = 4096
	paletteLLevels        = 8
	paletteABLevels       = 8
	minimumColourCoverage = 0.04
	minimumColourChroma   = 0.03
)

type paletteKey struct {
	l int
	a int
	b int
}

type paletteBin struct {
	weight float64
	r      float64
	g      float64
	b      float64
}

// representativeColour 选择同时具备有效覆盖面积和色度的调色板颜色。
// 这使大面积彩色主体优先于中性背景，也避免小面积高饱和强调色替代视觉基色。
func representativeColour(img image.Image) rgb {
	bounds := img.Bounds()
	if bounds.Empty() {
		return rgb{}
	}

	step := paletteSampleStep(bounds.Dx(), bounds.Dy())
	bins := make(map[paletteKey]*paletteBin)
	totalWeight := 0.0

	for y := bounds.Min.Y; y < bounds.Max.Y; y += step {
		for x := bounds.Min.X; x < bounds.Max.X; x += step {
			r, g, b, alpha := img.At(x, y).RGBA()
			colour, weight := unpremultipliedRGB(r, g, b, alpha)
			if weight == 0 {
				continue
			}

			key := paletteKeyFor(rgbToOklab(colour))
			bin := bins[key]
			if bin == nil {
				bin = &paletteBin{}
				bins[key] = bin
			}
			bin.weight += weight
			bin.r += colour.r * weight
			bin.g += colour.g * weight
			bin.b += colour.b * weight
			totalWeight += weight
		}
	}

	if totalWeight == 0 {
		return rgb{}
	}

	var fallback, salient paletteCandidate
	for key, bin := range bins {
		candidate := paletteCandidate{
			key:    key,
			colour: rgb{r: bin.r / bin.weight, g: bin.g / bin.weight, b: bin.b / bin.weight},
			weight: bin.weight,
		}
		if !fallback.set || candidate.weight > fallback.weight || (candidate.weight == fallback.weight && keyBefore(candidate.key, fallback.key)) {
			candidate.set = true
			fallback = candidate
		}

		lab := rgbToOklab(candidate.colour)
		coverage := candidate.weight / totalWeight
		candidate.score = coverage * math.Hypot(lab.a, lab.b)
		if coverage < minimumColourCoverage || math.Hypot(lab.a, lab.b) < minimumColourChroma {
			continue
		}
		if !salient.set || candidate.score > salient.score || (candidate.score == salient.score && keyBefore(candidate.key, salient.key)) {
			candidate.set = true
			salient = candidate
		}
	}

	if salient.set {
		return salient.colour
	}
	return fallback.colour
}

type paletteCandidate struct {
	key    paletteKey
	colour rgb
	weight float64
	score  float64
	set    bool
}

func paletteSampleStep(width, height int) int {
	pixels := float64(width) * float64(height)
	return maxInt(1, int(math.Ceil(math.Sqrt(pixels/float64(paletteSampleLimit)))))
}

func paletteKeyFor(value oklab) paletteKey {
	return paletteKey{
		l: paletteLevel(value.l, 0, 1, paletteLLevels),
		a: paletteLevel(value.a, -0.35, 0.35, paletteABLevels),
		b: paletteLevel(value.b, -0.35, 0.35, paletteABLevels),
	}
}

func paletteLevel(value, minimum, maximum float64, levels int) int {
	level := int(math.Floor((value - minimum) / (maximum - minimum) * float64(levels)))
	return clampInt(level, 0, levels-1)
}

func keyBefore(left, right paletteKey) bool {
	if left.l != right.l {
		return left.l < right.l
	}
	if left.a != right.a {
		return left.a < right.a
	}
	return left.b < right.b
}
