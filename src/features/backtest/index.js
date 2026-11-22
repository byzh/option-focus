// Public entry for the backtest feature. Only this file is imported by existing code.
import { lazy } from 'react';

// Code-split: the feature's code is not downloaded until the panel is opened.
export const LazyBacktestPanel = lazy(() => import('./components/BacktestPanel'));

export { default as BacktestErrorBoundary } from './BacktestErrorBoundary';
