import React, { useState, useMemo, useCallback } from 'react';
import { X, Loader2, Download, Square, Play, RotateCcw } from 'lucide-react';
import ParamFields from './ParamFields';
import BacktestResults from './BacktestResults';
import { STRATEGIES, getStrategy } from '../strategies/registry';
import { EVAL_PARAM_SCHEMA, DEFAULT_EVAL_PARAMS } from '../engine/evalParams';
import { validateParams, toFormValues } from '../engine/params';
import { runBacktest, BENCHMARK_SYMBOL } from '../engine/runBacktest';
import { useCandleData } from '../hooks/useCandleData';

const DEFAULT_FROM_DATE = '1990-01-01';
const btn = 'inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors disabled:opacity-50';
const btnPrimary = `${btn} bg-blue-600 hover:bg-blue-700 text-white`;
const btnSecondary = `${btn} bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200`;
const btnDanger = `${btn} bg-red-500 hover:bg-red-600 text-white`;

function Block({ title, children, right }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</p>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function BacktestPanel({ user, symbols, onClose }) {
  const candles = useCandleData({ user });

  const [fromDate, setFromDate] = useState(DEFAULT_FROM_DATE);
  const [strategyId, setStrategyId] = useState(STRATEGIES[0].id);
  const strategy = getStrategy(strategyId);

  const [strategyForm, setStrategyForm] = useState(() => toFormValues(strategy.paramSchema, strategy.defaultParams));
  const [evalForm, setEvalForm] = useState(() => toFormValues(EVAL_PARAM_SCHEMA, DEFAULT_EVAL_PARAMS));
  const [report, setReport] = useState(null);
  const [runError, setRunError] = useState(null);

  const strategyCheck = useMemo(() => validateParams(strategy.paramSchema, strategyForm), [strategy, strategyForm]);
  const evalCheck = useMemo(() => validateParams(EVAL_PARAM_SCHEMA, evalForm), [evalForm]);
  const hasErrors = Object.keys(strategyCheck.errors).length > 0 || Object.keys(evalCheck.errors).length > 0;

  const testSymbols = useMemo(() => [...new Set(symbols)], [symbols]);
  const fetchSymbols = useMemo(() => [...new Set([...testSymbols, BENCHMARK_SYMBOL])], [testSymbols]);
  const loading = candles.status === 'loading';
  const ready = candles.status === 'ready' && candles.data;

  const handleStrategyChange = (id) => {
    const s = getStrategy(id);
    if (!s) return;
    setStrategyId(id);
    setStrategyForm(toFormValues(s.paramSchema, s.defaultParams));
    setReport(null);
  };

  const handleRun = useCallback(() => {
    if (!ready || hasErrors) return;
    setRunError(null);
    try {
      setReport(runBacktest({
        strategy,
        strategyParams: strategyCheck.values,
        evalParams: evalCheck.values,
        data: candles.data,
        symbols: testSymbols,
      }));
    } catch (e) {
      setReport(null);
      setRunError(e?.message || '计算失败');
    }
  }, [ready, hasErrors, strategy, strategyCheck.values, evalCheck.values, candles.data, testSymbols]);

  const resetParams = () => {
    setStrategyForm(toFormValues(strategy.paramSchema, strategy.defaultParams));
    setEvalForm(toFormValues(EVAL_PARAM_SCHEMA, DEFAULT_EVAL_PARAMS));
  };

  const coverage = useMemo(() => {
    if (!ready) return null;
    let first = null, last = null, bars = 0;
    for (const arr of candles.data.values()) {
      bars += arr.length;
      if (!first || arr[0].date < first) first = arr[0].date;
      if (!last || arr[arr.length - 1].date > last) last = arr[arr.length - 1].date;
    }
    return { first, last, bars, n: candles.data.size };
  }, [ready, candles.data]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-6xl sm:rounded-xl shadow-xl flex flex-col max-h-full sm:max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">策略回测</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">实验</span>
            <select
              value={strategyId}
              onChange={e => handleStrategyChange(e.target.value)}
              className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            >
              {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500" title="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{strategy.description}</p>

          {/* Data */}
          <Block title={`数据（${testSymbols.length} 个标的 + ${BENCHMARK_SYMBOL} 基准，仅存于本页内存）`}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-400">数据起始日期</label>
                <input
                  type="date"
                  value={fromDate}
                  disabled={loading}
                  onChange={e => setFromDate(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              {loading ? (
                <button className={btnDanger} onClick={candles.abort}><Square size={12} /> 停止</button>
              ) : (
                <button className={btnPrimary} onClick={() => candles.load(fetchSymbols, fromDate)} disabled={!fromDate}>
                  <Download size={12} /> {ready ? '重新拉取' : '拉取日线数据'}
                </button>
              )}
              {loading && (
                <span className="text-xs text-blue-500 inline-flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> {candles.progress.done}/{candles.progress.total}
                </span>
              )}
            </div>
            {candles.error && <div className="text-xs text-red-500">{candles.error}</div>}
            {coverage && (
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                <div>已加载 {coverage.n} 个标的，共 {coverage.bars.toLocaleString()} 根日线，最早 {coverage.first}，最新 {coverage.last}（实际最早日期取决于数据源能提供的历史长度）</div>
                {candles.failed.length > 0 && <div className="text-amber-600">未取到数据：{candles.failed.join(', ')}</div>}
                {candles.snipped.length > 0 && <div className="text-amber-600">数据源截断了历史：{candles.snipped.join(', ')}</div>}
              </div>
            )}
          </Block>

          {/* Params */}
          <Block
            title="策略参数"
            right={<button className={btnSecondary} onClick={resetParams}><RotateCcw size={12} /> 恢复默认</button>}
          >
            <ParamFields
              schema={strategy.paramSchema}
              values={strategyForm}
              errors={strategyCheck.errors}
              onChange={(k, v) => setStrategyForm(f => ({ ...f, [k]: v }))}
            />
          </Block>

          <Block title="评估参数">
            <ParamFields
              schema={EVAL_PARAM_SCHEMA}
              values={evalForm}
              errors={evalCheck.errors}
              onChange={(k, v) => setEvalForm(f => ({ ...f, [k]: v }))}
            />
          </Block>

          <div className="flex items-center gap-3">
            <button className={btnPrimary} onClick={handleRun} disabled={!ready || hasErrors || loading}>
              <Play size={12} /> 计算回测
            </button>
            {!ready && !loading && <span className="text-xs text-slate-400">请先拉取日线数据</span>}
            {hasErrors && <span className="text-xs text-red-500">参数有误，请检查标红的字段</span>}
          </div>

          {runError && <div className="text-xs text-red-500">{runError}</div>}
          {report && <BacktestResults report={report} />}
        </div>
      </div>
    </div>
  );
}
