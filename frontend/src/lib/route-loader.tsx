'use client';

import { lazy, Suspense, ComponentType, ReactNode } from 'react';

/**
 * Configuration for lazy-loaded route components
 */
export interface LazyRouteConfig {
  /** The dynamic import function */
  loader: () => Promise<{ default: ComponentType<any> }>;
  /** Optional loading fallback component */
  fallback?: ReactNode;
  /** Optional error boundary fallback */
  errorFallback?: ReactNode;
  /** Preload the component (useful for predictive loading) */
  preload?: boolean;
}

/**
 * Creates a lazy-loaded route component with Suspense boundary
 * 
 * @example
 * ```tsx
 * const DashboardPage = createLazyRoute({
 *   loader: () => import('./pages/Dashboard'),
 *   fallback: <DashboardSkeleton />
 * });
 * ```
 */
export function createLazyRoute({
  loader,
  fallback = <RouteLoadingFallback />,
}: LazyRouteConfig) {
  const LazyComponent = lazy(loader);

  return function LazyRoute(props: any) {
    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

/**
 * Default loading fallback for route transitions
 */
export function RouteLoadingFallback() {
  return (
    <div 
      className="flex items-center justify-center min-h-[400px]"
      role="status"
      aria-live="polite"
      aria-label="Loading page content"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-12 h-12">
          {/* Spinning loader */}
          <div className="absolute inset-0 border-4 border-gray-200 dark:border-gray-700 rounded-full" />
          <div className="absolute inset-0 border-4 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Loading...
        </p>
      </div>
    </div>
  );
}

/**
 * Skeleton loading component for route transitions
 */
export function RouteSkeletonFallback() {
  return (
    <div className="animate-pulse space-y-4 p-6" aria-label="Loading content">
      {/* Header skeleton */}
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
      
      {/* Content skeleton */}
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6" />
      </div>

      {/* Card skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * Preload a lazy route component
 * 
 * Useful for:
 * - Mouse hover on navigation links
 * - Intersection observer for visible links
 * - Predictive prefetching based on user behavior
 * 
 * @example
 * ```tsx
 * <Link
 *   href="/dashboard"
 *   onMouseEnter={() => preloadRoute(() => import('./pages/Dashboard'))}
 * >
 *   Dashboard
 * </Link>
 * ```
 */
export function preloadRoute(
  loader: () => Promise<{ default: ComponentType<any> }>
): void {
  // Trigger the import but don't wait for it
  loader().catch(() => {
    // Silently fail - the component will be loaded again on navigation
  });
}

/**
 * Hook to preload routes on hover or visibility
 * 
 * @example
 * ```tsx
 * const preloadHandlers = useRoutePreload(() => import('./pages/Settings'));
 * 
 * <Link href="/settings" {...preloadHandlers}>
 *   Settings
 * </Link>
 * ```
 */
export function useRoutePreload(
  loader: () => Promise<{ default: ComponentType<any> }>
) {
  const handleMouseEnter = () => {
    preloadRoute(loader);
  };

  const handleFocus = () => {
    preloadRoute(loader);
  };

  return {
    onMouseEnter: handleMouseEnter,
    onFocus: handleFocus,
  };
}

/**
 * Route loading state manager for more complex loading scenarios
 */
export class RouteLoader {
  private static loadingRoutes = new Map<string, Promise<any>>();

  /**
   * Load a route with caching to prevent duplicate requests
   */
  static load(
    routeId: string,
    loader: () => Promise<{ default: ComponentType<any> }>
  ): Promise<{ default: ComponentType<any> }> {
    if (!this.loadingRoutes.has(routeId)) {
      this.loadingRoutes.set(routeId, loader());
    }
    return this.loadingRoutes.get(routeId)!;
  }

  /**
   * Clear cached route
   */
  static clear(routeId: string): void {
    this.loadingRoutes.delete(routeId);
  }

  /**
   * Clear all cached routes
   */
  static clearAll(): void {
    this.loadingRoutes.clear();
  }

  /**
   * Preload multiple routes
   */
  static preloadAll(
    routes: Array<{ id: string; loader: () => Promise<{ default: ComponentType<any> }> }>
  ): void {
    routes.forEach(({ id, loader }) => {
      this.load(id, loader).catch(() => {
        // Silently fail
      });
    });
  }
}
