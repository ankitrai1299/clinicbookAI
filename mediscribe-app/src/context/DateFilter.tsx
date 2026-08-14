// The dashboard's selected date range, shared by the dashboard and the four
// drill-down screens.
//
// It lives in context rather than in each screen's own state so that opening a
// card carries the filter with it: picking "This Week" and tapping Draft
// Reports shows this week's drafts, and coming back still shows this week.
import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { DateRange, DEFAULT_RANGE } from '../utils/dateRange';

interface DateFilterValue {
  range: DateRange;
  setRange: (range: DateRange) => void;
}

const DateFilterContext = createContext<DateFilterValue | null>(null);

export function DateFilterProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  const value = useMemo(() => ({ range, setRange }), [range]);
  return <DateFilterContext.Provider value={value}>{children}</DateFilterContext.Provider>;
}

export function useDateFilter(): DateFilterValue {
  const ctx = useContext(DateFilterContext);
  if (!ctx) throw new Error('useDateFilter must be used within DateFilterProvider');
  return ctx;
}
