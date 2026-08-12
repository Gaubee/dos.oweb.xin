// LqipImage：纯 CSS LQIP 占位（参考 leanrada.com/notes/css-only-lqip）。
// 零 canvas、零 toDataURL、零 JS 解码。组件只设 --lqip 整数，CSS 全部解码。
import { type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  src?: string;
  /** Go 端预计算的 20bit LQIP 整数 */
  lqip?: number;
  aspect?: string;
  alt: string;
  className?: string;
}

export function BlurhashImage({ src, lqip, aspect = '3/2', alt, className }: Props) {
  if (!src && !lqip) {
    return <div className={cn('bg-muted', className)} style={{ aspectRatio: aspect }} />;
  }

  return (
    <div
      className={cn('lqip-container relative overflow-hidden', className)}
      style={{ '--lqip': lqip ?? 0, aspectRatio: aspect } as CSSProperties}
    >
      {src && <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-contain" />}
    </div>
  );
}
