import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { X, Loader2, Download, Square, Play, RotateCcw, CheckCircle2 } from 'lucide-react';
import ParamFields from './ParamFields';
import BacktestResults from './BacktestResults';
import RunHistory from './RunHistory';
import LoadDiagnostics from './LoadDiagnostics';
import HelpSection from './HelpSection';
import { STRATEGIES, getStrategy } from '../strategies/registry';
import { EVAL_PARAM_SCHEMA, DEFAULT_EVAL_PARAMS } from '../engine/evalParams';
import { validateParams, toFormValues } from '../engine/params';
import { runBacktest, BENCHMARK_SYMBOL } from '../engine/runBacktest';
import { makeRunRecord } from '../engine/runHistory';
import { useCandleData } from '../hooks/useCandleData';

const DEFAULT_FROM_DATE = '1990-01-01';
const MAX_RUNS = 20;
const MIN_SPINNER_MS = 400;

const btn = 'inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors';
const btnPrimary = `${btn} bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white`;
const btnDisabled = `${btn} bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed`;
const btnSecondary = `${btn} bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200`;
const btnDanger = `${btn} bg-red-500 hover:bg-red-600 text-white`;

function Block({ title, children, right }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</p>
        {right}
      </div>
      {children}
    </div>
  );
}

function timeLabel(d) {
  return d.toLocaleTimeString('zh-CN', { hour12: false });
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
  const [computing, setComputing] = useState(false);
  const [lastRun, setLastRun] = useState(null); // { at, totalSignals, id }
  const [runs, setRuns] = useState([]);
  const runSeq = useRef(0);
  const resultsRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const strategyCheck = useMemo(() => validateParams(strategy.paramSchema, strategyForm), [strategy, strategyForm]);
  const evalCheck = useMemo(() => validateParams(EVAL_PARAM_SCHEMA, evalForm), [evalForm]);
  const hasErrors = Object.keys(strategyCheck.errors).length > 0 || Object.keys(evalCheck.errors).length > 0;

  const testSymbols = useMemo(() => [...new Set(symbols)], [symbols]);
  const fetchSymbols = useMemo(() => [...new Set([...testSymbols, BENCHMARK_SYMBOL])], [testSymbols]);
  const loading = candles.status === 'loading';
  const ready = candles.status === 'ready' && Boolean(candles.data);

  const blockedReason = loading ? '数据拉取中…'
    : !ready ? (candles.status === 'error' ? '数据拉取失败，请重新拉取' : '请先拉取日线数据')
      : hasErrors ? '参数有误，请检查标红的字段'
        : null;
  const canRun = !blockedReason && !computing;

  const handleStrategyChange = (id) => {
    const s = getStrategy(id);
    if (!s) return;
    setStrategyId(id);
    setStrategyForm(toFormValues(s.paramSchema, s.defaultParams));
    setReport(null);
  };

  const handleRun = useCallback(() => {
    if (!canRun) return;
    setComputing(true);
    setRunError(null);
    const started = Date.now();

    // Yield one frame so the "computing" state paints before the synchronous work.
    timerRef.current = setTimeout(() => {
      let next = null;
      let error = null;
      try {
        next = runBacktest({
          strategy,
          strategyParams: strategyCheck.values,
          evalParams: evalCheck.values,
          data: candles.data,
          symbols: testSymbols,
        });
      } catch (e) {
        error = e?.message || '计算失败';
      }

      const wait = Math.max(0, MIN_SPINNER_MS - (Date.now() - started));
      timerRef.current = setTimeout(() => {
        setComputing(false);
        if (error) {
          setReport(null);
          setRunError(error);
          return;
        }
        const now = new Date();
        const id = ++runSeq.current;
        setReport(next);
        setLastRun({ id, at: timeLabel(now), totalSignals: next.totalSignals });
        setRuns(prev => [
          makeRunRecord({
            id,
            at: timeLabel(now),
            strategy,
            strategyParams: strategyCheck.values,
            evalParams: evalCheck.values,
            evalSchema: EVAL_PARAM_SCHEMA,
            evalDefaults: DEFAULT_EVAL_PARAMS,
            report: next,
          }),
          ...prev,
        ].slice(0, MAX_RUNS));
        requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }, wait);
    }, 30);
  }, [canRun, strategy, strategyCheck.values, evalCheck.values, candles.data, testSymbols]);

  const resetParams = () => {
    setStrategyForm(toFormValues(strategy.paramSchema, strategy.defaultParams));
    setEvalForm(toFormValues(EVAL_PARAM_SCHEMA, DEFAULT_EVAL_PARAMS));
  };

  const restoreRun = (run) => {
    const s = getStrategy(run.strategyId);
    if (!s) return;
    setStrategyId(s.id);
    setStrategyForm(toFormValues(s.paramSchema, run.strategyParams));
    setEvalForm(toFormValues(EVAL_PARAM_SCHEMA, run.evalParams));
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

  const progressLabel = candles.progress.phase === 'retry'
    ? `重试缺失标的 ${candles.progress.done}/${candles.progress.total}`
    : `${candles.progress.done}/${candles.progress.total}`;

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
          <HelpSection strategy={strategy} />

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
                <button
                  className={fromDate ? btnPrimary : btnDisabled}
                  onClick={() => fromDate && candles.load(fetchSymbols, fromDate)}
                  disabled={!fromDate}
                >
                  <Download size={12} /> {ready ? '重新拉取' : '拉取日线数据'}
                </button>
              )}
              {loading && (
                <span className="text-xs text-blue-500 inline-flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> {progressLabel}
                </span>
              )}
            </div>
            {candles.error && <div className="text-xs text-red-500">{candles.error}</div>}
            {coverage && (
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                <div>已加载 {coverage.n} 个标的，共 {coverage.bars.toLocaleString()} 根日线，最早 {coverage.first}，最新 {coverage.last}（实际最早日期取决于数据源能提供的历史长度）</div>
                {candles.failed.length > 0 && <div className="text-amber-600">首轮 + 重试后仍未取到数据（{candles.failed.length}）：{candles.failed.join(', ')}</div>}
                {candles.snipped.length > 0 && <div className="text-amber-600">数据源截断了历史：{candles.snipped.join(', ')}</div>}
              </div>
            )}
            <LoadDiagnostics diagnostics={candles.diagnostics} defaultOpen={candles.status === 'error'} />
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

          <div className="flex flex-wrap items-center gap-3">
            <button className={canRun ? btnPrimary : btnDisabled} onClick={handleRun} disabled={!canRun}>
              {computing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {computing ? '计算中…' : '计算回测'}
            </button>
            {blockedReason && <span className={`text-xs ${hasErrors ? 'text-red-500' : 'text-slate-400'}`}>{blockedReason}</span>}
            {!blockedReason && lastRun && !computing && (
              <span className="text-xs text-green-600 dark:text-green-400 inline-flex items-center gap-1">
                <CheckCircle2 size={12} /> 第 {lastRun.id} 次计算完成于 {lastRun.at}，共 {lastRun.totalSignals} 个信号
              </span>
            )}
          </div>

          {runError && <div className="text-xs text-red-500">{runError}</div>}

          <div ref={resultsRef} className="space-y-5 scroll-mt-4">
            <RunHistory runs={runs} onRestore={restoreRun} onClear={() => setRuns([])} />
            {report && <BacktestResults report={report} />}
          </div>
        </div>
      </div>
    </div>
  );
}
