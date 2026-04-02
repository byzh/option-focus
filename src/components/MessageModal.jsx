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

function NotificationContent({ content }) {
  const lines = (content ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  const parsed = lines.map(parseLine);

  const warnings = parsed.filter(l => l.kind in TAG_CONFIG);
  const vixEntry  = parsed.find(l => l.kind === 'VIX');
  const isAllGood = warnings.length === 0;

  return (
    <div className="space-y-2 mb-6">
      {isAllGood && (
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium py-1">
          <CheckCircle2 size={16} />
          <span>所有持仓状态正常</span>
        </div>
      )}

      {warnings.map((item, i) => {
        const { cfg } = item;
        return (
          <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 ${cfg.bg}`}>
            <cfg.Icon size={15} className={`mt-0.5 shrink-0 ${cfg.text}`} />
            <div className="flex-1 min-w-0">
              <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
              <span className="text-slate-700 dark:text-slate-200 text-xs ml-2">{item.detail}</span>
            </div>
          </div>
        );
      })}

      {vixEntry && (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs pt-1 border-t border-slate-200 dark:border-slate-700 mt-2">
          <Activity size={13} />
          <span>VIX {vixEntry.detail}</span>
        </div>
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
