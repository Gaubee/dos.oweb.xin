// 打包标准说明组件（DOS + PlayCanvas 统一折叠式布局）。
// 正交意图：仅展示，按 engine 渲染对应规范 + 完整下载 URL 示例。
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  /** "dos" | "playcanvas"，决定展示哪套规范 */
  engine: 'dos' | 'playcanvas';
}

export function PackingGuide({ engine }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardContent className="p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-sm font-medium"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {engine === 'dos' ? 'DOS 游戏打包标准' : 'PlayCanvas 游戏打包标准'}
        </button>
        {open && engine === 'dos' && <DosSpec />}
        {open && engine === 'playcanvas' && <PlaycanvasSpec />}
      </CardContent>
    </Card>
  );
}

function DosSpec() {
  return (
    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
      <p>DOS 游戏需打包为 zip，上传到镜像源后通过 identifier 下载。zip 内结构：</p>
      <pre className="bg-muted p-2 rounded text-xs">{`仙剑奇侠传.zip
├── PAL!.EXE        ← 启动可执行文件（对应 executable 字段）
├── *.DAT           ← 游戏数据文件
├── cover.png       ← 封面（可选，也可单独上传）
└── dosbox.conf     ← DOSBox 配置（可选）`}</pre>
      <p>必填字段：</p>
      <ul className="ml-4 list-disc space-y-0.5">
        <li><b>identifier</b>：游戏唯一标识（中文，同时是 zip 文件名 + 封面目录名）</li>
        <li><b>executable</b>：zip 内的启动 .EXE/.COM 文件名</li>
        <li><b>sha256</b>：zip 文件的 SHA-256 哈希（用于下载校验）</li>
        <li><b>filesize</b>：zip 文件字节数</li>
      </ul>
      <p>计算 sha256（macOS）：<code className="bg-muted px-1 rounded">shasum -a 256 仙剑奇侠传.zip</code></p>
      <p>zip 上传到镜像源，前端下载时按 identifier 匹配。完整下载 URL 示例：</p>
      <pre className="bg-muted p-2 rounded text-xs">{`# dos-bin 镜像源
https://dos-bin.zczc.cz/仙剑奇侠传.zip

# 自托管镜像源（admin 上传的 zip 存这里）
https://game.oweb.xin/storage/zips/仙剑奇侠传.zip`}</pre>
    </div>
  );
}

function PlaycanvasSpec() {
  return (
    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
      <p>PlayCanvas 游戏打包为 zip，上传后自动存入自托管镜像源。zip 内结构：</p>
      <pre className="bg-muted p-2 rounded text-xs">{`我的游戏.zip
├── game.json    # 清单（必需）
├── index.js     # 入口（必需）
└── assets/      # 可选资源`}</pre>
      <p>game.json 示例：</p>
      <pre className="bg-muted p-2 rounded text-xs">{`{
  "title": "我的游戏",
  "engine": "playcanvas",
  "entry": "index.js",
  "assets": [
    {"path": "assets/bg.png", "type": "texture", "name": "背景"}
  ]
}`}</pre>
      <p>index.js 须导出 boot 函数：</p>
      <pre className="bg-muted p-2 rounded text-xs">{`export function boot({ canvas, app, pc, assets }) {
  // 用 pc.Application 纯代码搭场景
  return () => {}; // cleanup（组件卸载时调用）
}`}</pre>
      <p>上传后自动存入自托管镜像源，前端下载时按 identifier 匹配。完整下载 URL 示例：</p>
      <pre className="bg-muted p-2 rounded text-xs">{`# 自托管镜像源（admin 上传后自动存这里）
https://game.oweb.xin/storage/zips/我的游戏.zip`}</pre>
    </div>
  );
}
