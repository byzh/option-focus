import React from 'react';
import { Loader2 } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';

function AddEditModal({ formData, setFormData, onSubmit, onClose, activeTab, positions, onSelectPos, isSaving }) {
  const update = (k, v) => setFormData(p => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-lg p-6 relative animate-in zoom-in-95">
        <h3 className="text-xl font-bold mb-6 text-slate-800 dark:text-white">{formData.id ? '编辑' : '新增'} {activeTab === 'portfolio' ? '持仓' : '计划'}</h3>
        <form onSubmit={onSubmit} className="space-y-4">
          {activeTab === 'planner' && (
            <div className="flex gap-2 mb-4">
              {['OPEN', 'ROLL', 'CLOSE'].map(t => (
                <button type="button" key={t} onClick={() => update('actionCategory', t)} className={`flex-1 py-2 rounded-lg border text-sm font-bold ${formData.actionCategory === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'}`}>{t === 'OPEN' && '开仓'}{t === 'ROLL' && '滚仓'}{t === 'CLOSE' && '平仓'}</button>
              ))}
            </div>
          )}
          {activeTab === 'planner' && formData.actionCategory !== 'OPEN' && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400">选择持仓 (Select Position) *</label>
              <select className="w-full p-2 border rounded cursor-pointer hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={formData.selectedPositionId} onChange={e => onSelectPos(e.target.value)} required>
                <option value="">-- 请选择要操作的期权 --</option>
                {positions.filter(p => p.status !== 'CLOSED').map(p => <option key={p.id} value={p.id}>{p.ticker} {p.expiration} ${p.strike}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input label="代码 (Ticker)" value={formData.ticker} onChange={e => update('ticker', e.target.value.toUpperCase())} required readOnly={activeTab === 'planner' && formData.actionCategory !== 'OPEN'} />
            <div className="grid grid-cols-2 gap-2">
              <Select label="类型 (Type)" value={formData.type} onChange={e => update('type', e.target.value)} options={[{ value: 'CALL', label: 'Call' }, { value: 'PUT', label: 'Put' }]} />
              <Select label="方向 (Side)" value={formData.direction} onChange={e => update('direction', e.target.value)} options={[{ value: 'BUY', label: 'Long (Buy)' }, { value: 'SELL', label: 'Short (Sell)' }]} />
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-bold text-slate-400 mb-2">详情 (DETAILS) {activeTab === 'planner' && formData.actionCategory !== 'OPEN' ? '(OLD)' : ''}</div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="行权价 (Strike)" type="number" value={formData.strike} onChange={e => update('strike', e.target.value)} required readOnly={activeTab === 'planner' && formData.actionCategory !== 'OPEN'} />
              <Input label="到期日 (Expiration)" type="date" value={formData.expiration} onChange={e => update('expiration', e.target.value)} required readOnly={activeTab === 'planner' && formData.actionCategory !== 'OPEN'} />
            </div>
          </div>
          {activeTab === 'planner' && formData.actionCategory === 'ROLL' && (
            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded border border-amber-200 dark:border-amber-800">
              <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-2">滚仓目标 (ROLL TARGET)</div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="新行权价 (New Strike)" type="number" value={formData.newStrike} onChange={e => update('newStrike', e.target.value)} />
                <Select
                  label="新周期 (New Exp)"
                  value={formData.newExpirationPeriod}
                  onChange={e => update('newExpirationPeriod', e.target.value)}
                  options={[
                    { value: '', label: '选择周期 (Select)...' },
                    { value: '1 Week', label: '一周后 (1 Week)' },
                    { value: '1 Month', label: '一个月后 (1 Month)' },
                    { value: '2 Months', label: '两个月后 (2 Months)' },
                    { value: '3 Months', label: '三个月后 (3 Months)' },
                    { value: '1 Year', label: '一年后 (1 Year)' }
                  ]}
                />
              </div>
            </div>
          )}
          {activeTab === 'portfolio' && (
            <>
              <div className="grid grid-cols-3 gap-4 items-end">
                <Input label="初始价格 (Entry Price)" type="number" value={formData.entryPrice} onChange={e => update('entryPrice', e.target.value)} required />
                <Input label="张数 (Contracts)" type="number" step="1" value={formData.contracts} onChange={e => update('contracts', e.target.value)} required />
                <Input label="展期净利 (Roll Credit)" type="number" value={formData.rollCredit} onChange={e => update('rollCredit', e.target.value)} />
              </div>
            </>
          )}
          {activeTab === 'planner' && <Input label="执行日期 (Action Date)" type="date" value={formData.actionDate} onChange={e => update('actionDate', e.target.value)} required />}
          {activeTab === 'planner' && (
            <div className="w-full">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">备注 (Notes)</label>
              <textarea className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none" value={formData.notes} onChange={e => update('notes', e.target.value)} />
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <Button variant="secondary" onClick={onClose} className="flex-1">取消</Button>
            <Button type="submit" className="flex-1" disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin" /> : '保存'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default AddEditModal;
