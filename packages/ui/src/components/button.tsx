import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactElement, Ref } from 'react';

import { cn } from '../lib/cn.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-control font-medium ' +
    'transition-colors select-none whitespace-nowrap ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    '[&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-ink hover:bg-brand-hover',
        secondary: 'bg-surface-raised text-ink border border-border-strong hover:bg-surface-sunken',
        outline: 'border border-border-strong text-ink hover:bg-surface-sunken',
        ghost: 'text-ink hover:bg-surface-sunken',
        danger: 'bg-danger text-white hover:opacity-90',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Yükleniyor: spinner göster, tıklamayı kilitle. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement> | undefined;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  type = 'button',
  ref,
  ...props
}: ButtonProps): ReactElement {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export { buttonVariants };
