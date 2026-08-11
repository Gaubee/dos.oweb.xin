// Package blurhash 封装封面 blurhash 生成。
//
// 正交意图：仅此一个 —— 从图片文件路径生成 blurhash 字符串。
// 用于：①admin 上传封面时算 blurhash；②一次性批量生成脚本。
package blurhash

import (
	"fmt"
	"image"
	_ "image/jpeg" // 注册 jpeg 解码
	_ "image/png"  // 注册 png 解码
	"os"

	"github.com/buckket/go-blurhash"
)

// ComponentX/Y：blurhash 的频率分量数。
// 4×3 是社区推荐值（~20 字符 hash），平衡精度与体积。
const (
	ComponentX = 4
	ComponentY = 3
)

// FromFile 从图片文件路径生成 blurhash 字符串。
func FromFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("打开图片失败: %w", err)
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	if err != nil {
		return "", fmt.Errorf("解码图片失败（格式不支持？）: %w", err)
	}

	hash, err := blurhash.Encode(ComponentX, ComponentY, img)
	if err != nil {
		return "", fmt.Errorf("生成 blurhash 失败: %w", err)
	}
	return hash, nil
}
