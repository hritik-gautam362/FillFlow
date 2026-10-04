import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 border border-indigo-500/30',
        glow: 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 text-white hover:opacity-95 shadow-lg shadow-indigo-500/25 border border-indigo-400/30 font-semibold',
        secondary:
          'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700/60 shadow-sm',
        outline:
          'border border-slate-700/80 bg-slate-900/60 text-slate-200 hover:bg-slate-800 hover:text-white hover:border-slate-600',
        ghost: 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
        destructive: 'bg-red-600 text-white hover:bg-red-500 shadow-sm',
        link: 'text-indigo-400 underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs rounded-md',
        lg: 'h-12 px-6 text-base rounded-xl',
        icon: 'h-10 w-10 p-0 rounded-lg',
        'icon-sm': 'h-8 w-8 p-0 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
