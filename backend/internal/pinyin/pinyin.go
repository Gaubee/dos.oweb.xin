// Package pinyin 中文转拼音，用于排序和搜索。
//
// 正交意图：
//   1. ToPinyin —— 中文转无声调拼音字符串（如"仙剑"→"xianjian"）
//   2. 搜索匹配 —— 判断查询是否匹配拼音首字母或全拼
package pinyin

import (
	"strings"

	"github.com/mozillazg/go-pinyin"
)

// ToPinyin 转无声调全拼（小写）。非中文字符原样保留。
// 如 "仙剑奇侠传" → "xianjianqixiachuan"
func ToPinyin(s string) string {
	a := pinyin.NewArgs()
	a.Style = pinyin.Normal   // 无声调
	result := pinyin.Pinyin(s, a)
	parts := make([]string, len(result))
	for i, r := range result {
		if len(r) > 0 {
			parts[i] = r[0]
		}
	}
	return strings.ToLower(strings.Join(parts, ""))
}

// ToPinyinInitials 转拼音首字母（小写）。非中文字符原样保留。
// 如 "仙剑奇侠传" → "xjjqz"
func ToPinyinInitials(s string) string {
	a := pinyin.NewArgs()
	a.Style = pinyin.FirstLetter // 首字母
	result := pinyin.Pinyin(s, a)
	parts := make([]string, len(result))
	for i, r := range result {
		if len(r) > 0 {
			parts[i] = r[0]
		}
	}
	return strings.ToLower(strings.Join(parts, ""))
}

// Match 判断 query 是否匹配 s 的拼音（全拼子串 或 首字母子串 或 原文子串）。
func Match(s, query string) bool {
	if strings.Contains(strings.ToLower(s), query) {
		return true
	}
	if strings.Contains(ToPinyin(s), query) {
		return true
	}
	if strings.Contains(ToPinyinInitials(s), query) {
		return true
	}
	return false
}
