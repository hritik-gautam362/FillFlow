import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';

export interface LogoProps {
  /**
   * Display variant:
   * - 'full': The complete official FillFlow horizontal wordmark
   * - 'icon': The square FF monogram app icon
   * - 'responsive': Icon on mobile (<sm), full wordmark on desktop (sm+)
   */
  variant?: 'full' | 'icon' | 'responsive';
  /**
   * Size presets:
   * - 'sm': 28px height (compact, footer)
   * - 'md': 34px height (default navbar)
   * - 'lg': 44px height (auth pages, hero)
   * - 'xl': 56px height (prominent displays)
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Optional company badge to display beside the logo
   */
  companyName?: string;
  /**
   * Optional subtitle below logo (e.g. "B2B AI Discovery & Onboarding")
   */
  subtitle?: string;
  /**
   * Optional status badge (e.g. "Guided Setup")
   */
  badgeText?: string;
  /**
   * If true, wraps in a Next.js Link to "/"
   */
  href?: string;
  className?: string;
  priority?: boolean;
}

const sizeConfig = {
  sm: {
    height: 28,
    width: 107, // 28 * (800 / 210) = 106.67
    iconSize: 28,
  },
  md: {
    height: 34,
    width: 130, // 34 * (800 / 210) = 129.5
    iconSize: 34,
  },
  lg: {
    height: 44,
    width: 168, // 44 * (800 / 210) = 167.6
    iconSize: 44,
  },
  xl: {
    height: 56,
    width: 213, // 56 * (800 / 210) = 213.3
    iconSize: 56,
  },
};

export function Logo({
  variant = 'full',
  size = 'md',
  companyName,
  subtitle,
  badgeText,
  href,
  className = '',
  priority = true,
}: LogoProps) {
  const { height, width, iconSize } = sizeConfig[size];

  const content = (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {/* Logo Image Container with matching dark navy background */}
      <div className="relative flex items-center justify-center shrink-0 rounded-lg overflow-hidden bg-[#152644] group-hover:scale-[1.02] transition-transform duration-200">
        {variant === 'full' && (
          <Image
            src="/images/fillflow-logo.png"
            alt="FillFlow"
            width={width}
            height={height}
            priority={priority}
            className="object-contain block"
            style={{ height: `${height}px`, width: 'auto' }}
          />
        )}

        {variant === 'icon' && (
          <Image
            src="/images/fillflow-icon.png"
            alt="FillFlow"
            width={iconSize}
            height={iconSize}
            priority={priority}
            className="object-contain block rounded-lg"
            style={{ height: `${iconSize}px`, width: `${iconSize}px` }}
          />
        )}

        {variant === 'responsive' && (
          <>
            {/* Mobile icon view */}
            <div className="block sm:hidden">
              <Image
                src="/images/fillflow-icon.png"
                alt="FillFlow"
                width={iconSize}
                height={iconSize}
                priority={priority}
                className="object-contain block rounded-lg"
                style={{ height: `${iconSize}px`, width: `${iconSize}px` }}
              />
            </div>
            {/* Desktop full wordmark view */}
            <div className="hidden sm:block">
              <Image
                src="/images/fillflow-logo.png"
                alt="FillFlow"
                width={width}
                height={height}
                priority={priority}
                className="object-contain block"
                style={{ height: `${height}px`, width: 'auto' }}
              />
            </div>
          </>
        )}
      </div>

      {/* Optional Metadata (Company Badge, Subtitle, Guided Badge) */}
      {(companyName || subtitle || badgeText) && (
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-2">
            {companyName && (
              <span className="py-0.5 px-2 text-[10px] font-medium text-purple-300 bg-purple-900/40 border border-purple-500/30 rounded-full max-w-[140px] truncate">
                {companyName}
              </span>
            )}
            {badgeText && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                {badgeText}
              </span>
            )}
          </div>
          {subtitle && (
            <span className="text-[10px] text-slate-400 hidden md:block tracking-normal">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label="Go to FillFlow home"
        className="group inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg p-0.5 transition-opacity hover:opacity-95"
      >
        {content}
      </Link>
    );
  }

  return content;
}
