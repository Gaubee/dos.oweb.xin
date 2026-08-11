// shadcn/ui Slot：让复合组件把 props 合并到单一子元素（Button asChild 用）。
import * as React from 'react';

export interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

export const Slot = React.forwardRef<HTMLElement, SlotProps>(
  ({ children, ...props }, ref) => {
    if (!React.isValidElement(children)) return null;
    const childProps = children.props as Record<string, unknown>;
    const merged = {
      ...props,
      ...childProps,
      ref: mergeRefs(ref, childProps.ref as React.Ref<HTMLElement> | undefined),
      style: { ...props.style, ...(childProps.style as object) },
      className: [props.className, childProps.className].filter(Boolean).join(' '),
    };
    return React.cloneElement(children, merged as React.Attributes);
  },
);
Slot.displayName = 'Slot';

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref && typeof ref === 'object') {
        (ref as React.MutableRefObject<T>).current = node;
      }
    }
  };
}
