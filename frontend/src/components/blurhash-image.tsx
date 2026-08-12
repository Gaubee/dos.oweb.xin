// LqipImage：纯 CSS LQIP 占位 + 真实图显示。
// 参考 leanrada.com/notes/css-only-lqip——零 JS、零 canvas、零 toDataURL。
//
// 原理：Go 端预计算 20bit 整数（Oklab 主色 + 3×2 灰度网格），
// 设为 CSS 自定义属性 --lqip，CSS 用 mod()/pow()/round() 解码 + radial-gradient 渲染。
// 真实图叠在上层，加载完自然覆盖。
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
      style={{
        '--lqip': lqip ?? 0,
        aspectRatio: aspect,
      } as React.CSSProperties}
    >
      {src && (
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-contain" />
      )}
    </div>
  );
}
