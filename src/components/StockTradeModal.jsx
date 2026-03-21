import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { calcStockBuy, calcStockSell } from '../calc';
import { getLocalTodayString } from '../utils/dateUtils';
import Card from './ui/Card';
import Button from './ui/Button';

/**
 * Modal for BUY / SELL stock trades.
 * Props:
 *   position   — current STOCK position object
 *   onConfirm  — (action, shares, price, date, notes) => void
 *   onClose    — () => void
 */
function StockTradeModal({ position, onConfirm, onClose }) {
  const [action, setAction]   = useState('BUY');
  const [shares, setShares]   = useState('');
  const [price, setPrice]     = useState('');
  const [date, setDate]       = useState(getLocalTodayString());
  const [notes, setNotes]     = useState('');

  // Reset form when position changes
  useEffect(() => {
    setAction('BUY'); setShares(''); setPrice(''); setDate(getLocalTodayString()); setNotes('');
  }, [position?.id]);

  if (!position) return null;

  const currentAvg    = parseFloat(position.entryPrice) || 0;
  const currentShares = parseInt(position.contracts)    || 0;
  const sharesNum     = parseInt(shares)   || 0;
  const priceNum      = parseFloat(price)  || 0;

  // Live preview
  const preview = (() => {
    if (!sharesNum || !priceNum) return null;
    if (action === 'BUY') {
      const { newAvgCost, newShares } = calcStockBuy(currentAvg, currentShares, priceNum, sharesNum);
      return { newAvgCost, newShares, realizedPnL: null };
    }
    const { realizedPnL, newShares, isClosed } = calcStockSell(currentAvg, currentShares, priceNum, sharesNum);
    return { newAvgCost: currentAvg, newShares, realizedPnL, isClosed };
  })();

  const sellError = action === 'SELL' && sharesNum > currentShares
    ? `最多可卖 ${currentShares} 股` : null;

  const canSubmit = sharesNum > 0 && priceNum > 0 && !sellError;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm(action, sharesNum, priceNum, date, notes.trim());
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-sm p-6 relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">
            股票交易 — <span className="text-teal-600 dark:text-teal-400">{position.ticker}</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {/* Current position summary */}
        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-sm grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-slate-400">当前均价</div>
            <div className="font-mono font-bold text-slate-700 dark:text-slate-200">${currentAvg.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">当前持仓</div>
            <div className="font-mono font-bold text-slate-700 dark:text-slate-200">{currentShares} 股</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Action toggle */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
            {[['BUY', '买入 (Buy)', TrendingUp], ['SELL', '卖出 (Sell)', TrendingDown]].map(([val, label, Icon]) => (
              <button key={val} type="button" onClick={() => setAction(val)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors
                  ${action === val
                    ? val === 'BUY'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-rose-500 text-white'
                    : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50'}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>

          {/* Shares + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400">股数 (Shares)</label>
              <input type="number" min="1" step="1" value={shares} onChange={e => setShares(e.target.value)} required
                className="w-full mt-1 p-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              {sellError && <p className="text-xs text-rose-500 mt-1">{sellError}</p>}
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400">价格 (Price)</label>
              <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required
                className="w-full mt-1 p-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400">日期 (Date)</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full mt-1 p-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400">备注 (Notes)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="可选"
              className="w-full mt-1 p-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          {/* Preview */}
          {preview && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-xs space-y-1">
              {action === 'BUY' ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">新均价</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">${preview.newAvgCost.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">持仓股数</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{preview.newShares} 股</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">本次盈亏</span>
                    <span className={`font-mono font-bold ${preview.realizedPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {preview.realizedPnL >= 0 ? '+' : ''}${preview.realizedPnL.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">卖后剩余</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{preview.newShares} 股</span>
                  </div>
                  {preview.isClosed && (
                    <div className="text-amber-600 dark:text-amber-400 font-medium">将全部清仓</div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">取消</Button>
            <Button type="submit" disabled={!canSubmit}
              className={`flex-1 ${action === 'BUY' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'} text-white disabled:opacity-50 disabled:cursor-not-allowed`}>
              确认{action === 'BUY' ? '买入' : '卖出'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default StockTradeModal;
