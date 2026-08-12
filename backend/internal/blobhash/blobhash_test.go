package blobhash

import (
	"image"
	"image/color"
	"testing"
)

// 生成纯色测试图（给定 RGB）
func solidImg(r, g, b uint8, w, h int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetRGBA(x, y, color.RGBA{r, g, b, 255})
		}
	}
	return img
}

// 两区域图：上半一个色，下半一个色
func splitImg(r1, g1, b1, r2, g2, b2 uint8, w, h int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			if y < h/2 {
				img.SetRGBA(x, y, color.RGBA{r1, g1, b1, 255})
			} else {
				img.SetRGBA(x, y, color.RGBA{r2, g2, b2, 255})
			}
		}
	}
	return img
}

// 右上角黄色图：全图暗灰 + 右上角明黄
func yellowCornerImg() *image.RGBA {
	w, h := 600, 400
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			// 右上角格（cx=2, cy=0）= 黄色
			if x >= w*2/3 && y < h/2 {
				img.SetRGBA(x, y, color.RGBA{230, 200, 30, 255}) // 黄
			} else {
				img.SetRGBA(x, y, color.RGBA{60, 50, 40, 255}) // 暗灰
			}
		}
	}
	return img
}

func TestEncode_DominantColor(t *testing.T) {
	// 纯红图 → 主色应量化为偏红（aaa 偏大）
	redImg := solidImg(200, 30, 30, 300, 200)
	lqip := Encode(redImg)
	raw := lqip + (1 << 19)
	aaa := (raw >> 3) & 7
	if aaa < 5 {
		t.Errorf("纯红图 aaa=%d，期望 >= 5（偏红）", aaa)
	}

	// 纯绿图 → aaa 应偏小（Oklab a 轴绿为负）
	greenImg := solidImg(30, 200, 30, 300, 200)
	lqip = Encode(greenImg)
	raw = lqip + (1 << 19)
	aaa = (raw >> 3) & 7
	if aaa > 3 {
		t.Errorf("纯绿图 aaa=%d，期望 <= 3（偏绿方向）", aaa)
	}
}

func TestEncode_YellowCorner(t *testing.T) {
	// 右上角黄色图 → 主色应选黄色格（色度最大）
	// 右上角格是 cc（bits 15-14）
	img := yellowCornerImg()
	lqip := Encode(img)
	raw := lqip + (1 << 19)
	cc := (raw >> 14) & 3 // 右上灰度
	ll := (raw >> 6) & 3  // 主色亮度

	// 右上角黄色格应该亮度高（黄色是高亮色）
	if cc < 2 {
		t.Errorf("右上角黄色格 cc=%d，期望 >= 2（高亮）", cc)
	}
	// 主色应该偏暖（不是纯灰）
	aaa := (raw >> 3) & 7
	bbb := raw & 7
	// 黄色在 Oklab 里 a>0 且 b>0
	if aaa < 4 || bbb < 4 {
		t.Errorf("黄色图主色 aaa=%d bbb=%d，期望都 >= 4（暖色）", aaa, bbb)
	}
	// L 应该较亮（黄色是高 L 值）
	if ll < 2 {
		t.Errorf("黄色图主色 ll=%d，期望 >= 2（高亮度）", ll)
	}
}

func TestEncode_DarkImage(t *testing.T) {
	// 非均匀暗色图（左半比右半稍亮）→ 灰度归一化后有差异
	darkImg := splitImg(15, 10, 12, 8, 5, 6, 300, 200)
	lqip := Encode(darkImg)
	raw := lqip + (1 << 19)

	allSame := true
	first := (raw >> 18) & 3
	for _, shift := range []int{16, 14, 12, 10, 8} {
		if (raw>>shift)&3 != first { allSame = false }
	}
	if allSame {
		t.Error("非均匀暗色图灰度全相同，期望归一化后有差异")
	}
}

func TestEncode_UnpackRoundtrip(t *testing.T) {
	// 编码后解包，验证各字段在合法范围
	for _, img := range []image.Image{
		solidImg(255, 0, 0, 300, 200),
		solidImg(0, 255, 0, 300, 200),
		solidImg(128, 128, 128, 300, 200),
		splitImg(255, 0, 0, 0, 0, 255, 300, 200),
		yellowCornerImg(),
	} {
		lqip := Encode(img)
		raw := lqip + (1 << 19)
		// 灰度 0-3
		for _, shift := range []int{18, 16, 14, 12, 10, 8} {
			v := (raw >> shift) & 3
			if v < 0 || v > 3 {
				t.Errorf("灰度值 %d 超出 [0,3]", v)
			}
		}
		// ll 0-3
		ll := (raw >> 6) & 3
		if ll > 3 { t.Errorf("ll=%d 超出 [0,3]", ll) }
		// aaa 0-7
		aaa := (raw >> 3) & 7
		if aaa > 7 { t.Errorf("aaa=%d 超出 [0,7]", aaa) }
		// bbb 0-7
		bbb := raw & 7
		if bbb > 7 { t.Errorf("bbb=%d 超出 [0,7]", bbb) }
	}
}
