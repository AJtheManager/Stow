'use client';

import { createLazyRoute, RouteSkeletonFallback } from '@/lib/route-loader';

/**
 * Lazy-loaded route components for code splitting
 * 
 * This module exports lazy-loaded versions of major route components
 * to improve initial bundle size and page load performance.
 * 
 * Each route is loaded on-demand when the user navigates to it.
 */

// Dashboard routes
export const LazyDashboard = createLazyRoute({
  loader: () => import('@/app/(app)/dashboard/page'),
  fallback: <DashboardSkeleton />,
});

// Savings routes
export const LazySavingsOverview = createLazyRoute({
  loader: () => import('@/app/(app)/savings/page'),
  fallback: <RouteSkeletonFallback />,
});

export const LazyFlexibleSavings = createLazyRoute({
  loader: () => import('@/app/(app)/savings/flexible/page'),
  fallback: <RouteSkeletonFallback />,
});

export const LazyLockedSavings = createLazyRoute({
  loader: () => import('@/app/(app)/savings/locked/page'),
  fallback: <RouteSkeletonFallback />,
});

export const LazyGoalSavings = createLazyRoute({
  loader: () => import('@/app/(app)/savings/goals/page'),
  fallback: <RouteSkeletonFallback />,
});

export const LazyGroupSavings = createLazyRoute({
  loader: () => import('@/app/(app)/savings/groups/page'),
  fallback: <RouteSkeletonFallback />,
});

// Ramps routes
export const LazyRampsOverview = createLazyRoute({
  loader: () => import('@/app/(app)/ramps/page'),
  fallback: <RouteSkeletonFallback />,
});

export const LazyDepositRamp = createLazyRoute({
  loader: () => import('@/app/(app)/ramps/deposit/page'),
  fallback: <RouteSkeletonFallback />,
});

export const LazyWithdrawRamp = createLazyRoute({
  loader: () => import('@/app/(app)/ramps/withdraw/page'),
  fallback: <RouteSkeletonFallback />,
});

// Activity routes
export const LazyActivity = createLazyRoute({
  loader: () => import('@/app/(app)/activity/page'),
  fallback: <RouteSkeletonFallback />,
});

// Settings routes
export const LazySettings = createLazyRoute({
  loader: () => import('@/app/(app)/settings/page'),
  fallback: <RouteSkeletonFallback />,
});

// Referrals routes
export const LazyReferrals = createLazyRoute({
  loader: () => import('@/app/(app)/referrals/page'),
  fallback: <RouteSkeletonFallback />,
});

/**
 * Dashboard-specific loading skeleton
 */
function DashboardSkeleton() {
  return (
    <div className="animate-pulse p-6 space-y-6" aria-label="Loading dashboard">
      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg" />

      {/* Recent activity skeleton */}
      <div className="space-y-3">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Preload critical routes for faster navigation
 * Call this function on app initialization or user login
 */
export function preloadCriticalRoutes() {
  // Preload dashboard since it's the most common destination
  import('@/app/(app)/dashboard/page').catch(() => {
    // Silently fail - will be loaded on navigation
  });

  // Preload savings overview as it's a primary feature
  import('@/app/(app)/savings/page').catch(() => {
    // Silently fail
  });
}
