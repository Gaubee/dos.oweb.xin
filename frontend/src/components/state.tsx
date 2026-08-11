// 加载与错误状态组件。
import { Loader2, AlertCircle } from 'lucide-react';

export function Loading({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      {label}
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
