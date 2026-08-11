// BlurhashImage：blurhash 占位 + 真实图淡入的封面组件。
//
// 正交意图：
//   1. blurhash 解码为 dataURL（模糊背景，加载前展示）
//   2. 真实图 object-contain 显示（不裁剪），加载后淡入
//   3. 容器背景用 blurhash dataURL 填充（cover 撑满，填充 contain 留白）
//
// 布局：blurhash 背景 cover 撑满 → 真实图 contain 居中 → 空白处透出模糊背景。
// 这样横向封面不被裁，且加载体验平滑（模糊→清晰淡入）。
import { useMemo, useState, type CSSProperties } from 'react';
import { decode } from 'blurhash';
import { cn } from '@/lib/utils';

interface BlurhashImageProps {
  /** 真实封面 URL（无则只显示 blurhash 占位） */
  src?: string;
  /** blurhash 字符串（无则显示纯色背景） */
  blurhash?: string;
  /** 宽高比，如 "3/2" */
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
  const [loaded, setLoaded] = useState(false);

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
    // blurhash 背景放大 + 模糊，撑满容器（填充 contain 留白）
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
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className={cn(
            'absolute inset-0 h-full w-full object-contain transition-opacity duration-500',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}
    </div>
  );
}

function parseAspect(aspect: string): number {
  const [w, h] = aspect.split('/').map(Number);
  return h ? w / h : 1.5;
}
