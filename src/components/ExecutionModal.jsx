import React, { useState } from 'react';
import { CheckSquare, HelpCircle, AlertCircle, Loader2 } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';

const ExecutionModal = ({ plan, onClose, onConfirm, isLoading = false }) => {
  const totalContracts = parseInt(plan.contracts) || 1;
  const [execData, setExecData] = useState({
    price: '',
    strike: plan.newStrike || plan.strike,
    expiration: plan.newExpirationPeriod || plan.expiration,
    contractsToClose: totalContracts,
    addContracts: 1,
  });
  const [validationError, setValidationError] = useState('');

  const isRoll = plan.actionCategory === 'ROLL';
  const isClose = plan.actionCategory === 'CLOSE';
  const isAdd = plan.actionCategory === 'ADD';
  const isDirect = plan.isDirect;

  const handleConfirm = () => {
    const priceStr = String(execData.price || '').trim();
    if (!priceStr) { setValidationError('请输入价格'); return; }
    const priceNum = parseFloat(priceStr);
    if (isNaN(priceNum)) { setValidationError('价格必须是有效的数字'); return; }
    if (isAdd) {
      const ac = parseInt(execData.addContracts) || 0;
      if (ac < 1) { setValidationError('加仓张数须至少为 1'); return; }
    }
    if (isClose && plan.assetType !== 'STOCK') {
      const ctc = parseInt(execData.contractsToClose) || 0;
      if (ctc < 1 || ctc > totalContracts) { setValidationError(`平仓张数须在 1 ~ ${totalContracts} 之间`); return; }
    }
    if (!isClose && !isAdd) {
      if (!String(execData.strike || '').trim()) { setValidationError('请输入行权价'); return; }
      if (!String(execData.expiration || '').trim()) { setValidationError('请选择到期日'); return; }
    }
    setValidationError('');
    onConfirm(plan, execData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <h3 className="text-xl font-bold mb-2 text-slate-800 dark:text-white flex items-center gap-2">
            <CheckSquare size={20} className="text-emerald-500" /> 确认交易执行
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            {isRoll ? "请填写滚仓的净价差和新的期权详情。" : "请输入实际成交的细节。"}
          </p>

          {validationError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg mb-4 flex items-center gap-2">
              <AlertCircle size={16} />
              {validationError}
            </div>
          )}

          <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800 mb-4">
            <div className="text-xs font-bold uppercase text-slate-400 mb-1">执行操作 (Action)</div>
            <div className="font-medium text-slate-800 dark:text-white">
              {plan.actionCategory === 'ROLL' ? '滚仓' : plan.actionCategory === 'CLOSE' ? '平仓' : plan.actionCategory === 'ADD' ? '加仓' : '开仓'} {plan.ticker}
              {isRoll && !isDirect && ` 至 ${plan.newStrike} (到期: ${plan.newExpirationPeriod || '?'})`}
            </div>
          </div>

          <div className="space-y-4">
            {isRoll ? (
              <div>
                <Input
                  label="净滚仓价 (Net Price)"
                  type="number" step="0.01"
                  value={execData.price}
                  onChange={e => setExecData({ ...execData, price: e.target.value })}
                  placeholder="-0.50 (收钱) / 0.50 (付钱)"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                  <HelpCircle size={10} /> 负数(-) = Credit (收钱) | 正数(+) = Debit (付钱)
                </p>
              </div>
            ) : isAdd ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="加仓张数"
                    type="number" step="1" min="1"
                    value={execData.addContracts}
                    onChange={e => setExecData({ ...execData, addContracts: e.target.value })}
                    required
                  />
                  <Input
                    label="加仓价格 (per share)"
                    type="number" step="0.01"
                    value={execData.price}
                    onChange={e => setExecData({ ...execData, price: e.target.value })}
                    placeholder="2.50"
                    required
                  />
                </div>
                {execData.price && execData.addContracts && (() => {
                  const addC = parseInt(execData.addContracts) || 0;
                  const addP = parseFloat(execData.price) || 0;
                  const oldNetPerContract = (parseFloat(plan.entryPrice) || 0) + (parseFloat(plan.rollCredit) || 0) + (parseFloat(plan.costAdj) || 0);
                  const newTotal = totalContracts + addC;
                  const newAvg = (oldNetPerContract * totalContracts + addP * addC) / newTotal;
                  return (
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                      <div>当前成本: <span className="font-mono">${oldNetPerContract.toFixed(2)}/share × {totalContracts} 张</span></div>
                      <div>加仓后均价: <span className="font-mono font-semibold text-slate-800 dark:text-white">${newAvg.toFixed(2)}/share × {newTotal} 张</span></div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <>
                <Input
                  label={isClose ? "平仓价格 (Close Price)" : "开仓价格 (Open Price)"}
                  type="number" step="0.01"
                  value={execData.price}
                  onChange={e => setExecData({ ...execData, price: e.target.value })}
                  placeholder="2.50"
                  required
                />
                {isClose && plan.assetType !== 'STOCK' && (
                  <div className="mt-3">
                    <Input
                      label={`平仓张数 (最多 ${totalContracts} 张)`}
                      type="number" step="1" min="1" max={totalContracts}
                      value={execData.contractsToClose}
                      onChange={e => setExecData({ ...execData, contractsToClose: e.target.value })}
                      required
                    />
                    {parseInt(execData.contractsToClose) < totalContracts && (
                      <p className="text-xs text-slate-400 mt-1">
                        部分平仓：剩余 {totalContracts - parseInt(execData.contractsToClose)} 张继续持有
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {!isClose && !isAdd && (
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={isRoll ? "新行权价" : "实际行权价"}
                  type="number" step="0.5"
                  value={execData.strike}
                  onChange={e => setExecData({ ...execData, strike: e.target.value })}
                  required
                />
                <Input
                  label={isRoll ? "新到期日" : "实际到期日"}
                  type="date"
                  value={execData.expiration.includes('-') ? execData.expiration : ''}
                  onChange={e => setExecData({ ...execData, expiration: e.target.value })}
                  required
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <Button variant="secondary" onClick={onClose} className="flex-1" disabled={isLoading}>取消</Button>
            <Button variant="success" onClick={handleConfirm} className="flex-1" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : '确认并执行'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ExecutionModal;
