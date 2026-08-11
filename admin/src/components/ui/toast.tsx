// Toast：全局非阻塞提示（替代 window.alert）。
// 基于 HTML5 Popover API，浏览器自动管理 top-layer 渲染（无需 createPortal/z-index hack）。
//
// 用法：
//   const toast = useToast();
//   toast.error('保存失败');
//   toast.success('已保存');
//
// 技术：每个 toast 是 popover="manual" 元素，通过 showPopover()/hidePopover() 控制。
// 浏览器自动放入 top-layer，永远在最上层，不与 z-index 竞争。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { motion } from 'motion/react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = nextId++;
      setItems((prev) => [...prev, { id, type, message }]);
    },
    [],
  );

  const value: ToastContextValue = {
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
    info: (m) => show(m, 'info'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {items.map((item) => (
        <ToastBubble key={item.id} item={item} onClose={() => remove(item.id)} />
      ))}
    </ToastContext.Provider>
  );
}

/** 单个 toast 气泡：用 popover="manual" 放入浏览器 top-layer。 */
function ToastBubble({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // 挂载后 showPopover 显示
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      el.showPopover();
    } catch {
      // 浏览器不支持 Popover API 时静默 fallback（元素仍然渲染在 DOM 流中）
    }
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    error: <XCircle className="h-4 w-4 text-destructive" />,
    info: <Info className="h-4 w-4 text-blue-500" />,
  };

  return (
    <div
      ref={ref}
      popover="manual"
      style={{
        position: 'fixed',
        top: `${16 + item.id * 60}px`,
        right: '16px',
        margin: 0,
        background: 'none',
        border: 'none',
        padding: 0,
      }}
    >
      {/* 可见气泡：motion 负责入场（从右滑入 + spring）。每个 toast 独立挂载，入场每次触发。 */}
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg"
      >
        {icons[item.type]}
        <span className="flex-1 whitespace-nowrap">{item.message}</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 <ToastProvider> 内使用');
  return ctx;
}
