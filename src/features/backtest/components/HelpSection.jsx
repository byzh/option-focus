import React, { useState } from 'react';
import { ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';

function P({ children }) {
  return <p className="leading-relaxed">{children}</p>;
}

/** Collapsible plain-language guide to what the backtest measures and how to read it. */
export default function HelpSection({ strategy }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300"
      >
        <HelpCircle size={13} className="text-blue-500" />
        这个回测在测什么、怎么看
        <span className="ml-auto">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-200">回答的问题</div>
            <P>出现信号后买入、持有 N 个交易日，赚钱的概率和幅度，是否比"随便哪天买入"更好。</P>
          </div>

          <div className="space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-200">当前策略：{strategy.name}</div>
            {(strategy.help ?? [strategy.description]).map(line => <P key={line}>{line}</P>)}
          </div>

          <div className="space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-200">怎么模拟买卖</div>
            <P>固定持有期：默认信号次日开盘买入，分别看持有 1/5/10/20/60 个交易日后的收盘价，不设止损止盈。</P>
            <P>交易模拟（仅限有离场规则的策略，如 RSI(2)）：按策略自己的离场规则平仓，每个标的同一时间只持有一笔，统计胜率、盈亏比、利润因子和平均持有天数；基准是持有相同天数的随机入场结果。</P>
          </div>

          <div className="space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-200">最该看的数字</div>
            <P><b>胜率后面括号里的差值</b>：信号胜率减去基准胜率（同样规则下任意一天买入的胜率）。美股长期向上，基准本身就有 50%~60%，只有差值明显为正，信号才有价值。</P>
            <P><b>平均超额</b>：同期比 SPY 多赚多少。和括号差值一起为正，才说明信号有效。</P>
            <P><b>中位数</b>比平均值更能代表"典型的一次"；样本少于 100 的结果不要太当真。</P>
          </div>

          <div className="space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-200">回踩统计</div>
            <P>回踩信号日低点：信号后 N 天内跌回信号那天最低价的比例，比例高说明"追当天不如等回踩"。</P>
            <P>回踩后收复：回踩过的信号中，窗口最后一天收盘重新站上入场价的比例。</P>
            <P>最大浮亏 MAE / 最大浮盈 MFE：窗口内最多亏到 / 赚到多少，可用来估算卖 put 的行权价距离。</P>
          </div>

          <div className="space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-200">参数对比</div>
            <P>每次计算都会追加一行到"参数对比"表，列出相对默认值改了哪些参数，以及各持有期的胜率差和平均超额，方便横向比较。点"载入参数"可回到那一组参数。</P>
          </div>

          <div className="space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-200">注意</div>
            <P>数据可能未做拆股复权，窗口内单日涨跌超过阈值的样本会被剔除。回测只统计历史结果，不构成交易建议。</P>
          </div>
        </div>
      )}
    </div>
  );
}
