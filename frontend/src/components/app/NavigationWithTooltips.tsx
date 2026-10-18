'use client';

import { SmartPreloadLink } from './PreloadLink';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { 
  LayoutDashboard, 
  PiggyBank, 
  Activity, 
  Settings, 
  ArrowUpDown,
  Users 
} from 'lucide-react';

/**
 * Navigation menu with code-split route preloading and contextual help tooltips
 * 
 * This component demonstrates:
 * - Code splitting with hover-based preloading for instant navigation
 * - Contextual help tooltips for better UX
 * - Accessible navigation with proper ARIA labels
 */
export function NavigationWithTooltips() {
  const navigationItems = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      helpText: 'View your savings overview, recent activity, and account summary',
    },
    {
      href: '/savings',
      label: 'Savings',
      icon: PiggyBank,
      helpText: 'Manage your flexible, locked, goal-based, and group savings accounts',
    },
    {
      href: '/ramps',
      label: 'Deposit/Withdraw',
      icon: ArrowUpDown,
      helpText: 'Add funds to your account or withdraw to your bank account',
    },
    {
      href: '/activity',
      label: 'Activity',
      icon: Activity,
      helpText: 'View your transaction history and account activity',
    },
    {
      href: '/referrals',
      label: 'Referrals',
      icon: Users,
      helpText: 'Invite friends and earn rewards for successful referrals',
    },
    {
      href: '/settings',
      label: 'Settings',
      icon: Settings,
      helpText: 'Manage your account preferences, security, and notifications',
    },
  ];

  return (
    <nav 
      className="flex flex-col gap-1 p-4"
      aria-label="Main navigation"
    >
      {navigationItems.map((item) => {
        const Icon = item.icon;
        
        return (
          <div key={item.href} className="flex items-center gap-2">
            <SmartPreloadLink
              href={item.href}
              className="
                flex items-center gap-3 px-4 py-2.5 rounded-lg
                text-gray-700 dark:text-gray-200
                hover:bg-gray-100 dark:hover:bg-gray-800
                focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2
                transition-colors
                flex-1
              "
              aria-label={item.label}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="font-medium">{item.label}</span>
            </SmartPreloadLink>
            
            <HelpTooltip
              helpText={item.helpText}
              position="right"
              size="sm"
              ariaLabel={`Help for ${item.label}`}
            />
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Example component showing tooltip usage in forms
 */
export function SavingsFormWithHelp() {
  return (
    <form className="space-y-6 max-w-md p-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <label htmlFor="amount" className="block text-sm font-medium text-text">
            Savings Amount
          </label>
          <HelpTooltip
            helpText="Enter the amount in USDC you want to save. Minimum: 10 USDC"
            size="sm"
          />
        </div>
        <input
          type="number"
          id="amount"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
          placeholder="0.00"
        />
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <label htmlFor="duration" className="block text-sm font-medium text-text">
            Lock Duration
          </label>
          <HelpTooltip
            helpText="Choose how long to lock your savings. Longer durations typically offer higher yields."
            size="sm"
          />
        </div>
        <select
          id="duration"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
        >
          <option value="">Select duration</option>
          <option value="30">30 days - 3% APY</option>
          <option value="90">90 days - 5% APY</option>
          <option value="180">180 days - 7% APY</option>
          <option value="365">1 year - 10% APY</option>
        </select>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <label htmlFor="auto-compound" className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-compound"
              className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
            />
            <span className="text-sm font-medium text-text">Auto-compound yields</span>
          </label>
          <HelpTooltip
            helpText="Automatically reinvest earned yields to maximize returns through compound interest"
            size="sm"
          />
        </div>
      </div>

      <button
        type="submit"
        className="
          w-full px-4 py-2 bg-brand text-white rounded-lg
          hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand
          transition-colors
        "
      >
        Create Locked Savings
      </button>
    </form>
  );
}
