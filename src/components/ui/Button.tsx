'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'glow';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const variantStyles = {
  primary:
    'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500 active:from-violet-700 active:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 disabled:shadow-none',
  glow:
    'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-[0_0_24px_rgba(168,85,247,0.45)] hover:shadow-[0_0_32px_rgba(168,85,247,0.6)] active:shadow-[0_0_16px_rgba(168,85,247,0.3)] disabled:from-gray-400 disabled:to-gray-400 disabled:shadow-none',
  secondary: 'bg-white/10 text-white hover:bg-white/15 active:bg-white/20',
  outline:
    'border border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100',
  ghost: 'text-gray-500 hover:bg-gray-100 active:bg-gray-200',
};

const sizeStyles = {
  sm: 'h-9 px-4 text-sm rounded-lg',
  md: 'h-11 px-5 text-sm rounded-xl',
  lg: 'h-[52px] px-6 text-base rounded-2xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center font-semibold transition-all duration-200 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
