import React from 'react';
import { AlertCircle, Info, AlertTriangle, TrendingUp, Shield, CheckCircle2, Activity } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';

// ── Notification variant helpers ─────────────────────────────────────────────

const TAG_CONFIG = {
  PUT:     { label: 'PUT Delta',   bg: 'bg-red-100 dark:bg-red-900/30',    text: 'text-red-700 dark:text-red-300',    Icon: AlertTriangle },
  LEAPS:   { label: 'LEAPS',       bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-700 dark:text-blue-300',  Icon: TrendingUp    },
  CC:      { label: 'CC 未覆盖',   bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', Icon: Shield        },
  PMCC:    { label: 'PMCC 未覆盖', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', Icon: Shield        },
};

function parseLine(line) {
  for (const [key, cfg] of Object.entries(TAG_CONFIG)) {
    const prefix = key === 'CC' ? '[CC未覆盖]' : key === 'PMCC' ? '[PMCC未覆盖]' : `[${key}]`;
    if (line.startsWith(prefix)) {
      return { kind: key, cfg, detail: line.slice(prefix.length).trim() };
    }
  }
  if (line.startsWith('VIX:')) return { kind: 'VIX', detail: line.slice(4).trim() };
  return { kind: 'text', detail: line };
}

const GROUP_ORDER = ['PUT', 'LEAPS', 'CC', 'PMCC'];

// Parse each detail string into structured fields per type
function parseDetail(kind, detail) {
  if (kind === 'PUT') {
    // "SPY $500 (2026-06-20) Δ0.60 偏高"
    const m = detail.match(/^(\S+)\s+\$?([\d.]+)\s+\(([^)]+)\)\s+(.+)$/);
    if (m) return { ticker: m[1], strike: `$${m[2]}`, date: m[3], msg: m[4] };
  }
  if (kind === 'LEAPS') {
    // "QQQ (2026-12-20) Δ0.72 偏低"
    const m = detail.match(/^(\S+)\s+\(([^)]+)\)\s+(.+)$/);
    if (m) return { ticker: m[1], date: m[2], msg: m[3] };
  }
  if (kind === 'CC') {
    // "AAPL 100股"
    const m = detail.match(/^(\S+)\s+(.+)$/);
    if (m) return { ticker: m[1], amount: m[2] };
  }
  if (kind === 'PMCC') {
    // "SPY 1张"
    const m = detail.match(/^(\S+)\s+(.+)$/);
    if (m) return { ticker: m[1], amount: m[2] };
  }
  return { raw: detail };
}

function GroupRows({ kind, details }) {
  const rows = details.map(d => parseDetail(kind, d));
  const cell = 'text-xs text-slate-600 dark:text-slate-300';
  const dim  = 'text-xs text-slate-400 dark:text-slate-500';

  if (kind === 'PUT') return (
    <div className="grid gap-x-2 gap-y-0.5 pl-2" style={{ gridTemplateColumns: 'auto auto auto 1fr' }}>
      {rows.map((r, i) => r.raw ? (
        <div key={i} className={`${cell} col-span-4`}>{r.raw}</div>
      ) : (
        <React.Fragment key={i}>
          <span className={`${cell} font-medium`}>{r.ticker}</span>
          <span className={dim}>{r.strike}</span>
          <span className={dim}>{r.date}</span>
          <span className={cell}>{r.msg}</span>
        </React.Fragment>
      ))}
    </div>
  );

  if (kind === 'LEAPS') return (
    <div className="grid gap-x-2 gap-y-0.5 pl-2" style={{ gridTemplateColumns: 'auto auto 1fr' }}>
      {rows.map((r, i) => r.raw ? (
        <div key={i} className={`${cell} col-span-3`}>{r.raw}</div>
      ) : (
        <React.Fragment key={i}>
          <span className={`${cell} font-medium`}>{r.ticker}</span>
          <span className={dim}>{r.date}</span>
          <span className={cell}>{r.msg}</span>
        </React.Fragment>
      ))}
    </div>
  );

  // CC / PMCC
  return (
    <div className="grid gap-x-2 gap-y-0.5 pl-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
      {rows.map((r, i) => r.raw ? (
        <div key={i} className={`${cell} col-span-2`}>{r.raw}</div>
      ) : (
        <React.Fragment key={i}>
          <span className={`${cell} font-medium`}>{r.ticker}</span>
          <span className={cell}>{r.amount}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function NotificationContent({ content }) {
  const lines = (content ?? '').split('\n').map(l => l.trim()).filter(Boolean);

  // Extract VIX — either standalone "VIX: 18.3" or embedded "所有持仓状态正常 · VIX 18.3"
  let vix = null;
  const warningLines = [];
  for (const line of lines) {
    const vixMatch = line.match(/VIX[:\s]+([\d.]+)/);
    if (line.startsWith('VIX:')) {
      vix = line.slice(4).trim();
    } else {
      if (vixMatch) vix = vixMatch[1];
      warningLines.push(line);
    }
  }

  const parsed = warningLines.map(parseLine);
  const warnings = parsed.filter(l => l.kind in TAG_CONFIG);
  const isAllGood = warnings.length === 0;

  const groups = {};
  for (const w of warnings) {
    (groups[w.kind] ??= []).push(w.detail);
  }

  return (
    <div className="mb-5 space-y-2.5">
      {vix && (
        <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300 text-xs">
          <Activity size={11} />
          <span>VIX {vix}</span>
        </div>
      )}

      {isAllGood ? (
        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm">
          <CheckCircle2 size={14} />
          <span>所有持仓状态正常</span>
        </div>
      ) : (
        GROUP_ORDER.filter(k => groups[k]).map(k => (
          <div key={k}>
            <div className={`text-xs font-semibold mb-1 ${TAG_CONFIG[k].text}`}>{TAG_CONFIG[k].label}</div>
            <GroupRows kind={k} details={groups[k]} />
          </div>
        ))
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const MessageModal = ({ isOpen, title, content, onClose, type = 'info', variant }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <Card className="w-full max-w-sm p-6 relative">
        <h3 className={`text-lg font-bold mb-3 flex items-center gap-2 ${type === 'error' ? 'text-red-600' : 'text-slate-800 dark:text-white'}`}>
          {type === 'error' ? <AlertCircle size={24} /> : <Info size={24} />}
          {title}
        </h3>
        {variant === 'notification'
          ? <NotificationContent content={content} />
          : <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm whitespace-pre-wrap">{content}</p>
        }
        <Button onClick={onClose} variant="secondary" className="w-full">关闭</Button>
      </Card>
    </div>
  );
};

export default MessageModal;
