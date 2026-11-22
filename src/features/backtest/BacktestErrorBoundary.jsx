import React from 'react';

/** Contains any crash inside the backtest feature so the scanner keeps working. */
export default class BacktestErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // Message only: never log props/state (they hold the auth user).
    console.error('[backtest] render error:', error?.message);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 max-w-sm space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">回测模块出错，已隔离，不影响其他功能。</p>
          <button
            onClick={() => { this.setState({ failed: false }); this.props.onClose?.(); }}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }
}
