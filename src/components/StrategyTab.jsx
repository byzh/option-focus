import { useState } from 'react';
import { RefreshCw, AlertTriangle, TrendingUp, ChevronDown, ChevronUp, CheckCircle2, XCircle, StopCircle, RotateCcw, Search, X } from 'lucide-react';
import { detectCC, detectPMCC } from '../utils/strategyDetect';
import { assessLeapsHealth } from '../utils/leapsHealth';
import { calcNetBasis, calcFinalPnL, calcPMCCBreakEven } from '../calc';
import Button from './ui/Button';
import { calculateDTE } from '../utils/dateUtils';

/**
 * Visual lot-grid: N green boxes (covered) + M amber boxes (uncovered).
 * Max 12 shown; excess collapsed to "+N".
 */
function LotGrid({ covered, uncovered }) {
  const total = covered + uncovered;
  const MAX = 12;
  const showAll = total <= MAX;
  const visibleCovered = showAll ? covered : Math.min(covered, MAX);
  const visibleUncovered = showAll ? uncovered : Math.max(0, MAX - visibleCovered);
  const hidden = total - visibleCovered - visibleUncovered;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {Array.from({ length: visibleCovered }).map((_, i) => (
        <div key={`c-${i}`} className="w-5 h-5 rounded bg-emerald-400 dark:bg-emerald-500 flex items-center justify-center" title="已覆盖">
          <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1,5 4,8 9,2" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
      ))}
      {Array.from({ length: visibleUncovered }).map((_, i) => (
        <div key={`u-${i}`} className="w-5 h-5 rounded bg-amber-400 dark:bg-amber-500 flex items-center justify-center" title="未覆盖">
          <svg width="10" height="8" viewBox="0 0 10 8"><line x1="1" y1="4" x2="9" y2="4" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
        </div>
      ))}
      {hidden > 0 && (
        <span className="text-xs text-slate-400 font-mono">+{hidden}</span>
      )}
    </div>
  );
}

/** Status chip based on coverage */
function CoverageStatus({ covered, total }) {
  if (total === 0) return null;
  if (covered >= total) {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
        <CheckCircle2 size={12} /> 全覆盖
      </span>
    );
  }
  if (covered === 0) {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-full">
        <XCircle size={12} /> 未卖出 Call
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-full">
      <AlertTriangle size={12} /> 部分裸露
    </span>
  );
}

function borderClass(covered, total) {
  if (total === 0 || covered >= total) return 'border-slate-200 dark:border-slate-700';
  if (covered === 0) return 'border-red-300 dark:border-red-700';
  return 'border-amber-300 dark:border-amber-700';
}

function SectionHeader({ title, count, expanded, onToggle }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl mb-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
      <div className="flex items-center gap-2">
        <TrendingUp size={16} className="text-blue-500" />
        <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{title}</span>
        {count > 0 && <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">{count} 个</span>}
      </div>
      {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
    </button>
  );
}

function CCCard({ group, onOpenAddModal, onDirectAction, onReopen }) {
  const shares = parseInt(group.stockPos.contracts) || 0;
  const totalLots = Math.floor(shares / 100);
  const coveredLots = Math.min(group.coveredLots, totalLots);
  const uncoveredLots = Math.max(0, totalLots - coveredLots);
  const needsAction = uncoveredLots > 0;

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border-2 ${borderClass(coveredLots, totalLots)} p-4 space-y-3 transition-colors`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-slate-800 dark:text-white">{group.ticker}</span>
          <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-full font-medium">CC</span>
          <CoverageStatus covered={coveredLots} total={totalLots} />
        </div>
        {needsAction && (
          <Button onClick={() => onOpenAddModal(group)} className="text-xs h-7 px-3">
            + 卖出 Call
          </Button>
        )}
      </div>

      {/* Lot grid */}
      {totalLots > 0 && (
        <div>
          <div className="text-xs text-slate-400 mb-1.5">
            覆盖进度 — {coveredLots}/{totalLots} 张
            <span className="text-slate-300 dark:text-slate-600 mx-1.5">·</span>
            {shares} 股持仓
          </div>
          <LotGrid covered={coveredLots} uncovered={uncoveredLots} />
        </div>
      )}

      {/* Action prompt */}
      {needsAction && totalLots > 1 && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <span className="text-xs text-amber-700 dark:text-amber-300">
            还有 <strong>{uncoveredLots} 张</strong>（{uncoveredLots * 100} 股）未卖出 Call，可收取权利金
          </span>
        </div>
      )}

      {/* Cost summary */}
      <div className="grid grid-cols-2 gap-3 text-sm pt-1 border-t border-slate-100 dark:border-slate-700">
        <div>
          <div className="text-xs text-slate-400 mb-0.5">买入均价</div>
          <div className="font-mono text-slate-600 dark:text-slate-300">${parseFloat(group.stockPos.entryPrice).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-0.5">摊薄后成本</div>
          <div className={`font-mono font-semibold ${group.closedCalls.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
            ${group.breakEven.toFixed(2)}
            {group.closedCalls.length > 0 && <span className="text-xs font-normal text-slate-400 ml-1">(-${(parseFloat(group.stockPos.entryPrice) - group.breakEven).toFixed(2)})</span>}
          </div>
        </div>
      </div>

      {/* Open calls */}
      {group.openCalls.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-slate-400 font-medium">持有 Short Call</div>
          {group.openCalls.map(c => {
            const dte = calculateDTE(c.expiration);
            const expiringSoon = dte !== null && dte <= 14;
            return (
              <div key={c.id} className={`flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg ${expiringSoon ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' : 'bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300'}`}>
                <div className="flex items-center gap-2">
                  {expiringSoon && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
                  <span className="font-mono">${parseFloat(c.strike).toFixed(0)}</span>
                  <span className="">{c.expiration}{dte !== null && ` (${dte}d)`}</span>
                  <span className="font-mono">× {parseInt(c.contracts) || 1}</span><span> 张</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onDirectAction(c, 'ROLL')} title="滚仓" className="p-1 rounded text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 transition-colors">
                    <RefreshCw size={11} />
                  </button>
                  <button onClick={() => onDirectAction(c, 'CLOSE')} title="平仓" className="p-1 rounded text-orange-500 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 transition-colors">
                    <StopCircle size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {group.closedCalls.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-slate-400 font-medium">已平仓 Short Call</div>
          {group.closedCalls.map(c => {
            const nb = calcNetBasis(c.entryPrice, c.rollCredit, c.contracts);
            const pnl = calcFinalPnL(c.direction, nb, parseFloat(c.closePrice) || 0, c.contracts);
            return (
              <div key={c.id} className="flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="font-mono">${parseFloat(c.strike).toFixed(0)}</span>
                  <span>{c.expiration}</span>
                  <span className="font-mono">× {parseInt(c.contracts) || 1}</span><span> 张</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-semibold ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toFixed(2)}</span>
                  <button onClick={() => onReopen(c)} title="重新开仓" className="p-1 rounded text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 transition-colors">
                    <RotateCcw size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PMCCCard({ group, deltaMap, onOpenAddModal, onDirectAction, onReopen }) {
  const dte = calculateDTE(group.leapsPos.expiration);
  const delta = deltaMap[group.leapsId];
  const health = assessLeapsHealth(dte, delta);
  const breakEven = calcPMCCBreakEven(group.leapsPos, group.closedLinkedCalls, delta);
  const leapsContracts = parseInt(group.leapsPos.contracts) || 1;
  const coveredContracts = Math.min(group.coveredContracts, leapsContracts);
  const uncoveredContracts = Math.max(0, leapsContracts - coveredContracts);
  const needsAction = uncoveredContracts > 0;

  const healthBg = {
    ok:      'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
    warn:    'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
    danger:  'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    roll:    'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300',
    unknown: 'bg-slate-50 dark:bg-slate-700/30 border-slate-200 dark:border-slate-700 text-slate-500',
  }[health.level];

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border-2 ${borderClass(coveredContracts, leapsContracts)} p-4 space-y-3 transition-colors`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-slate-800 dark:text-white">{group.ticker}</span>
          <span className="text-xs px-2 py-0.5 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-full font-medium">PMCC</span>
          <CoverageStatus covered={coveredContracts} total={leapsContracts} />
        </div>
        {needsAction && (
          <Button onClick={() => onOpenAddModal(group)} className="text-xs h-7 px-3">
            + 卖出 Call
          </Button>
        )}
      </div>

      {/* Lot grid */}
      {leapsContracts > 0 && (
        <div>
          <div className="text-xs text-slate-400 mb-1.5">
            覆盖进度 — {coveredContracts}/{leapsContracts} 张
          </div>
          <LotGrid covered={coveredContracts} uncovered={uncoveredContracts} />
        </div>
      )}

      {/* Action prompt — only meaningful when >1 contract (otherwise coverage grid already shows it) */}
      {needsAction && leapsContracts > 1 && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <span className="text-xs text-amber-700 dark:text-amber-300">
            还有 <strong>{uncoveredContracts} 张</strong> LEAPS 未卖出 Call
          </span>
        </div>
      )}

      {/* LEAPS details */}
      <div className={`flex items-start gap-2 border rounded-lg px-3 py-2 ${healthBg}`}>
        <div className="flex-1 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold">LEAPS</span>
            <span className="font-mono text-xs">${parseFloat(group.leapsPos.strike).toFixed(0)} Call</span>
            <span className="text-xs">{group.leapsPos.expiration}{dte !== null && ` (${dte}d)`}</span>
            <span className="font-mono text-xs">{leapsContracts} 张</span>
          </div>
          <div className="text-xs font-medium">{health.message}</div>
        </div>
        {health.level === 'danger' && <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-500" />}
        {health.level === 'warn'   && <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />}
        {health.level === 'roll'   && <RefreshCw size={14} className="shrink-0 mt-0.5 text-violet-500" />}
        {health.level === 'ok'     && <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-500" />}
      </div>

      {/* Cost summary */}
      <div className="grid grid-cols-2 gap-3 text-sm pt-1 border-t border-slate-100 dark:border-slate-700">
        <div>
          <div className="text-xs text-slate-400 mb-0.5">LEAPS 净成本</div>
          {group.closedLinkedCalls.length > 0 ? (
            <div>
              <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                ${group.adjustedNetCost.toFixed(0)}
              </div>
              <div className="text-xs text-slate-400">
                原始 ${(parseFloat(group.leapsPos.entryPrice) * 100 * leapsContracts).toFixed(0)}，已摊薄 ${(parseFloat(group.leapsPos.entryPrice) * 100 * leapsContracts - group.adjustedNetCost).toFixed(0)}
              </div>
            </div>
          ) : (
            <div className="font-mono text-slate-600 dark:text-slate-300">
              ${(parseFloat(group.leapsPos.entryPrice) * 100 * leapsContracts).toFixed(0)}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-0.5">摊薄后盈亏平衡{delta ? ` (δ ${delta.toFixed(2)})` : ''}</div>
          <div className={`font-mono font-semibold ${group.closedLinkedCalls.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
            ${breakEven.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Open calls */}
      {group.openLinkedCalls.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-slate-400 font-medium">持有 Short Call</div>
          {group.openLinkedCalls.map(c => {
            const cDte = calculateDTE(c.expiration);
            const expiringSoon = cDte !== null && cDte <= 14;
            return (
              <div key={c.id} className={`flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg ${expiringSoon ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' : 'bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300'}`}>
                <div className="flex items-center gap-2">
                  {expiringSoon && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
                  <span className="font-mono">${parseFloat(c.strike).toFixed(0)}</span>
                  <span className="">{c.expiration}{cDte !== null && ` (${cDte}d)`}</span>
                  <span className="font-mono">× {parseInt(c.contracts) || 1}</span><span> 张</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onDirectAction(c, 'ROLL')} title="滚仓" className="p-1 rounded text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 transition-colors">
                    <RefreshCw size={11} />
                  </button>
                  <button onClick={() => onDirectAction(c, 'CLOSE')} title="平仓" className="p-1 rounded text-orange-500 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 transition-colors">
                    <StopCircle size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {group.closedLinkedCalls.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-slate-400 font-medium">已平仓 Short Call</div>
          {group.closedLinkedCalls.map(c => {
            const nb = calcNetBasis(c.entryPrice, c.rollCredit, c.contracts);
            const pnl = calcFinalPnL(c.direction, nb, parseFloat(c.closePrice) || 0, c.contracts);
            return (
              <div key={c.id} className="flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="font-mono">${parseFloat(c.strike).toFixed(0)}</span>
                  <span>{c.expiration}</span>
                  <span className="font-mono">× {parseInt(c.contracts) || 1}</span><span> 张</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-semibold ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toFixed(2)}</span>
                  <button onClick={() => onReopen(c)} title="重新开仓" className="p-1 rounded text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 transition-colors">
                    <RotateCcw size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StrategyTab({ positions, deltaMap, deltaLoading, fetchDeltas, onOpenAddModal, onDirectAction, onReopen }) {
  const [ccExpanded, setCcExpanded] = useState(true);
  const [pmccExpanded, setPmccExpanded] = useState(true);
  const [searchTicker, setSearchTicker] = useState('');

  const allCcGroups = detectCC(positions);
  const allPmccGroups = detectPMCC(positions);

  const ccGroups = allCcGroups
    .filter(g => !searchTicker || g.ticker.toUpperCase().includes(searchTicker))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  const pmccGroups = allPmccGroups
    .filter(g => !searchTicker || g.ticker.toUpperCase().includes(searchTicker))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  const isEmpty = ccGroups.length === 0 && pmccGroups.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">策略机会</h2>
        <button
          onClick={() => {
            const leapsPositions = allPmccGroups.map(g => g.leapsPos);
            if (leapsPositions.length > 0) fetchDeltas(leapsPositions);
          }}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-500 transition-colors"
          disabled={deltaLoading}
        >
          <RefreshCw size={13} className={deltaLoading ? 'animate-spin' : ''} />
          刷新 Delta
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="搜索代码 (Search ticker)..."
          value={searchTicker}
          onChange={e => setSearchTicker(e.target.value.toUpperCase())}
          className="w-full pl-8 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
        />
        {searchTicker && (
          <button onClick={() => setSearchTicker('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>

      {isEmpty && (
        <div className="text-center py-16 text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          <p className="mb-2">暂无策略机会</p>
          <p className="text-xs">添加股票持仓或 LEAPS 后将自动出现 CC / PMCC 策略建议</p>
        </div>
      )}

      {ccGroups.length > 0 && (
        <div>
          <SectionHeader title="Covered Call (CC)" count={ccGroups.length} expanded={ccExpanded} onToggle={() => setCcExpanded(v => !v)} />
          {ccExpanded && (
            <div className="space-y-3">
              {ccGroups.map(g => <CCCard key={g.stockId} group={g} onOpenAddModal={onOpenAddModal} onDirectAction={onDirectAction} onReopen={onReopen} />)}
            </div>
          )}
        </div>
      )}

      {pmccGroups.length > 0 && (
        <div>
          <SectionHeader title="Poor Man's Covered Call (PMCC)" count={pmccGroups.length} expanded={pmccExpanded} onToggle={() => setPmccExpanded(v => !v)} />
          {pmccExpanded && (
            <div className="space-y-3">
              {pmccGroups.map(g => <PMCCCard key={g.leapsId} group={g} deltaMap={deltaMap} onOpenAddModal={onOpenAddModal} onDirectAction={onDirectAction} onReopen={onReopen} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
