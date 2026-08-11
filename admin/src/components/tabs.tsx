// 轻量 Tab 组件（无需第三方依赖）。
// 用法：<Tabs tabs={[{label, content}]} value onChange />
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  value: number;
  onChange: (i: number) => void;
}

export function Tabs({ tabs, value, onChange }: TabsProps) {
  return (
    <div>
      {/* Tab 标签栏 */}
      <div className="flex gap-1 border-b">
        {tabs.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              value === i
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Tab 内容 */}
      <div className="pt-4">{tabs[value]?.content}</div>
    </div>
  );
}
