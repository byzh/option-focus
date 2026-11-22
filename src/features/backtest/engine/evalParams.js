import { defaultsFromSchema } from './params';

// Evaluation parameters: independent of any strategy.
export const EVAL_PARAM_SCHEMA = [
  { key: 'entryMode', label: '次日开盘入场', type: 'bool', default: true,
    help: '勾选：以信号次日开盘价入场（无未来函数）；不勾选：以信号日收盘价入场' },
  { key: 'horizons', label: '持有期 (交易日)', type: 'intList', min: 1, max: 250, default: [1, 5, 10, 20, 60],
    help: '逗号分隔，统计信号后第 N 个交易日收盘的收益' },
  { key: 'pullbackWindow', label: '回踩观察窗口 (交易日)', type: 'int', min: 1, max: 120, default: 10,
    help: '信号后多少天内是否跌回信号日最低价' },
  { key: 'splitJumpPct', label: '疑似拆股剔除阈值 (%)', type: 'number', min: 10, max: 1000, default: 40,
    help: '窗口内任一日收盘涨跌幅绝对值超过此值则剔除该样本（数据可能未复权）' },
  { key: 'startDate', label: '信号起始日', type: 'date', default: '', help: '留空 = 不限' },
  { key: 'endDate', label: '信号截止日', type: 'date', default: '', help: '留空 = 不限' },
];

export const DEFAULT_EVAL_PARAMS = defaultsFromSchema(EVAL_PARAM_SCHEMA);
