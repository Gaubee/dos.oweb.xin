// 意图（2026-08-12；用户原始输入：「阅读 /tmp/lqip-handoff.md 修复算法问题」）：
//  1. 锁定 20bit CSS 位协议与主色方向。
//  2. 防止小面积高饱和色和低对比 min/max 拉伸回归。
//  3. 以指定真实封面验证视觉编码边界。
package blobhash

import (
	"image"
	"image/color"
	"os"
	"path/filepath"
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

// cellImg 生成每格一个纯色的 3×2 图，顺序与 LQIP 位布局一致。
func cellImg(cells [6]color.RGBA) *image.RGBA {
	const cellW = 100
	const cellH = 100
	img := image.NewRGBA(image.Rect(0, 0, cellW*3, cellH*2))
	for cy := 0; cy < 2; cy++ {
		for cx := 0; cx < 3; cx++ {
			cell := cells[cy*3+cx]
			for y := cy * cellH; y < (cy+1)*cellH; y++ {
				for x := cx * cellW; x < (cx+1)*cellW; x++ {
					img.SetRGBA(x, y, cell)
				}
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

func TestEncode_DominantColourFavoursProminentArea(t *testing.T) {
	// 五格暖橙占绝大多数；一格高饱和蓝色只是视觉强调，不应劫持基色。
	// 旧算法只比较 6 个格子的色度，会错误选择蓝色。
	warmOrange := color.RGBA{190, 95, 35, 255}
	blueAccent := color.RGBA{20, 30, 220, 255}
	img := cellImg([6]color.RGBA{
		warmOrange, warmOrange, warmOrange,
		warmOrange, warmOrange, blueAccent,
	})

	raw := Encode(img) + (1 << 19)
	aaa := (raw >> 3) & 7
	bbb := raw & 7
	if aaa < 4 || bbb < 4 {
		t.Errorf("主色 aaa=%d bbb=%d，期望保留占多数的暖橙色而非蓝色强调", aaa, bbb)
	}
}

func TestEncode_LowContrastGridKeepsHeadroom(t *testing.T) {
	// 格间仅相差 4/255。旧 min/max 归一化会将其放大到 0 和 3。
	// 低对比图片应保持可辨差异，但不应伪造最大对比度。
	dark := color.RGBA{100, 100, 100, 255}
	light := color.RGBA{104, 104, 104, 255}
	img := cellImg([6]color.RGBA{dark, light, dark, light, dark, light})

	raw := Encode(img) + (1 << 19)
	minValue, maxValue := 3, 0
	for _, shift := range []int{18, 16, 14, 12, 10, 8} {
		value := (raw >> shift) & 3
		if value < minValue {
			minValue = value
		}
		if value > maxValue {
			maxValue = value
		}
	}
	if maxValue-minValue > 1 {
		t.Errorf("低对比网格被拉伸为 %d 到 %d，期望量化跨度不超过 1", minValue, maxValue)
	}
}

func TestEncode_ReferenceCovers(t *testing.T) {
	t.Run("3D炸弹人", func(t *testing.T) {
		bits := unpackLQIP(t, encodeCover(t, "3D炸弹人"))
		t.Logf("bits=%+v", bits)
		if bits.grid[2] < 2 {
			t.Errorf("右上黄色区域 cc=%d，期望 >= 2", bits.grid[2])
		}
		if bits.aaa < 4 || bits.bbb < 4 {
			t.Errorf("主色 a=%d b=%d，期望暖色方向", bits.aaa, bits.bbb)
		}
	})

	t.Run("仙剑奇侠传", func(t *testing.T) {
		bits := unpackLQIP(t, encodeCover(t, "仙剑奇侠传"))
		t.Logf("bits=%+v", bits)
		if bits.ll < 2 || bits.aaa < 4 {
			t.Errorf("主色 ll=%d a=%d，期望高亮暖色", bits.ll, bits.aaa)
		}
		if average(bits.grid[:3]) <= average(bits.grid[3:]) {
			t.Errorf("上半格=%v 应比下半格=%v 更亮", bits.grid[:3], bits.grid[3:])
		}
	})

	t.Run("阿拉丁2灯神诅咒", func(t *testing.T) {
		bits := unpackLQIP(t, encodeCover(t, "阿拉丁2灯神诅咒"))
		t.Logf("bits=%+v", bits)
		if bits.ll > 1 || bits.aaa < 4 {
			t.Errorf("主色 ll=%d a=%d，期望暗红或紫色方向", bits.ll, bits.aaa)
		}
		if allEqual(bits.grid[:]) {
			t.Errorf("灰度网格=%v，期望保留暗图层次", bits.grid)
		}
	})
}

func TestEncode_DarkImage(t *testing.T) {
	// 非均匀暗色图（左半比右半稍亮）→ 灰度归一化后有差异
	darkImg := splitImg(15, 10, 12, 8, 5, 6, 300, 200)
	lqip := Encode(darkImg)
	raw := lqip + (1 << 19)

	allSame := true
	first := (raw >> 18) & 3
	for _, shift := range []int{16, 14, 12, 10, 8} {
		if (raw>>shift)&3 != first {
			allSame = false
		}
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
		if lqip < -lqipOffset || lqip >= lqipOffset {
			t.Errorf("lqip=%d 超出有符号 20bit 范围", lqip)
		}
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
		if ll > 3 {
			t.Errorf("ll=%d 超出 [0,3]", ll)
		}
		// aaa 0-7
		aaa := (raw >> 3) & 7
		if aaa > 7 {
			t.Errorf("aaa=%d 超出 [0,7]", aaa)
		}
		// bbb 0-7
		bbb := raw & 7
		if bbb > 7 {
			t.Errorf("bbb=%d 超出 [0,7]", bbb)
		}
	}
}

type lqipBits struct {
	grid [6]int
	ll   int
	aaa  int
	bbb  int
}

func encodeCover(t *testing.T, name string) int {
	t.Helper()
	path := filepath.Join("..", "..", "..", "frontend", "public", "covers", name, "cover.png")
	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("打开测试封面 %s: %v", name, err)
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	if err != nil {
		t.Fatalf("解码测试封面 %s: %v", name, err)
	}
	return Encode(img)
}

func unpackLQIP(t *testing.T, lqip int) lqipBits {
	t.Helper()
	raw := lqip + lqipOffset
	if raw < 0 || raw >= 1<<20 {
		t.Fatalf("lqip=%d 解包后 raw=%d 超出 20bit 范围", lqip, raw)
	}
	return lqipBits{
		grid: [6]int{(raw >> 18) & 3, (raw >> 16) & 3, (raw >> 14) & 3, (raw >> 12) & 3, (raw >> 10) & 3, (raw >> 8) & 3},
		ll:   (raw >> 6) & 3,
		aaa:  (raw >> 3) & 7,
		bbb:  raw & 7,
	}
}

func average(values []int) float64 {
	total := 0
	for _, value := range values {
		total += value
	}
	return float64(total) / float64(len(values))
}

func allEqual(values []int) bool {
	for _, value := range values[1:] {
		if value != values[0] {
			return false
		}
	}
	return true
}
