// 加载与错误状态组件。
import { AlertCircle } from 'lucide-react';

interface LoadingProps {
  /** 无障碍朗读文本（视觉上不展示，skeleton 已表达加载态） */
  label?: string;
  /** skeleton 占位卡片数量，匹配 GameGrid 视觉密度 */
  count?: number;
}

/**
 * Skeleton 加载态：灰色脉冲占位卡，预演 GameGrid 布局，
 * 比旋转 spinner 更具“内容即将填充”的空间感。
 */
export function Loading({ label = '加载中…', count = 12 }: LoadingProps) {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4"
      role="status"
      aria-live="polite"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border">
          <div className="skeleton aspect-[3/2]" />
          <div className="space-y-2 p-2.5">
            <div className="skeleton h-3.5 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 text-destructive">
      <AlertCircle className="h-6 w-6" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
