import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const END_REASON = {
  complete: '完整收到',
  idle: '数据停止后结束',
  'no-data-timeout': '等待超时，未收到数据',
  'hard-timeout': '总时长超时',
  'server-error': '服务端报错',
  'socket-error': '连接错误',
  'connect-error': '无法建立连接',
  closed: '连接被关闭',
};

const th = 'px-2 py-1 font-semibold text-left whitespace-nowrap';
const td = 'px-2 py-1 whitespace-nowrap align-top';

/** Per-batch fetch diagnostics (no tokens or account data). */
export default function LoadDiagnostics({ diagnostics, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!diagnostics?.length) return null;
  const problems = diagnostics.filter(d => d.missing.length > 0).length;

  return (
    <div className="text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        拉取诊断（{diagnostics.length} 批{problems ? `，${problems} 批有缺失` : ''}）
      </button>
      {open && (
        <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto max-h-[300px] overflow-y-auto">
          <table className="w-full text-[11px] min-w-[620px]">
            <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 sticky top-0">
              <tr>
                <th className={th}>轮次</th>
                <th className={th}>标的</th>
                <th className={th}>用时</th>
                <th className={th}>消息</th>
                <th className={th}>K 线</th>
                <th className={th}>结束原因</th>
                <th className={th}>缺失</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.map((d, i) => (
                <tr key={i} className={`border-t border-slate-100 dark:border-slate-700/60 ${d.missing.length ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
                  <td className={td}>{d.pass === 1 ? '首轮' : '重试'}</td>
                  <td className={`${td} whitespace-normal min-w-[140px]`}>{d.symbols.join(' ')}</td>
                  <td className={td}>{(d.durationMs / 1000).toFixed(1)}s</td>
                  <td className={td}>{d.messages}</td>
                  <td className={td}>{d.candles.toLocaleString()}</td>
                  <td className={td}>
                    {END_REASON[d.endReason] ?? d.endReason}
                    {d.serverError && <div className="text-red-500">{d.serverError}</div>}
                  </td>
                  <td className={`${td} whitespace-normal`}>{d.missing.length ? d.missing.join(' ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
