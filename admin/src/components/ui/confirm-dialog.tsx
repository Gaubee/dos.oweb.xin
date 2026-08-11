// ConfirmDialog：基于 HTML5 <dialog> 的确认对话框（替代 window.confirm）。
//
// 用法：
//   const [confirmOpen, setConfirmOpen] = useState(false);
//   <ConfirmDialog
//     open={confirmOpen}
//     title="确认删除？"
//     description="此操作不可撤销"
//     confirmText="删除"
//     variant="destructive"
//     onConfirm={() => { doDelete(); setConfirmOpen(false); }}
//     onCancel={() => setConfirmOpen(false)}
//   />
import { useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  // open 变化时控制 <dialog> 的 showModal()/close()
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="m-auto w-full max-w-sm rounded-lg border bg-card p-0 shadow-xl backdrop:bg-black/50"
    >
      {/* 仅在 open 时挂载内容：每次打开都重新触发 motion 入场（spring scale 0.95→1 + 淡入）。
          <dialog> 自身保持挂载由 showModal/close 控制。 */}
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          className="p-5"
        >
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <div className="mt-2 text-sm text-muted-foreground">{description}</div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {cancelText}
            </Button>
            <Button
              size="sm"
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              onClick={onConfirm}
            >
              {confirmText}
            </Button>
          </div>
        </motion.div>
      )}
    </dialog>
  );
}
