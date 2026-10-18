'use client';

import Link from 'next/link';
import { ComponentType, ReactNode } from 'react';
import { useRoutePreload } from '@/lib/route-loader';

interface PreloadLinkProps {
  /** The href to navigate to */
  href: string;
  /** The child elements (link text/content) */
  children: ReactNode;
  /** The route component loader to preload */
  loader?: () => Promise<{ default: ComponentType<any> }>;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label */
  'aria-label'?: string;
  /** Whether to prefetch the route (Next.js default behavior) */
  prefetch?: boolean;
  /** Preload strategy */
  preloadStrategy?: 'hover' | 'visible' | 'none';
  [key: string]: any;
}

/**
 * Enhanced Link component that preloads route components on hover/focus
 * 
 * This component extends Next.js Link to support code-split route preloading,
 * improving perceived performance by loading route JavaScript before navigation.
 * 
 * @example
 * ```tsx
 * <PreloadLink
 *   href="/dashboard"
 *   loader={() => import('@/app/(app)/dashboard/page')}
 *   preloadStrategy="hover"
 * >
 *   Dashboard
 * </PreloadLink>
 * ```
 */
export function PreloadLink({
  href,
  children,
  loader,
  className,
  prefetch = true,
  preloadStrategy = 'hover',
  ...props
}: PreloadLinkProps) {
  const preloadHandlers = loader && preloadStrategy === 'hover' 
    ? useRoutePreload(loader)
    : {};

  return (
    <Link
      href={href}
      className={className}
      prefetch={prefetch}
      {...preloadHandlers}
      {...props}
    >
      {children}
    </Link>
  );
}

/**
 * Route preloading map for common routes
 * Maps href paths to their lazy-loaded component imports
 */
export const ROUTE_LOADERS: Record<string, () => Promise<{ default: ComponentType<any> }>> = {
  '/dashboard': () => import('@/app/(app)/dashboard/page'),
  '/savings': () => import('@/app/(app)/savings/page'),
  '/savings/flexible': () => import('@/app/(app)/savings/flexible/page'),
  '/savings/locked': () => import('@/app/(app)/savings/locked/page'),
  '/savings/locked/new': () => import('@/app/(app)/savings/locked/new/page'),
  '/savings/goals': () => import('@/app/(app)/savings/goals/page'),
  '/savings/goals/new': () => import('@/app/(app)/savings/goals/new/page'),
  '/savings/groups': () => import('@/app/(app)/savings/groups/page'),
  '/savings/groups/new': () => import('@/app/(app)/savings/groups/new/page'),
  '/ramps': () => import('@/app/(app)/ramps/page'),
  '/ramps/deposit': () => import('@/app/(app)/ramps/deposit/page'),
  '/ramps/withdraw': () => import('@/app/(app)/ramps/withdraw/page'),
  '/activity': () => import('@/app/(app)/activity/page'),
  '/settings': () => import('@/app/(app)/settings/page'),
  '/referrals': () => import('@/app/(app)/referrals/page'),
};

/**
 * Smart PreloadLink that automatically finds the loader for a given href
 * 
 * @example
 * ```tsx
 * <SmartPreloadLink href="/dashboard">
 *   Dashboard
 * </SmartPreloadLink>
 * ```
 */
export function SmartPreloadLink({
  href,
  ...props
}: Omit<PreloadLinkProps, 'loader'>) {
  const loader = ROUTE_LOADERS[href];

  return (
    <PreloadLink
      href={href}
      loader={loader}
      {...props}
    />
  );
}
