// 意图（记录时间：2026-08-12 15:44 CST；用户原始输入：「阅读 /tmp/lqip-handoff.md 修复算法问题」）：
//  1. 将图像亮度降采样为固定的 3×2 CSS 渐变布局。
//  2. 量化相对 Oklab 亮度，避免 min/max 放大噪声。
package blobhash

import "image"

const minimumLightnessRange = 0.30

// grid3x2Greyscale 按 CSS 渐变顺序返回 Oklab L 值：
//
//	ca | cb | cc
//	cd | ce | cf
func grid3x2Greyscale(img image.Image) [6]float64 {
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width == 0 || height == 0 {
		return [6]float64{}
	}

	var sums [6]rgb
	var weights [6]float64
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, alpha := img.At(x, y).RGBA()
			colour, weight := unpremultipliedRGB(r, g, b, alpha)
			if weight == 0 {
				continue
			}

			cellX := (x - bounds.Min.X) * 3 / width
			cellY := (y - bounds.Min.Y) * 2 / height
			index := cellY*3 + cellX
			sums[index].r += colour.r * weight
			sums[index].g += colour.g * weight
			sums[index].b += colour.b * weight
			weights[index] += weight
		}
	}

	var values [6]float64
	for index := range values {
		if weights[index] == 0 {
			continue
		}
		average := rgb{
			r: sums[index].r / weights[index],
			g: sums[index].g / weights[index],
			b: sums[index].b / weights[index],
		}
		values[index] = rgbToOklab(average).l
	}
	return values
}

func quantizeGreyscale(values [6]float64, baseL float64) [6]int {
	minimum, maximum := values[0], values[0]
	for _, value := range values[1:] {
		if value < minimum {
			minimum = value
		}
		if value > maximum {
			maximum = value
		}
	}

	// 50% 中性 hard-light 图层会保留基色。围绕该中点编码，只有有效 L 对比才
	// 使用完整 2bit 范围；量化后的基色 L 是全透明单元的兜底值。
	centre := (minimum + maximum) / 2
	if minimum == 0 && maximum == 0 && baseL != 0 {
		centre = baseL
	}
	span := maximum - minimum
	if span < minimumLightnessRange {
		span = minimumLightnessRange
	}

	var result [6]int
	for index, value := range values {
		normalized := clamp(0.5+(value-centre)/span, 0, 1)
		result[index] = clampRound(normalized*3, 0, 3)
	}
	return result
}

func unpremultipliedRGB(r, g, b, alpha uint32) (rgb, float64) {
	if alpha == 0 {
		return rgb{}, 0
	}
	weight := float64(alpha) / 65535
	return rgb{
		r: clamp(float64(r)/float64(alpha), 0, 1),
		g: clamp(float64(g)/float64(alpha), 0, 1),
		b: clamp(float64(b)/float64(alpha), 0, 1),
	}, weight
}

func clampInt(value, minimum, maximum int) int {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}
	return value
}

func maxInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}
