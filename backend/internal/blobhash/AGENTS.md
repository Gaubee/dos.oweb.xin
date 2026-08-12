# LQIP 模块法则

最后复核：2026-08-12

```
封面图像
    │
    ├─ 代表性 Oklab 调色板颜色 ──> ll | aaa | bbb
    └─ 3 x 2 Oklab L 网格 ───────> ca | cb | cc | cd | ce | cf
                                                     │
                                              打包 20bit - 2^19
                                                     │
                                  frontend/src/index.css（固定解码端）
```

- `frontend/src/index.css` 拥有传输协议解码端。本包不得修改其位布局、偏移或 CSS 公式。
- `Encode` 返回 `packed - 2^19`，合法范围为 `[-524288, 524287]`。
- 基色是同时按图像覆盖面积和 Oklab 色度评分的调色板颜色。禁止只取最大色度网格单元：小面积强调色会劫持基色。
- 网格亮度是带最小跨度的相对 Oklab `L`。禁止裸用六格 `min/max -> [0,3]`：微小采样波动会被伪造成高对比。
- `FromFile` 依赖内容签名而非文件扩展名；必须保留标准库 GIF/JPEG/PNG 解码注册，数据集中已有 GIF 内容但名为 `.jpg` 的封面。
- 编码、调色板选择、颜色转换、网格量化保持在独立文件。变更面向 CSS 的公式时，必须补充有符号打包与三张参考封面的回归测试。

验证：

```sh
go test ./backend/internal/blobhash -v
go run ./backend/cmd/gen-lqip
```
