// BlurhashImage：blurhash 占位 + 真实图直接显示。
//
// 正交意图：
//   1. blurhash 解码为 dataURL（模糊背景，加载前展示）
//   2. 真实图 object-contain 直接显示（不依赖 onLoad 状态机）
//   3. 容器背景用 blurhash dataURL 填充（cover 撑满，填充 contain 留白）
//
// 设计：不用 loaded/opacity 过渡——img 加载完自然显示，加载中透出 blurhash 背景。
// 这比 onLoad 状态机更可靠（避免 StrictMode 双渲染 / lazy loading 导致 onLoad 丢失）。
import { useMemo, type CSSProperties } from 'react';
import { decode } from 'blurhash';
import { cn } from '@/lib/utils';

interface BlurhashImageProps {
  src?: string;
  blurhash?: string;
  aspect?: string;
  alt: string;
  className?: string;
}

export function BlurhashImage({
  src,
  blurhash,
  aspect = '3/2',
  alt,
  className,
}: BlurhashImageProps) {
  // blurhash 解码为 dataURL（固定 32×21，足够模糊效果，体积小）
  const blurDataUrl = useMemo(() => {
    if (!blurhash) return undefined;
    try {
      const width = 32;
      const height = Math.round(width / parseAspect(aspect));
      const pixels = decode(blurhash, width, height);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      const imageData = ctx.createImageData(width, height);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.5);
    } catch {
      return undefined;
    }
  }, [blurhash, aspect]);

  const containerStyle: CSSProperties = {
    aspectRatio: aspect,
    backgroundImage: blurDataUrl ? `url(${blurDataUrl})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: blurDataUrl ? undefined : 'hsl(var(--muted))',
  };

  return (
    <div className={cn('relative overflow-hidden', className)} style={containerStyle}>
      {src ? (
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}
    </div>
  );
}

function parseAspect(aspect: string): number {
  const [w, h] = aspect.split('/').map(Number);
  return h ? w / h : 1.5;
}
