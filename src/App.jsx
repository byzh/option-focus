import React, { useState, useEffect } from 'react';
import { calcNetBasis, calcFinalPnL } from './calc';
import {
  Plus, TrendingUp, Settings, Loader2,
  Cloud, CloudUpload, Database, ChevronUp,
  AlertTriangle, ScanSearch, LogOut, BarChart2, Search, X
} from 'lucide-react';
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'firebase/auth';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot
} from 'firebase/firestore';

import { app, auth, db, initError, APP_ID } from './firebase/firebaseInit';
import { getLocalTodayString, isExpiredByTwoDays, isExpired } from './utils/dateUtils';

import Card from './components/ui/Card';
import Button from './components/ui/Button';
import ConfigScreen from './components/ConfigScreen';
import ErrorScreen from './components/ErrorScreen';
import LoginScreen from './components/LoginScreen';
import MessageModal from './components/MessageModal';
import ConfirmModal from './components/ConfirmModal';
import ExecutionModal from './components/ExecutionModal';
import ItemCard from './components/ItemCard';
import AddEditModal from './components/AddEditModal';

const EMPTY_FORM = () => ({
  id: null, ticker: '', type: 'CALL', direction: 'BUY', actionCategory: 'OPEN',
  strike: '', expiration: getLocalTodayString(), newStrike: '', newExpirationPeriod: '',
  entryPrice: '', rollCredit: '0', contracts: 1, selectedPositionId: '',
  actionDate: getLocalTodayString(), notes: ''
});

export default function App() {
  if (initError) return <ErrorScreen error={initError} />;
  if (!app) return <ConfigScreen />;

  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('portfolio');
  const [showAddModal, setShowAddModal] = useState(false);
  const [positions, setPositions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [executionPlan, setExecutionPlan] = useState(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [messageModal, setMessageModal] = useState({ isOpen: false, title: '', content: '', type: 'info' });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', content: '', onConfirm: () => {} });
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [isRiskExpanded, setIsRiskExpanded] = useState(false);
  const [isRealizedExpanded, setIsRealizedExpanded] = useState(false);
  const [searchTicker, setSearchTicker] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterDir, setFilterDir] = useState('ALL');
  const [showAggregated, setShowAggregated] = useState(false);
  const [expandedTickers, setExpandedTickers] = useState(new Set());
  const [formData, setFormData] = useState(EMPTY_FORM());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState(null);

  const handleSort = (key) => setSortConfig(prev =>
    prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }
  );

  // Calculate single-stock concentration
  const getTickerConcentration = (ticker) => {
    const shortPuts = positions.filter(p => p.type === 'PUT' && p.direction === 'SELL' && p.status !== 'CLOSED' && !isExpiredByTwoDays(p.expiration));
    if (shortPuts.length === 0) return 0;
    const total = shortPuts.reduce((sum, p) => sum + (parseFloat(p.strike) || 0) * 100 * (parseInt(p.contracts) || 1), 0);
    const tickerCost = shortPuts.filter(p => p.ticker === ticker).reduce((sum, p) => sum + (parseFloat(p.strike) || 0) * 100 * (parseInt(p.contracts) || 1), 0);
    return total > 0 ? (tickerCost / total) * 100 : 0;
  };

  // Aggregation helper
  const aggregateByTicker = (positionList) => {
    const grouped = {};
    positionList.forEach(p => {
      if (!grouped[p.ticker]) grouped[p.ticker] = [];
      grouped[p.ticker].push(p);
    });

    return Object.entries(grouped).map(([ticker, items]) => {
      const itemCount = items.length;
      // Count all positions (active, closed, and expired) for totalContracts
      const totalContracts = items.reduce((sum, p) => sum + (parseInt(p.contracts) || 1), 0);
      const totalCost = items.reduce((sum, p) => sum + calcNetBasis(p.entryPrice, p.rollCredit, p.contracts), 0);
      const avgCost = totalCost > 0 ? totalCost / totalContracts : 0;
      const activeItems = items.filter(p => p.status !== 'CLOSED' && !isExpiredByTwoDays(p.expiration));
      const earliestDTE = activeItems.length > 0 ? Math.min(...activeItems.map(p => {
        if (!p.expiration) return Infinity;
        const exp = new Date(p.expiration);
        const now = new Date();
        exp.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        return Math.ceil((exp - now) / 86400000);
      })) : Infinity;
      return { ticker, items, itemCount, totalContracts, totalCost, avgCost, earliestDTE };
    });
  };

  // Auth
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => { setUser(u); if (u) setIsLoggingIn(false); });
  }, []);

  const handleGoogleLogin = async () => {
    if (!auth) return;
    setIsLoggingIn(true); setLoginError(null);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (error) { setLoginError(error.message); setIsLoggingIn(false); }
  };

  const handleLogout = async () => {
    try { await signOut(auth); setPositions([]); setPlans([]); }
    catch (error) { console.error('Logout Failed:', error); }
  };

  // Firestore sync
  useEffect(() => {
    if (!user || !db) return;
    const unsubPos = onSnapshot(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'positions'), (s) => setPositions(s.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
    const unsubPlans = onSnapshot(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'plans'), (s) => setPlans(s.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
    return () => { unsubPos(); unsubPlans(); };
  }, [user]);

  // Auto-close expired positions
  useEffect(() => {
    if (!user || !db || positions.length === 0) return;
    const expiredPositions = positions.filter(p => p.status !== 'CLOSED' && isExpired(p.expiration));
    expiredPositions.forEach(p => {
      const today = getLocalTodayString();
      updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', p.id), {
        status: 'CLOSED',
        closePrice: 0,
        dateClosed: today,
        history: [{ date: today, action: 'AUTO_EXPIRE', closePrice: 0, notes: '自动过期' }, ...(p.history || [])]
      }).catch(e => console.error('Failed to auto-close expired position:', e));
    });
  }, [positions, user, db]);

  // Migration
  const checkMigrationEligibility = () => {
    if (!user) { setMessageModal({ isOpen: true, title: '未连接', content: "⚠️ 尚未连接到云端，请等待右上角显示'云端已连接'后再试。", type: 'error' }); return; }
    const rawPos = localStorage.getItem('opt_positions');
    const rawPlans = localStorage.getItem('opt_plans');
    if (!rawPos && !rawPlans) { setMessageModal({ isOpen: true, title: '无数据', content: "本地存储中没有找到历史数据。", type: 'info' }); return; }
    const localPositions = rawPos ? JSON.parse(rawPos) : [];
    const localPlans = rawPlans ? JSON.parse(rawPlans) : [];
    if (localPositions.length === 0 && localPlans.length === 0) { setMessageModal({ isOpen: true, title: '无数据', content: "本地存储数据为空。", type: 'info' }); return; }
    setConfirmModal({ isOpen: true, title: '确认迁移', content: `检测到本地有 ${localPositions.length} 条持仓和 ${localPlans.length} 条备忘。确定要上传到云端吗？`, onConfirm: () => performMigration(localPositions, localPlans) });
  };

  const performMigration = async (localPositions, localPlans) => {
    setIsMigrating(true);
    try {
      const posPromises = localPositions.map(p => { const c = { ...p, history: p.history || [] }; delete c.id; return addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'positions'), c); });
      const planPromises = localPlans.map(p => { const c = { ...p }; delete c.id; return addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'plans'), c); });
      await Promise.all([...posPromises, ...planPromises]);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
      setMessageModal({ isOpen: true, title: '迁移成功', content: `✅ 成功导入了 ${localPositions.length + localPlans.length} 条数据！`, type: 'info' });
    } catch (e) {
      setMessageModal({ isOpen: true, title: '迁移失败', content: `❌ 错误信息: ${e.message}`, type: 'error' });
    } finally { setIsMigrating(false); }
  };

  // Calculation helpers (thin wrappers)
  const calculateNetBasis = (pos) => calcNetBasis(pos.entryPrice, pos.rollCredit, pos.contracts);
  const calculateFinalPnL = (pos) => {
    let closePrice = 0;
    if (pos.status === 'CLOSED') closePrice = parseFloat(pos.closePrice) || 0;
    else if (isExpiredByTwoDays(pos.expiration)) closePrice = 0;
    else return null;
    return calcFinalPnL(pos.direction, calculateNetBasis(pos), closePrice, pos.contracts);
  };

  // CRUD
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) { setMessageModal({ isOpen: true, title: '未连接', content: "⚠️ 尚未连接到云端，无法保存。", type: 'error' }); return; }
    const colName = activeTab === 'portfolio' ? 'positions' : 'plans';
    const newItem = { ...formData, entryPrice: parseFloat(formData.entryPrice) || 0, rollCredit: parseFloat(formData.rollCredit) || 0, contracts: parseInt(formData.contracts) || 1, strike: parseFloat(formData.strike) || 0, newStrike: parseFloat(formData.newStrike) || 0, status: formData.id ? undefined : 'OPEN', history: formData.id ? undefined : [], dateOpened: formData.id ? undefined : getLocalTodayString() };
    Object.keys(newItem).forEach(key => newItem[key] === undefined && delete newItem[key]);
    delete newItem.id;
    setIsSaving(true);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out.")), 10000));
      const op = formData.id
        ? updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, colName, formData.id), newItem)
        : addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, colName), newItem);
      await Promise.race([op, timeout]);
      closeModal();
      const action = formData.id ? '更新' : '创建';
      const category = activeTab === 'portfolio' ? '持仓' : '备忘';
      setMessageModal({ isOpen: true, title: '保存成功', content: `✅ ${action}${category}成功。`, type: 'info' });
    } catch (e) {
      setMessageModal({ isOpen: true, title: '保存失败 (Save Failed)', content: `❌ 操作超时或失败。\n错误信息: ${e.message}`, type: 'error' });
    } finally { setIsSaving(false); }
  };

  const deleteItem = async (id, listType) => {
    setConfirmModal({
      isOpen: true, title: '确认删除', content: '确定要删除这条记录吗？此操作无法撤销。',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, listType === 'portfolio' ? 'positions' : 'plans', id));
          setConfirmModal({ isOpen: false, title: '', content: '', onConfirm: () => {} });
          const itemType = listType === 'portfolio' ? '持仓' : '备忘';
          setMessageModal({ isOpen: true, title: '删除成功', content: `✅ ${itemType}已删除。`, type: 'info' });
        } catch (e) {
          setConfirmModal({ isOpen: false, title: '', content: '', onConfirm: () => {} });
          setMessageModal({ isOpen: true, title: '删除失败', content: `❌ 错误信息: ${e.message}`, type: 'error' });
        }
      }
    });
  };

  const handlePositionSelect = (posId) => {
    const pos = positions.find(p => p.id === posId);
    if (pos) setFormData(prev => ({ ...prev, selectedPositionId: posId, ticker: pos.ticker, type: pos.type, direction: pos.direction, strike: pos.strike, expiration: pos.expiration, newStrike: pos.strike, newExpirationPeriod: '' }));
  };

  const handleDirectAction = (position, actionCategory) => {
    setExecutionPlan({ ...position, actionCategory, selectedPositionId: position.id, isDirect: true, newStrike: position.strike, newExpirationPeriod: '' });
  };

  const handleExecutionConfirm = async (plan, execData) => {
    const today = getLocalTodayString();
    setIsExecuting(true);
    try {
      if (plan.actionCategory === 'OPEN') {
        await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'positions'), { status: 'OPEN', ticker: plan.ticker, type: plan.type, direction: plan.direction, strike: parseFloat(execData.strike), expiration: execData.expiration, entryPrice: parseFloat(execData.price), rollCredit: 0, history: [], dateOpened: today });
        setMessageModal({ isOpen: true, title: '开仓成功', content: `已记录 ${plan.ticker} ${plan.type} ${plan.direction === 'BUY' ? '买入' : '卖出'}。`, type: 'info' });
      } else if (plan.actionCategory === 'CLOSE') {
        const pos = positions.find(p => p.id === plan.selectedPositionId);
        if (pos) {
          const closePrice = parseFloat(execData.price);
          await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', pos.id), { status: 'CLOSED', closePrice, dateClosed: today, history: [{ date: today, action: 'CLOSE', closePrice, notes: 'Closed' }, ...(pos.history || [])] });
          const pnl = calcFinalPnL(pos.direction, calculateNetBasis(pos), closePrice, pos.contracts);
          setMessageModal({ isOpen: true, title: '平仓成功', content: `已平仓 ${pos.ticker}。\n最终盈亏: $${pnl.toFixed(2)}`, type: 'info' });
        }
      } else if (plan.actionCategory === 'ROLL') {
        const pos = positions.find(p => p.id === plan.selectedPositionId);
        if (pos) {
          const rollInputPrice = parseFloat(execData.price) || 0;
          const basisAdj = pos.direction === 'SELL' ? -1 * rollInputPrice : rollInputPrice;
          await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', pos.id), { strike: parseFloat(execData.strike), expiration: execData.expiration, rollCredit: (parseFloat(pos.rollCredit) || 0) + basisAdj, history: [{ date: today, action: 'ROLL', oldStrike: pos.strike, oldExpiration: pos.expiration, rollPrice: rollInputPrice, snapshotEntryPrice: pos.entryPrice, newStrike: parseFloat(execData.strike), newExpiration: execData.expiration }, ...(pos.history || [])] });
          setMessageModal({ isOpen: true, title: '展期成功', content: `已展期 ${pos.ticker} 至 ${execData.expiration} $${parseFloat(execData.strike)}。`, type: 'info' });
        }
      }
      if (!plan.isDirect && plan.id) await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'plans', plan.id));
      setExecutionPlan(null);
    } catch (e) {
      setMessageModal({ isOpen: true, title: '执行失败', content: `❌ 交易执行出错。\n错误信息: ${e.message}`, type: 'error' });
    } finally { setIsExecuting(false); }
  };

  const openEdit = (item) => { setFormData({ ...item, id: item.id }); setShowAddModal(true); };
  const closeModal = () => { setShowAddModal(false); setFormData(EMPTY_FORM()); };

  const todaysPlanCount = plans.filter(p => p.actionDate === getLocalTodayString()).length;
  const expiredCount = positions.filter(p => p.status !== 'CLOSED' && isExpiredByTwoDays(p.expiration)).length;

  if (!user) return <LoginScreen onLogin={handleGoogleLogin} loading={isLoggingIn} error={loginError} />;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white"><TrendingUp size={20} /></div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">OptionFocus <span className="text-xs font-normal opacity-70 ml-1">v2</span></h1>
              <p className="text-[10px] text-emerald-500 flex items-center gap-1"><Cloud size={10} /> 云端已连接</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mr-2">
              {user.photoURL && <img src={user.photoURL} alt="Avatar" className="w-6 h-6 rounded-full" />}
              <span className="truncate max-w-[100px]">{user.displayName || user.email}</span>
            </div>
            <button onClick={() => setActiveTab('settings')} className={`p-2 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-slate-100 dark:bg-slate-700 text-blue-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`} title="Settings">
              <Settings size={20} />
            </button>
            <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Log Out"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'settings' ? (
          <Card className="p-6 max-w-lg mx-auto mt-10">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Settings size={20} />设置</h2>
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 mt-4">
                <h4 className="font-bold text-blue-700 dark:text-blue-300 text-sm mb-2 flex items-center gap-2"><Database size={14} /> 数据迁移</h4>
                <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">如果您之前使用过本地版本，可以将浏览器中的数据一键同步到云端数据库。</p>
                <Button onClick={checkMigrationEligibility} variant="secondary" disabled={isMigrating || !user} className="w-full text-xs h-8">
                  {isMigrating ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />} 导入本地历史数据
                </Button>
              </div>
              <Button onClick={() => setActiveTab('portfolio')} className="w-full mt-4">返回</Button>
            </div>
          </Card>
        ) : (
          <>
            <div className="flex gap-4 mb-6 border-b border-slate-200 dark:border-slate-700 pb-1">
              <button onClick={() => setActiveTab('portfolio')} className={`pb-3 px-2 font-medium text-sm transition-all relative ${activeTab === 'portfolio' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
                持仓监控 (Portfolio){activeTab === 'portfolio' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
              </button>
              <button onClick={() => setActiveTab('planner')} className={`pb-3 px-2 font-medium text-sm transition-all relative flex items-center gap-2 ${activeTab === 'planner' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
                交易备忘 (Planner){todaysPlanCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">{todaysPlanCount}</span>}
                {activeTab === 'planner' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
              </button>
            </div>

            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">{activeTab === 'portfolio' ? '当前持仓 (Open Positions)' : '操作计划 (Planner)'}</h2>
              <div className="flex gap-2"><Button onClick={() => setShowAddModal(true)}><Plus size={18} /> {activeTab === 'portfolio' ? '记录持仓' : '新增备忘'}</Button></div>
            </div>

            {/* Sort controls */}
            {activeTab === 'portfolio' && (
              <div className="flex items-center gap-2 mb-4 text-xs">
                <span className="text-slate-400 font-medium">排序:</span>
                {[{ key: 'ticker', label: '名称' }, { key: 'days', label: '剩余天数' }].map(({ key, label }) => (
                  <button key={key} onClick={() => handleSort(key)} className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-colors ${sortConfig.key === key ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300'}`}>
                    {label}
                    {sortConfig.key === key && <ChevronUp size={12} className={sortConfig.direction === 'desc' ? 'rotate-180 transition-transform' : 'transition-transform'} />}
                  </button>
                ))}
              </div>
            )}

            {/* Search & Filter */}
            {activeTab === 'portfolio' && (
              <div className="mb-4 space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text" placeholder="搜索代码 (Search ticker)..."
                    value={searchTicker} onChange={e => setSearchTicker(e.target.value.toUpperCase())}
                    className="w-full pl-8 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  {searchTicker && <button onClick={() => setSearchTicker('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {[['ALL', '全部'], ['OPEN', '持仓中'], ['CLOSED', '已平仓']].map(([val, label]) => (
                    <button key={val} onClick={() => setFilterStatus(val)} className={`px-2.5 py-1 rounded-full border transition-colors ${filterStatus === val ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300'}`}>{label}</button>
                  ))}
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  {[['ALL', '全类型'], ['CALL', 'Call'], ['PUT', 'Put']].map(([val, label]) => (
                    <button key={val} onClick={() => setFilterType(val)} className={`px-2.5 py-1 rounded-full border transition-colors ${filterType === val ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 font-medium' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300'}`}>{label}</button>
                  ))}
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  {[['ALL', '全方向'], ['SELL', 'Short'], ['BUY', 'Long']].map(([val, label]) => (
                    <button key={val} onClick={() => setFilterDir(val)} className={`px-2.5 py-1 rounded-full border transition-colors ${filterDir === val ? 'bg-rose-100 dark:bg-rose-900/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 font-medium' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300'}`}>{label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-xs text-slate-400 font-medium">视图:</span>
                  <button onClick={() => setShowAggregated(false)} className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${!showAggregated ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300'}`}>详细</button>
                  <button onClick={() => setShowAggregated(true)} className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${showAggregated ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300'}`}>按代码聚合</button>
                </div>
              </div>
            )}

            {/* Short Put risk panel */}
            {activeTab === 'portfolio' && (() => {
              const shortPuts = positions.filter(p => p.type === 'PUT' && p.direction === 'SELL' && p.status !== 'CLOSED' && !isExpiredByTwoDays(p.expiration));
              if (shortPuts.length === 0) return null;
              const total = shortPuts.reduce((sum, p) => sum + (parseFloat(p.strike) || 0) * 100 * (parseInt(p.contracts) || 1), 0);
              const requiredNAV = total * 2;
              return (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-4 overflow-hidden">
                  <button onClick={() => setIsRiskExpanded(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                      <span className="font-semibold text-sm text-amber-800 dark:text-amber-200">Short Put 风控</span>
                      <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-800/50 px-1.5 py-0.5 rounded-full">{shortPuts.length} 个</span>
                    </div>
                    <ChevronUp size={15} className={`text-amber-500 transition-transform ${isRiskExpanded ? '' : 'rotate-180'}`} />
                  </button>
                  <div className="px-4 pb-3 grid grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-amber-100 dark:border-amber-800/50">
                      <div className="text-xs text-slate-400 mb-0.5">总接货成本</div>
                      <div className="font-mono font-bold text-slate-700 dark:text-slate-200">${total.toLocaleString()}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-amber-100 dark:border-amber-800/50">
                      <div className="text-xs text-slate-400 mb-0.5">所需最低净值 <span className="text-amber-500">(50% 规则)</span></div>
                      <div className="font-mono font-bold text-amber-600 dark:text-amber-400">${requiredNAV.toLocaleString()}</div>
                    </div>
                  </div>
                  {isRiskExpanded && (() => {
                    const tickerGroups = shortPuts.reduce((acc, p) => {
                      const t = p.ticker || '未知';
                      acc[t] = (acc[t] || 0) + (parseFloat(p.strike) || 0) * 100 * (parseInt(p.contracts) || 1);
                      return acc;
                    }, {});
                    const sortedTickers = Object.entries(tickerGroups).sort((a, b) => b[1] - a[1]);
                    return (
                      <div className="border-t border-amber-200 dark:border-amber-800">
                        {/* Ticker concentration */}
                        <div className="px-4 pt-3 pb-2">
                          <div className="text-xs font-bold text-slate-400 uppercase mb-2">单股集中度</div>
                          {sortedTickers.map(([ticker, cost]) => {
                            const pct = total > 0 ? (cost / total * 100) : 0;
                            const isConcentrated = pct > 50;
                            return (
                              <div key={ticker} className="mb-1.5">
                                <div className="flex items-center justify-between text-xs mb-0.5">
                                  <div className="flex items-center gap-1.5">
                                    {isConcentrated && <AlertTriangle size={10} className="text-red-500" />}
                                    <span className={`font-medium ${isConcentrated ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>{ticker}</span>
                                  </div>
                                  <span className={`font-mono ${isConcentrated ? 'text-red-600 dark:text-red-400 font-bold' : 'text-slate-500'}`}>${cost.toLocaleString()} · {pct.toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${isConcentrated ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Individual positions */}
                        <div className="border-t border-amber-100 dark:border-amber-800/40">
                          {shortPuts.map(p => {
                            const ct = parseInt(p.contracts) || 1;
                            const cost = (parseFloat(p.strike) || 0) * 100 * ct;
                            return (
                              <div key={p.id} className="flex items-center justify-between px-4 py-2 text-sm border-b border-amber-100 dark:border-amber-800/40 last:border-b-0">
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold text-slate-700 dark:text-slate-200 w-16">{p.ticker}</span>
                                  <span className="text-slate-500 dark:text-slate-400">${parseFloat(p.strike).toFixed(0)} 行权 × {ct} 张</span>
                                </div>
                                <span className="font-mono text-slate-600 dark:text-slate-300">${cost.toLocaleString()}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Realized P&L Summary */}
            {activeTab === 'portfolio' && (() => {
              const closedPositions = positions.filter(p => p.status === 'CLOSED' || isExpiredByTwoDays(p.expiration));
              if (closedPositions.length === 0) return null;
              const totalPnL = closedPositions.reduce((sum, p) => sum + (calculateFinalPnL(p) || 0), 0);
              const isPositive = totalPnL >= 0;
              const colorCls = isPositive
                ? { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', hover: 'hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30', icon: 'text-emerald-500', title: 'text-emerald-800 dark:text-emerald-200', badge: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-800/50', total: 'text-emerald-700 dark:text-emerald-300', divider: 'divide-emerald-100 dark:divide-emerald-800/40', chevron: 'text-emerald-500' }
                : { bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-200 dark:border-rose-800', hover: 'hover:bg-rose-100/50 dark:hover:bg-rose-900/30', icon: 'text-rose-500', title: 'text-rose-800 dark:text-rose-200', badge: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-800/50', total: 'text-rose-700 dark:text-rose-300', divider: 'divide-rose-100 dark:divide-rose-800/40', chevron: 'text-rose-500' };
              return (
                <div className={`${colorCls.bg} border ${colorCls.border} rounded-xl mb-4 overflow-hidden`}>
                  <button onClick={() => setIsRealizedExpanded(v => !v)} className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${colorCls.hover}`}>
                    <div className="flex items-center gap-2">
                      <BarChart2 size={16} className={colorCls.icon} />
                      <span className={`font-semibold text-sm ${colorCls.title}`}>已实现盈亏</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${colorCls.badge}`}>{closedPositions.length} 个</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-bold ${colorCls.total}`}>{isPositive ? '+' : '-'}${Math.abs(totalPnL).toFixed(2)}</span>
                      <ChevronUp size={15} className={`${colorCls.chevron} transition-transform ${isRealizedExpanded ? '' : 'rotate-180'}`} />
                    </div>
                  </button>
                  {isRealizedExpanded && (
                    <div className={`border-t ${colorCls.border} divide-y ${colorCls.divider}`}>
                      {closedPositions.map(p => {
                        const pnl = calculateFinalPnL(p) || 0;
                        const isPos = pnl >= 0;
                        const isExpired = p.status !== 'CLOSED' && isExpiredByTwoDays(p.expiration);
                        return (
                          <div key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-slate-700 dark:text-slate-200 w-16">{p.ticker}</span>
                              <span className="text-slate-500 dark:text-slate-400">${parseFloat(p.strike).toFixed(0)} {p.type} {p.expiration}</span>
                              {isExpired && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">过期</span>}
                            </div>
                            <span className={`font-mono font-semibold ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {isPos ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Expired warning */}
            {activeTab === 'portfolio' && expiredCount > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 flex items-center gap-3 animate-in slide-in-from-top-2">
                <ScanSearch size={24} className="text-red-500" />
                <div><h4 className="font-bold text-red-700 dark:text-red-300">过期扫描报告</h4><p className="text-xs text-red-600 dark:text-red-400">检测到 {expiredCount} 个期权已过期超过2天。系统已按"价值归零"自动计算了最终盈亏。</p></div>
              </div>
            )}

            {/* Position list */}
            <div className="grid gap-4">
              {(() => {
                const baseList = activeTab === 'portfolio'
                  ? positions.filter(p => {
                      if (searchTicker && !p.ticker?.toUpperCase().includes(searchTicker)) return false;
                      if (filterStatus !== 'ALL') {
                        const isClosed = p.status === 'CLOSED' || isExpiredByTwoDays(p.expiration);
                        if (filterStatus === 'OPEN' && isClosed) return false;
                        if (filterStatus === 'CLOSED' && !isClosed) return false;
                      }
                      if (filterType !== 'ALL' && p.type !== filterType) return false;
                      if (filterDir !== 'ALL' && p.direction !== filterDir) return false;
                      return true;
                    })
                  : plans;
                if (baseList.length === 0) return <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700"><p>{searchTicker || filterStatus !== 'ALL' || filterType !== 'ALL' || filterDir !== 'ALL' ? '没有符合筛选条件的记录' : '暂无记录'}</p></div>;

                if (showAggregated && activeTab === 'portfolio') {
                  const aggregated = aggregateByTicker(baseList).sort((a, b) => b.totalCost - a.totalCost);
                  return aggregated.map(agg => (
                    <div key={agg.ticker}>
                      <button onClick={() => setExpandedTickers(prev => new Set(prev.has(agg.ticker) ? [...prev].filter(t => t !== agg.ticker) : [...prev, agg.ticker]))} className="w-full text-left p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <ChevronUp size={14} className={`text-slate-400 transition-transform ${expandedTickers.has(agg.ticker) ? '' : 'rotate-180'}`} />
                            <span className="font-bold text-lg text-slate-800 dark:text-white">{agg.ticker}</span>
                            <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">{agg.itemCount} 条</span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-400">平均成本</div>
                            <div className="font-mono font-bold text-slate-700 dark:text-slate-300">${agg.avgCost.toFixed(2)}</div>
                          </div>
                        </div>
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>累计成本: ${agg.totalCost.toFixed(0)}</span>
                          <span>{agg.earliestDTE > 0 ? `还剩 ${agg.earliestDTE} 天` : '已过期'}</span>
                        </div>
                      </button>
                      {expandedTickers.has(agg.ticker) && (
                        <div className="mt-2 space-y-2 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                          {agg.items.sort((a, b) => (b.expiration || '').localeCompare(a.expiration || '')).map(item => {
                            const concentration = item.type === 'PUT' && item.direction === 'SELL' ? getTickerConcentration(item.ticker) : 0;
                            return (
                              <ItemCard key={item.id} item={item} type={activeTab} onEdit={openEdit} onDelete={deleteItem} onExecute={() => setExecutionPlan(item)} onDirectAction={handleDirectAction} concentration={concentration} />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ));
                }

                return baseList.sort((a, b) => {
                if (activeTab !== 'portfolio') return (b.actionDate || '').localeCompare(a.actionDate || '');
                const dir = sortConfig.direction === 'asc' ? 1 : -1;
                if (sortConfig.key === 'ticker') return (a.ticker || '').localeCompare(b.ticker || '') * dir;
                if (sortConfig.key === 'days') {
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const getDays = (item) => item.expiration ? Math.ceil((new Date(item.expiration + 'T00:00:00') - today) / 86400000) : Infinity;
                  return (getDays(a) - getDays(b)) * dir;
                }
                return (b.dateOpened || '').localeCompare(a.dateOpened || '') * dir;
              }).map(item => {
                const concentration = item.type === 'PUT' && item.direction === 'SELL' ? getTickerConcentration(item.ticker) : 0;
                return (
                  <ItemCard
                    key={item.id} item={item} type={activeTab} onEdit={openEdit} onDelete={deleteItem}
                    onExecute={() => setExecutionPlan(item)}
                    onDirectAction={handleDirectAction}
                    concentration={concentration}
                  />
                );
              });
              })()}
            </div>
          </>
        )}
      </main>

      {showAddModal && <AddEditModal formData={formData} setFormData={setFormData} onSubmit={handleSubmit} onClose={closeModal} activeTab={activeTab} positions={positions} onSelectPos={handlePositionSelect} isSaving={isSaving} />}
      {executionPlan && <ExecutionModal plan={executionPlan} onClose={() => setExecutionPlan(null)} onConfirm={handleExecutionConfirm} isLoading={isExecuting} />}
      <MessageModal isOpen={messageModal.isOpen} title={messageModal.title} content={messageModal.content} type={messageModal.type} onClose={() => setMessageModal({ ...messageModal, isOpen: false })} />
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} content={confirmModal.content} loading={isMigrating} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
    </div>
  );
}
