// BlurhashImage：blurhash 占位 + 真实图直接显示。
// 基于 canvas putImageData 直接渲染像素（不用 toDataURL 避免 JPEG 编码开销），
// CSS 放大 + blur 实现模糊占位效果。
import { useEffect, useRef } from 'react';
import { decode } from 'blurhash';
import { cn } from '@/lib/utils';

// 全局缓存：blurhash 字符串 → ImageData（同一 hash 只解码一次）
const blurCache = new Map<string, ImageData>();

function getBlurData(hash: string, w: number, h: number): ImageData | null {
  const key = `${hash}:${w}x${h}`;
  if (blurCache.has(key)) return blurCache.get(key)!;
  try {
    const pixels = decode(hash, w, h);
    const data = new ImageData(new Uint8ClampedArray(pixels), w, h);
    blurCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

interface Props {
  src?: string;
  blurhash?: string;
  aspect?: string;
  alt: string;
  className?: string;
}

export function BlurhashImage({ src, blurhash, aspect = '3/2', alt, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!blurhash || !canvasRef.current) return;
    const w = 32;
    const h = Math.round(w / parseAspect(aspect));
    const data = getBlurData(blurhash, w, h);
    if (!data) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    canvasRef.current.width = w;
    canvasRef.current.height = h;
    ctx.putImageData(data, 0, 0);
  }, [blurhash, aspect]);

  return (
    <div className={cn('relative overflow-hidden bg-muted', className)} style={{ aspectRatio: aspect }}>
      {blurhash && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full scale-110"
          style={{ filter: 'blur(8px)', imageRendering: 'auto' }}
        />
      )}
      {src && (
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-contain" />
      )}
    </div>
  );
}

function parseAspect(aspect: string): number {
  const [w, h] = aspect.split('/').map(Number);
  return h ? w / h : 1.5;
}
