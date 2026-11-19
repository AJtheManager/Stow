# Savings Statistics Dashboard - Issue #580

## Overview
This document outlines the specification for the Savings Statistics Dashboard feature, which provides users with comprehensive savings performance and pattern analysis.

## Feature Description
The savings statistics dashboard displays key metrics and visualizations to help users understand their savings behavior and performance over time.

## Key Metrics

### 1. Total Saved
- Aggregates savings across all user accounts
- Updated in real-time on deposit events
- Displayed with currency formatting

### 2. Average Monthly Deposit
- Calculates mean deposit amount per month
- Based on historical deposit data
- Formatted with 2 decimal places

### 3. Savings Rate
- Percentage of income saved per month
- Calculated as: (Total Deposits / Monthly Income) * 100
- Updated monthly

### 4. Deposit Frequency Analysis
- Categorizes deposits by frequency:
  - Daily: Deposits made every day or nearly every day
  - Weekly: Deposits made 1-3 times per week
  - Monthly: Deposits made once per month or less
- Displays count of deposits in each category

### 5. Savings Distribution
- Visualizes balance across multiple accounts
- Pie or bar chart showing percentage of total savings per account
- Excludes accounts with zero balance

### 6. Longest Savings Streak
- Tracks consecutive days with deposits
- Resets to zero on day without deposit
- Displays current streak and personal record

### 7. Month-to-Month Comparison
- Compares current month metrics to previous month
- Shows percentage change (+/- indicator)
- Metrics included:
  - Total deposits this month vs last month
  - Average deposit amount comparison
  - Savings rate comparison

## Widget Customization

### Supported Widgets
1. Total Saved Card
2. Average Monthly Deposit Card
3. Savings Rate Card
4. Deposit Frequency Chart
5. Savings Distribution Chart
6. Savings Streak Badge
7. Month Comparison Table

### Customization Features
- Users can hide/show individual widgets
- Drag-and-drop widget reordering
- Persist user layout preferences in localStorage or database
- Reset to default layout option

## Performance Requirements
- Dashboard should load within 2 seconds
- Should handle datasets with 1000+ deposit records
- Charts should render smoothly with up to 12 months of data

## Data Source
All metrics pull from the savings and deposit APIs:
- `/api/savings/summary` - Overview metrics
- `/api/deposits/history` - Historical deposit data
- `/api/accounts` - Account balance information

## Testing Strategy
- Unit tests for metric calculation functions
- Integration tests to verify API data accuracy
- E2E tests validating dashboard load and chart rendering
- Performance tests with large datasets

## Related Files
- `frontend/src/app/dashboard/page.tsx` - Main dashboard page
- `frontend/src/components/dashboard/StatsWidget.tsx` - Widget component
- `frontend/src/hooks/useSavingsStats.ts` - Custom hook for stats data

## Acceptance Criteria
✓ Users have comprehensive savings statistics view
✓ All metrics calculated correctly and displayed with current data
✓ Charts render with accurate data representation
✓ Widget customization persists across sessions
✓ Dashboard loads quickly even with large datasets
✓ Validated by E2E test suite
