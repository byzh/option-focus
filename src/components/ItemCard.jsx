import React, { useState } from 'react';
import {
  Archive, AlertTriangle, RefreshCw, StopCircle,
  History, ChevronUp, Edit3, Trash2, CheckSquare, ArrowRight
} from 'lucide-react';
import { calcNetBasis, calcFinalPnL, calcBreakEven } from '../calc';
import { isExpiredByTwoDays } from '../utils/dateUtils';
import Card from './ui/Card';
import Button from './ui/Button';

function ItemCard({ item, type, onEdit, onDelete, onExecute, onDirectAction, concentration = 0 }) {
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  if (type === 'portfolio') {
    const contracts = parseInt(item.contracts) || 1;
    const netBasis = calcNetBasis(item.entryPrice, item.rollCredit, item.contracts);
    const isClosed = item.status === 'CLOSED';
    const isExpired = !isClosed && isExpiredByTwoDays(item.expiration);

    const daysUntilExpiration = (() => {
      if (isClosed || isExpired || !item.expiration) return null;
      const exp = new Date(item.expiration);
      const now = new Date();
      exp.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    })();
    const isExpiringSoon = daysUntilExpiration !== null && daysUntilExpiration <= 7;
    let finalPnL = null;
    if (isClosed || isExpired) {
      const closeP = isClosed ? (parseFloat(item.closePrice) || 0) : 0;
      finalPnL = calcFinalPnL(item.direction, netBasis, closeP, item.contracts);
    }
    const history = [...(item.history || [])];

    let initialStrike = item.strike;
    let initialExpiration = item.expiration;
    const rollHistory = history.filter(h => h.action === 'ROLL');
    if (rollHistory.length > 0) {
      const firstRoll = rollHistory[rollHistory.length - 1];
      if (firstRoll.oldStrike) initialStrike = firstRoll.oldStrike;
      if (firstRoll.oldExpiration) initialExpiration = firstRoll.oldExpiration;
    }

    history.push({
      isInitial: true,
      date: item.dateOpened || 'Initial',
      price: item.entryPrice,
      initialStrike,
      initialExpiration
    });

    return (
      <Card className={`p-4 hover:shadow-md transition-shadow ${isClosed ? 'opacity-75 bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800' : isExpired ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' : ''}`}>
        {/* Top row: position info + P&L */}
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
              <span className={`px-2 py-0.5 text-xs font-bold rounded shrink-0 ${item.direction === 'BUY' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'}`}>{item.direction === 'BUY' ? 'LONG' : 'SHORT'}</span>
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 shrink-0">{item.ticker}</h3>
              <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">{item.expiration} ${item.strike} {item.type}</span>
              {isClosed && <span className="bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0"><Archive size={10} /> 已平仓</span>}
              {isExpired && !isClosed && <span className="bg-red-100 text-red-600 text-xs px-2 rounded-full font-bold flex items-center gap-1 shrink-0"><AlertTriangle size={10} /> 已过期</span>}
              {daysUntilExpiration !== null && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0 ${isExpiringSoon ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'}`}>
                  {isExpiringSoon && <AlertTriangle size={10} />} 还剩 {daysUntilExpiration} 天
                </span>
              )}
              {concentration > 50 && item.type === 'PUT' && item.direction === 'SELL' && (
                <span className="bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0">
                  <AlertTriangle size={10} /> 集中 {concentration.toFixed(0)}%
                </span>
              )}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              初始: ${parseFloat(item.entryPrice).toFixed(2)} × {contracts}
              {parseFloat(item.rollCredit) !== 0 && <span className={item.rollCredit > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}> {item.rollCredit > 0 ? '+' : ''}展期: ${parseFloat(item.rollCredit).toFixed(2)}</span>}
            </div>
            {!isClosed && !isExpired && (
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                保本价: <span className="font-mono text-slate-600 dark:text-slate-300">${calcBreakEven(item.type, item.strike, item.entryPrice, item.rollCredit).toFixed(2)}</span>
              </div>
            )}
          </div>
          {/* P&L / Net Basis — no buttons here */}
          <div className="text-right shrink-0">
            <div className="text-xs text-slate-400 font-bold uppercase">{isClosed || isExpired ? '最终盈亏 (P&L)' : '总成本 (NET BASIS)'}</div>
            <div className={`text-xl font-mono font-bold ${(isClosed || isExpired) ? (finalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : (netBasis >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}`}>
              {(isClosed || isExpired)
                ? `${finalPnL >= 0 ? '+' : '-'}$${Math.abs(finalPnL).toFixed(2)}`
                : `${netBasis >= 0 ? '+' : '-'}$${Math.abs(netBasis).toFixed(0)}`}
            </div>
          </div>
        </div>

        {/* History section */}
        {isHistoryExpanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-sm">
            <div className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1"><History size={12} /> 交易历史 (Transaction History)</div>
            {history.map((h, idx) => {
              let label = "", val = 0, isCredit = false;
              if (h.isInitial) {
                label = `初始开仓 (Initial Open) $${h.initialStrike} (${h.initialExpiration}) ${item.type}`;
                if (item.direction === 'SELL') { val = -Math.abs(item.entryPrice); isCredit = true; } else { val = Math.abs(item.entryPrice); isCredit = false; }
              } else if (h.action === 'CLOSE') {
                label = '平仓 (Close)';
                val = item.direction === 'SELL' ? Math.abs(h.closePrice) : -Math.abs(h.closePrice); isCredit = val < 0;
              } else if (h.action === 'AUTO_EXPIRE') {
                label = '自动过期 (Auto Expired)';
                val = 0; isCredit = false;
              } else if (h.action === 'ROLL') {
                label = `展期 (Roll) to ${h.newExpiration} $${h.newStrike}`;
                val = h.rollPrice; isCredit = val < 0;
              }
              return (
                <div key={idx} className="flex justify-between py-1 border-b border-dashed border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="text-slate-500 text-xs font-mono w-20">{h.date}</span>
                  <span className="flex-1 truncate px-2 text-slate-600 dark:text-slate-300">{label}</span>
                  <span className={`font-mono ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{val > 0 ? '+' : ''}{val.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Action buttons — always at bottom, full width */}
        <div className="flex gap-1 justify-end mt-2">
          {!isClosed && !isExpired && (
            <>
              <button onClick={() => onDirectAction(item, 'ROLL')} className="p-1.5 text-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded hover:bg-amber-100" title="滚仓 (Roll)"><RefreshCw size={16} /></button>
              <button onClick={() => onDirectAction(item, 'CLOSE')} className="p-1.5 text-slate-500 bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200" title="平仓 (Close)"><StopCircle size={16} /></button>
            </>
          )}
          {(history.length > 1 || isClosed) && <button onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} className="p-1.5 text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 rounded hover:bg-indigo-100">{isHistoryExpanded ? <ChevronUp size={16} /> : <History size={16} />}</button>}
          <button onClick={() => onEdit(item)} className="p-1.5 text-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100"><Edit3 size={16} /></button>
          <button onClick={() => onDelete(item.id, 'portfolio')} className="p-1.5 text-rose-500 bg-rose-50 dark:bg-rose-900/20 rounded hover:bg-rose-100"><Trash2 size={16} /></button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 hover:shadow-md transition-shadow group">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${item.actionCategory === 'OPEN' ? 'bg-blue-100 text-blue-700' : item.actionCategory === 'CLOSE' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-700'}`}>{item.actionCategory === 'ROLL' ? '滚仓' : item.actionCategory === 'CLOSE' ? '平仓' : '开仓'}</span>
            <span className={`font-bold ${item.direction === 'BUY' ? 'text-emerald-600' : 'text-rose-600'}`}>{item.direction === 'BUY' ? 'LONG' : 'SHORT'}</span>
            <span className="font-bold text-lg text-slate-800 dark:text-slate-100">{item.ticker}</span>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {item.actionCategory === 'ROLL' ? <span>From ${item.strike} <ArrowRight size={12} className="inline" /> To ${item.newStrike} ({item.newExpirationPeriod})</span> : <span>${item.strike} {item.type} ({item.expiration})</span>}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">{item.actionDate}</div>
        </div>
        <div className="flex gap-1">
          <Button variant="success" onClick={onExecute} className="px-3 py-1 text-xs"><CheckSquare size={14} /> 执行</Button>
          <button onClick={() => onDelete(item.id, 'planner')} className="p-2 text-rose-500 hover:bg-rose-50 rounded"><Trash2 size={18} /></button>
        </div>
      </div>
    </Card>
  );
}

export default ItemCard;
