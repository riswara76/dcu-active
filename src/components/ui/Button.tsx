import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:bg-disabled',
  secondary: 'bg-white text-ink border border-line hover:bg-surface disabled:text-subtle',
  ghost: 'bg-transparent text-primary hover:bg-primary-soft disabled:text-subtle',
  // Destructive actions are outlined + labelled so they never look like the (red) primary action.
  danger: 'bg-white text-danger border-2 border-danger hover:bg-danger-bg disabled:text-subtle disabled:border-line',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  block?: boolean;
  size?: 'md' | 'sm';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, block = false, size = 'md', className = '', disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors',
        'disabled:cursor-not-allowed',
        size === 'md' ? 'min-h-11 px-4 text-base' : 'min-h-9 px-3 text-sm',
        block ? 'w-full' : '',
        VARIANTS[variant],
        className,
      ].join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
