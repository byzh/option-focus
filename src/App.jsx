import { useState, useEffect, useMemo, useRef } from 'react';
import { calcNetBasis, calcFinalPnL, calcStockNetBasis, calcStockPnL, calcStockBuy, calcStockSell, calcStockTotalRealizedPnL } from './calc';
import { detectCC, detectPMCC } from './utils/strategyDetect';
import { selectDeltaPositions } from './utils/deltaPositions';
import { useLeapsDelta } from './hooks/useLeapsDelta';
import {
  Plus, TrendingUp, Settings, Loader2,
  Cloud, CloudUpload, Database, ChevronUp,
  AlertTriangle, LogOut, BarChart2, Search, X, Menu
} from 'lucide-react';
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'firebase/auth';
import {
  collection, addDoc, updateDoc, deleteDoc, doc
} from 'firebase/firestore';

import { app, auth, db, functions, initError, APP_ID } from './firebase/firebaseInit';
import { registerFcm, onForegroundMessage, onNotificationMessage } from './firebase/fcm';
import { getLocalTodayString, isExpired, calculateDTE } from './utils/dateUtils';

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
import StockTradeModal from './components/StockTradeModal';
import MonitorTab from './components/MonitorTab';
import StrategyTab from './components/StrategyTab';
import { useFirestorePositions } from './hooks/useFirestorePositions';


const EMPTY_FORM = () => ({
  id: null, ticker: '', assetType: 'OPTION', type: 'CALL', direction: 'BUY', actionCategory: 'OPEN',
  strike: '', expiration: getLocalTodayString(), newStrike: '', newExpirationPeriod: '',
  entryPrice: '', rollCredit: '0', contracts: 1, selectedPositionId: '', leapsId: null,
  actionDate: getLocalTodayString(), notes: ''
});

export default function App() {
  if (initError) return <ErrorScreen error={initError} />;
  if (!app) return <ConfigScreen />;

  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('portfolio');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handler = (e) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mobileMenuOpen]);
  const [showAddModal, setShowAddModal] = useState(false);
  const { positions, plans } = useFirestorePositions({ user, db });
  const [executionPlan, setExecutionPlan] = useState(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [messageModal, setMessageModal] = useState({ isOpen: false, title: '', content: '', type: 'info' });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', content: '', onConfirm: () => {} });
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [isRiskExpanded, setIsRiskExpanded] = useState(false);
  const [isRealizedExpanded, setIsRealizedExpanded] = useState(false);
  const [isClosedExpanded, setIsClosedExpanded] = useState(false);
  const [searchTicker, setSearchTicker] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterDir, setFilterDir] = useState('ALL');
  const [showAggregated, setShowAggregated] = useState(false);
  const [expandedTickers, setExpandedTickers] = useState(new Set());
  const [formData, setFormData] = useState(EMPTY_FORM());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [stockTradePosition, setStockTradePosition] = useState(null);

  const { deltaMap, loading: deltaLoading, fetchDeltas } = useLeapsDelta({ user });

  // Auto-fetch deltas for PUT options and LEAPS (BUY CALL DTE > 90) whenever positions change
  useEffect(() => {
    if (!user) return;
    const targets = selectDeltaPositions(positions);
    if (targets.length > 0) fetchDeltas(targets);
  }, [positions, user]);

  useEffect(() => { window.scrollTo(0, 0); }, [activeTab]);

  const handleSort = (key) => setSortConfig(prev =>
    prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }
  );

  // Calculate single-stock concentration
  const getTickerConcentration = (ticker) => {
    const shortPuts = positions.filter(p => p.type === 'PUT' && p.direction === 'SELL' && p.status !== 'CLOSED' && !isExpired(p.expiration));
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
      const openCount = items.filter(p => p.status !== 'CLOSED').length;
      // Count all positions (active, closed, and expired) for totalContracts
      const totalContracts = items.reduce((sum, p) => sum + (parseInt(p.contracts) || 1), 0);
      const totalCost = items.reduce((sum, p) => sum + calculateNetBasis(p), 0);
      const avgCost = totalCost > 0 ? totalCost / totalContracts : 0;
      const activeItems = items.filter(p => p.status !== 'CLOSED' && !isExpired(p.expiration));
      const earliestDTE = activeItems.length > 0 ? Math.min(...activeItems.map(p => {
        return calculateDTE(p.expiration) ?? Infinity;
      })) : Infinity;
      return { ticker, items, itemCount, openCount, totalContracts, totalCost, avgCost, earliestDTE };
    });
  };

  // Auth
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setIsLoggingIn(false);
        registerFcm(app, db, u.uid).catch(e => console.warn('FCM registration failed:', e));
      }
    });
  }, []);

  // FCM messages → show as MessageModal (foreground + notification click)
  useEffect(() => {
    if (!app) return;
    const unsubForeground = onForegroundMessage(app, ({ title, body }) => {
      setMessageModal({ isOpen: true, title, content: body, type: 'info', variant: 'notification' });
    });
    const unsubNotification = onNotificationMessage(({ title, body }) => {
      setMessageModal({ isOpen: true, title, content: body, type: 'info', variant: 'notification' });
    });
    return () => { unsubForeground(); unsubNotification(); };
  }, []);

  const handleGoogleLogin = async () => {
    if (!auth) return;
    setIsLoggingIn(true); setLoginError(null);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (error) { setLoginError(error.message); setIsLoggingIn(false); }
  };

  const handleLogout = async () => {
    try { await signOut(auth); }
    catch (error) { console.error('Logout Failed:', error); }
  };

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
    } catch (e) {
      setMessageModal({ isOpen: true, title: '迁移失败', content: `❌ 错误信息: ${e.message}`, type: 'error' });
    } finally { setIsMigrating(false); }
  };

  // Strategy tag map: positionId → 'CC' | 'PMCC'
  // Built once from detectCC/detectPMCC so all lookups are O(1) by ID.
  const strategyTagMap = useMemo(() => {
    const map = {};
    detectCC(positions).forEach(g => {
      map[g.stockId] = 'CC';
      g.openCalls.forEach(c => { map[c.id] = 'CC'; });
      g.closedCalls.forEach(c => { map[c.id] = 'CC'; });
    });
    detectPMCC(positions).forEach(g => {
      map[g.leapsId] = 'PMCC';
      g.openLinkedCalls.forEach(c => { map[c.id] = 'PMCC'; });
      g.closedLinkedCalls.forEach(c => { map[c.id] = 'PMCC'; });
    });
    return map;
  }, [positions]);
  const getStrategyTag = (item) => strategyTagMap[item.id] ?? null;

  // Calculation helpers (thin wrappers)
  const calculateNetBasis = (pos) => {
    if (pos.assetType === 'STOCK') return calcStockNetBasis(pos.entryPrice, pos.contracts);
    return calcNetBasis(pos.entryPrice, pos.rollCredit, pos.contracts);
  };
  const calculateFinalPnL = (pos) => {
    if (pos.assetType === 'STOCK') {
      if (pos.status !== 'CLOSED') return null;
      // Prefer history-based P&L (supports partial sells / 做T)
      const historyPnL = calcStockTotalRealizedPnL(pos.history);
      if (historyPnL !== 0) return historyPnL;
      // Fallback for simple close with no trade history
      return calcStockPnL(pos.entryPrice, pos.closePrice, pos.contracts);
    }
    let closePrice = 0;
    if (pos.status === 'CLOSED') closePrice = parseFloat(pos.closePrice) || 0;
    else if (isExpired(pos.expiration)) closePrice = 0;
    else return null;
    return calcFinalPnL(pos.direction, calculateNetBasis(pos), closePrice, pos.contracts);
  };

  // Stock BUY / SELL trade
  const handleStockTrade = async (position, action, shares, price, date, notes) => {
    if (!user || !db) return;
    const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', position.id);
    let update = {};
    if (action === 'BUY') {
      const { newAvgCost, newShares } = calcStockBuy(position.entryPrice, position.contracts, price, shares);
      const entry = { date, action: 'BUY', shares, price, avgCostAfter: newAvgCost, sharesAfter: newShares, realizedPnL: 0, notes };
      update = { entryPrice: newAvgCost, contracts: newShares, history: [entry, ...(position.history || [])] };
    } else {
      const { realizedPnL, newShares, isClosed } = calcStockSell(position.entryPrice, position.contracts, price, shares);
      const entry = { date, action: 'SELL', shares, price, avgCostAfter: position.entryPrice, sharesAfter: newShares, realizedPnL, notes };
      update = { contracts: newShares, history: [entry, ...(position.history || [])] };
      if (isClosed) { update.status = 'CLOSED'; update.closePrice = price; update.dateClosed = date; }
    }
    await updateDoc(ref, update).catch(e => console.error('Stock trade failed:', e));
    setStockTradePosition(null);
  };

  // CRUD
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) { setMessageModal({ isOpen: true, title: '未连接', content: "⚠️ 尚未连接到云端，无法保存。", type: 'error' }); return; }
    const colName = activeTab === 'portfolio' ? 'positions' : 'plans';
    const today = getLocalTodayString();
    const newItem = { ...formData, entryPrice: parseFloat(formData.entryPrice) || 0, rollCredit: parseFloat(formData.rollCredit) || 0, contracts: parseInt(formData.contracts) || 1, strike: parseFloat(formData.strike) || 0, newStrike: parseFloat(formData.newStrike) || 0, status: formData.id ? undefined : 'OPEN', history: formData.id ? undefined : [], dateOpened: formData.id ? undefined : today };
    // Stocks don't have option-specific fields — clear them to avoid phantom expiration bugs
    if (newItem.assetType === 'STOCK') {
      delete newItem.type;
      delete newItem.strike;
      delete newItem.expiration;
      delete newItem.rollCredit;
      delete newItem.leapsId;
      // For new positions, record initial buy as INIT history entry
      if (!formData.id) {
        newItem.history = [{
          date: today, action: 'INIT',
          shares: newItem.contracts, price: newItem.entryPrice,
          avgCostAfter: newItem.entryPrice, sharesAfter: newItem.contracts,
          realizedPnL: 0, notes: formData.notes || '',
        }];
      }
    }
    Object.keys(newItem).forEach(key => newItem[key] === undefined && delete newItem[key]);
    delete newItem.id;
    setIsSaving(true);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out.")), 10000));

      // Auto-merge: new option position that duplicates an existing open one → 增持
      const isNewOptionPosition = !formData.id && activeTab === 'portfolio' && newItem.assetType !== 'STOCK';
      const duplicate = isNewOptionPosition && positions.find(p =>
        p.status === 'OPEN' &&
        p.assetType !== 'STOCK' &&
        p.ticker === newItem.ticker &&
        p.type === newItem.type &&
        p.direction === newItem.direction &&
        parseFloat(p.strike) === parseFloat(newItem.strike) &&
        p.expiration === newItem.expiration
      );

      let op;
      if (duplicate) {
        const oldContracts = parseInt(duplicate.contracts) || 1;
        const addContracts = parseInt(newItem.contracts) || 1;
        const totalContracts = oldContracts + addContracts;
        const newAvgPrice = ((parseFloat(duplicate.entryPrice) || 0) * oldContracts + (parseFloat(newItem.entryPrice) || 0) * addContracts) / totalContracts;
        const mergeEntry = { date: today, action: '增持', contracts: addContracts, price: parseFloat(newItem.entryPrice) || 0, avgAfter: parseFloat(newAvgPrice.toFixed(4)), prevEntryPrice: parseFloat(duplicate.entryPrice) || 0, prevContracts: oldContracts };
        op = updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', duplicate.id), {
          contracts: totalContracts,
          entryPrice: parseFloat(newAvgPrice.toFixed(4)),
          history: [mergeEntry, ...(duplicate.history || [])],
        });
      } else {
        op = formData.id
          ? updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, colName, formData.id), newItem)
          : addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, colName), newItem);
      }

      await Promise.race([op, timeout]);
      closeModal();
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
        } catch (e) {
          setConfirmModal({ isOpen: false, title: '', content: '', onConfirm: () => {} });
          setMessageModal({ isOpen: true, title: '删除失败', content: `❌ 错误信息: ${e.message}`, type: 'error' });
        }
      }
    });
  };

  const handlePositionSelect = (posId) => {
    const pos = positions.find(p => p.id === posId);
    if (!pos || pos.assetType === 'STOCK') return; // planner only operates on options
    setFormData(prev => ({ ...prev, selectedPositionId: posId, ticker: pos.ticker, type: pos.type, direction: pos.direction, strike: pos.strike, expiration: pos.expiration, newStrike: pos.strike, newExpirationPeriod: '' }));
  };

  const handleDirectAction = (position, actionCategory) => {
    setExecutionPlan({ ...position, actionCategory, selectedPositionId: position.id, isDirect: true, newStrike: position.strike, newExpirationPeriod: '' });
  };

  const handleReopen = async (position) => {
    const today = getLocalTodayString();
    try {
      await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', position.id), {
        status: 'OPEN',
        closePrice: null,
        dateClosed: null,
        history: [{ date: today, action: 'REOPEN', notes: '重新开仓' }, ...(position.history || [])],
      });
    } catch (e) {
      console.error('Failed to reopen position:', e);
    }
  };

  const handleExecutionConfirm = async (plan, execData) => {
    const today = getLocalTodayString();
    setIsExecuting(true);
    try {
      if (plan.actionCategory === 'OPEN') {
        await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'positions'), { status: 'OPEN', ticker: plan.ticker, type: plan.type, direction: plan.direction, strike: parseFloat(execData.strike), expiration: execData.expiration, entryPrice: parseFloat(execData.price), rollCredit: 0, history: [], dateOpened: today });
      } else if (plan.actionCategory === 'CLOSE') {
        const pos = positions.find(p => p.id === plan.selectedPositionId);
        if (pos) {
          const closePrice = parseFloat(execData.price);
          const totalContracts = parseInt(pos.contracts) || 1;
          const contractsToClose = pos.assetType === 'STOCK' ? totalContracts : Math.min(totalContracts, Math.max(1, parseInt(execData.contractsToClose) || totalContracts));
          const remainingContracts = totalContracts - contractsToClose;
          if (remainingContracts > 0) {
            // Partial close: reduce contracts, keep OPEN
            const realizedPnL = calcFinalPnL(pos.direction, calcNetBasis(pos.entryPrice, pos.rollCredit, contractsToClose), closePrice, contractsToClose);
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', pos.id), {
              contracts: remainingContracts,
              history: [{ date: today, action: 'PARTIAL_CLOSE', contractsClosed: contractsToClose, closePrice, realizedPnL }, ...(pos.history || [])],
            });
          } else {
            // Full close
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', pos.id), { status: 'CLOSED', closePrice, dateClosed: today, history: [{ date: today, action: 'CLOSE', closePrice, notes: 'Closed' }, ...(pos.history || [])] });
          }
        }
      } else if (plan.actionCategory === 'ROLL') {
        const pos = positions.find(p => p.id === plan.selectedPositionId);
        if (pos) {
          const rollInputPrice = parseFloat(execData.price) || 0;
          const basisAdj = pos.direction === 'SELL' ? -1 * rollInputPrice : rollInputPrice;
          await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', pos.id), { strike: parseFloat(execData.strike), expiration: execData.expiration, rollCredit: (parseFloat(pos.rollCredit) || 0) + basisAdj, history: [{ date: today, action: 'ROLL', oldStrike: pos.strike, oldExpiration: pos.expiration, rollPrice: rollInputPrice, snapshotEntryPrice: pos.entryPrice, newStrike: parseFloat(execData.strike), newExpiration: execData.expiration }, ...(pos.history || [])] });
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


  if (!user) return <LoginScreen onLogin={handleGoogleLogin} loading={isLoggingIn} error={loginError} />;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      <div className="sticky top-0 z-10">
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
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
        {activeTab !== 'settings' && (
          <>
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <div className="max-w-4xl mx-auto px-4 hidden sm:flex gap-4">
              <button onClick={() => setActiveTab('portfolio')} className={`pb-3 pt-2 px-2 font-medium text-sm transition-all relative shrink-0 whitespace-nowrap ${activeTab === 'portfolio' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
                持仓监控 (Portfolio){activeTab === 'portfolio' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
              </button>
              <button onClick={() => setActiveTab('opportunities')} className={`pb-3 pt-2 px-2 font-medium text-sm transition-all relative shrink-0 whitespace-nowrap ${activeTab === 'opportunities' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
                策略机会 (Strategy){activeTab === 'opportunities' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
              </button>
              <button onClick={() => setActiveTab('monitor')} className={`pb-3 pt-2 px-2 font-medium text-sm transition-all relative shrink-0 whitespace-nowrap ${activeTab === 'monitor' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
                行情扫描 (Monitor){activeTab === 'monitor' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
              </button>
              <button onClick={() => setActiveTab('planner')} className={`pb-3 pt-2 px-2 font-medium text-sm transition-all relative shrink-0 whitespace-nowrap flex items-center gap-2 ${activeTab === 'planner' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
                交易备忘 (Planner){todaysPlanCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">{todaysPlanCount}</span>}
                {activeTab === 'planner' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
              </button>
            </div>
          </div>
          {/* 手机 tab 栏 */}
          <div className="sm:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <div className="max-w-4xl mx-auto px-4 flex items-center relative">
              <button onClick={() => setActiveTab('portfolio')} className={`pb-3 pt-2 px-2 font-medium text-sm transition-all relative shrink-0 whitespace-nowrap ${activeTab === 'portfolio' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>
                持仓监控 (Portfolio){activeTab === 'portfolio' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
              </button>
              <button onClick={() => setActiveTab('opportunities')} className={`pb-3 pt-2 px-2 font-medium text-sm transition-all relative shrink-0 whitespace-nowrap ${activeTab === 'opportunities' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>
                策略机会 (Strategy){activeTab === 'opportunities' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
              </button>
              <div className="ml-auto relative" ref={mobileMenuRef}>
                <button onClick={() => setMobileMenuOpen(v => !v)} className={`pb-3 pt-2 px-2 flex items-center gap-1 text-sm transition-all relative ${['monitor','planner'].includes(activeTab) ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>
                  <Menu size={16} />
                  {todaysPlanCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1 py-0.5 rounded-full font-bold animate-pulse">{todaysPlanCount}</span>}
                  {['monitor','planner'].includes(activeTab) && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
                </button>
                {mobileMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 min-w-[140px]">
                    <button onClick={() => { setActiveTab('monitor'); setMobileMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm rounded-t-xl transition-colors ${activeTab === 'monitor' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                      行情扫描 (Monitor)
                    </button>
                    <button onClick={() => { setActiveTab('planner'); setMobileMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm rounded-b-xl transition-colors flex items-center gap-2 ${activeTab === 'planner' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                      交易备忘 (Planner){todaysPlanCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">{todaysPlanCount}</span>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          </>
        )}
      </div>

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

            <div className={activeTab === 'monitor' ? '' : 'hidden'}>
              <MonitorTab user={user} db={db} functions={functions} />
            </div>
            {activeTab === 'opportunities' && (
              <StrategyTab
                positions={positions}
                user={user}
                deltaMap={deltaMap}
                deltaLoading={deltaLoading}
                fetchDeltas={fetchDeltas}
                onOpenAddModal={(group) => {
                  setFormData(() => ({
                    ...EMPTY_FORM(),
                    ticker: group.ticker,
                    type: 'CALL',
                    direction: 'SELL',
                    leapsId: group.leapsId || null,
                  }));
                  setActiveTab('portfolio');
                  setShowAddModal(true);
                }}
                onDirectAction={handleDirectAction}
                onReopen={handleReopen}
              />
            )}
            {activeTab !== 'monitor' && activeTab !== 'opportunities' && (
              <>
            <div className="flex justify-between items-center mb-6 gap-3">
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-slate-800 dark:text-white">{activeTab === 'portfolio' ? '当前持仓' : '操作计划'}</div>
                <div className="text-xs text-slate-400">{activeTab === 'portfolio' ? 'Open Positions' : 'Planner'}</div>
              </div>
              <div className="flex gap-2 shrink-0"><Button onClick={() => setShowAddModal(true)}><Plus size={18} /><span className="whitespace-nowrap">{activeTab === 'portfolio' ? '记录持仓' : '新增备忘'}</span></Button></div>
            </div>

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
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                  <span className="text-slate-400 font-medium">排序:</span>
                  {[{ key: 'ticker', label: '名称' }, { key: 'days', label: '剩余天数' }].map(({ key, label }) => {
                    const disabled = showAggregated && key === 'days';
                    return (
                      <button key={key} disabled={disabled} onClick={() => handleSort(key)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-colors ${disabled ? 'border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed' : sortConfig.key === key ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300'}`}>
                        {label}
                        {!disabled && sortConfig.key === key && <ChevronUp size={12} className={sortConfig.direction === 'desc' ? 'rotate-180 transition-transform' : 'transition-transform'} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Short Put risk panel */}
            {activeTab === 'portfolio' && (() => {
              const shortPuts = positions.filter(p => p.type === 'PUT' && p.direction === 'SELL' && p.status !== 'CLOSED' && !isExpired(p.expiration));
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
              const closedPositions = positions.filter(p =>
                p.assetType === 'STOCK' ? p.status === 'CLOSED' : (p.status === 'CLOSED' || isExpired(p.expiration))
              );
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
                      {[...closedPositions].sort((a, b) => a.ticker.localeCompare(b.ticker)).map(p => {
                        const pnl = calculateFinalPnL(p) || 0;
                        const isPos = pnl >= 0;
                        const isExpired = p.status !== 'CLOSED' && isExpired(p.expiration);
                        return (
                          <div key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-slate-700 dark:text-slate-200 w-16">{p.ticker}</span>
                              {p.assetType === 'STOCK'
                                ? <span className="text-slate-500 dark:text-slate-400">STOCK</span>
                                : <span className="text-slate-500 dark:text-slate-400">${parseFloat(p.strike).toFixed(0)} {p.type} {p.expiration}</span>}
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


            {/* Position list */}
            <div className="grid gap-4">
              {(() => {
                const baseList = activeTab === 'portfolio'
                  ? positions.filter(p => {
                      if (searchTicker && !p.ticker?.toUpperCase().includes(searchTicker)) return false;
                      if (filterStatus !== 'ALL') {
                        const isClosed = p.assetType === 'STOCK'
                          ? p.status === 'CLOSED'
                          : p.status === 'CLOSED' || isExpired(p.expiration);
                        if (filterStatus === 'OPEN' && isClosed) return false;
                        if (filterStatus === 'CLOSED' && !isClosed) return false;
                      }
                      // STOCK positions have no type/direction — skip these filters
                      if (p.assetType !== 'STOCK') {
                        if (filterType !== 'ALL' && p.type !== filterType) return false;
                        if (filterDir !== 'ALL' && p.direction !== filterDir) return false;
                      }
                      return true;
                    })
                  : plans;
                if (baseList.length === 0) return <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700"><p>{searchTicker || filterStatus !== 'ALL' || filterType !== 'ALL' || filterDir !== 'ALL' ? '没有符合筛选条件的记录' : '暂无记录'}</p></div>;

                if (showAggregated && activeTab === 'portfolio') {
                  const aggDir = sortConfig.key === 'ticker' && sortConfig.direction === 'desc' ? -1 : 1;
                  const aggregated = aggregateByTicker(baseList)
                    .sort((a, b) => a.ticker.localeCompare(b.ticker) * aggDir);
                  return aggregated.map(agg => (
                    <div key={agg.ticker}>
                      <button onClick={() => setExpandedTickers(prev => new Set(prev.has(agg.ticker) ? [...prev].filter(t => t !== agg.ticker) : [...prev, agg.ticker]))} className="w-full text-left p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <ChevronUp size={14} className={`text-slate-400 transition-transform ${expandedTickers.has(agg.ticker) ? '' : 'rotate-180'}`} />
                            <span className="font-bold text-lg text-slate-800 dark:text-white">{agg.ticker}</span>
                            {agg.openCount > 0 && (
                              <span className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full">{agg.openCount} 开仓</span>
                            )}
                            {agg.openCount < agg.itemCount && (
                              <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full">{agg.itemCount - agg.openCount} 已平</span>
                            )}
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
                          {agg.items.sort((a, b) => {
                              const aClosed = a.status === 'CLOSED';
                              const bClosed = b.status === 'CLOSED';
                              if (aClosed !== bClosed) return aClosed ? 1 : -1;
                              return (a.expiration || '').localeCompare(b.expiration || '');
                            }).map(item => {
                            const concentration = item.type === 'PUT' && item.direction === 'SELL' ? getTickerConcentration(item.ticker) : 0;
                            return (
                              <ItemCard key={item.id} item={item} type={activeTab} onEdit={openEdit} onDelete={deleteItem} onExecute={() => setExecutionPlan(item)} onDirectAction={handleDirectAction} onReopen={handleReopen} onStockTrade={setStockTradePosition} concentration={concentration} strategyTag={getStrategyTag(item)} delta={deltaMap[item.id] ?? null} />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ));
                }

                const sortFn = (a, b) => {
                  if (activeTab !== 'portfolio') return (b.actionDate || '').localeCompare(a.actionDate || '');
                  const dir = sortConfig.direction === 'asc' ? 1 : -1;
                  if (sortConfig.key === 'ticker') return (a.ticker || '').localeCompare(b.ticker || '') * dir;
                  if (sortConfig.key === 'days') {
                    const getDays = (item) => calculateDTE(item.expiration) ?? Infinity;
                    return (getDays(a) - getDays(b)) * dir;
                  }
                  return (b.dateOpened || '').localeCompare(a.dateOpened || '') * dir;
                };
                const renderCard = (item) => {
                  const concentration = item.type === 'PUT' && item.direction === 'SELL' ? getTickerConcentration(item.ticker) : 0;
                  return (
                    <ItemCard
                      key={item.id} item={item} type={activeTab} onEdit={openEdit} onDelete={deleteItem}
                      onExecute={() => setExecutionPlan(item)}
                      onDirectAction={handleDirectAction}
                      onReopen={handleReopen}
                      onStockTrade={setStockTradePosition}
                      concentration={concentration}
                      strategyTag={getStrategyTag(item)}
                      delta={deltaMap[item.id] ?? null}
                    />
                  );
                };

                // In portfolio tab with ALL filter: split open vs closed, show closed collapsed at bottom
                if (activeTab === 'portfolio' && filterStatus === 'ALL') {
                  const isItemClosed = (p) => p.assetType === 'STOCK' ? p.status === 'CLOSED' : p.status === 'CLOSED' || isExpired(p.expiration);
                  const openItems = baseList.filter(p => !isItemClosed(p)).sort(sortFn);
                  const closedItems = baseList.filter(p => isItemClosed(p)).sort(sortFn);
                  return (
                    <>
                      {openItems.map(renderCard)}
                      {closedItems.length > 0 && (
                        <div className="mt-2">
                          <button
                            onClick={() => setIsClosedExpanded(v => !v)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          >
                            <ChevronUp size={14} className={`transition-transform ${isClosedExpanded ? '' : 'rotate-180'}`} />
                            <span>已平仓 / 已过期 ({closedItems.length})</span>
                          </button>
                          {isClosedExpanded && (
                            <div className="mt-2 space-y-2">
                              {closedItems.map(renderCard)}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                }

                return baseList.sort(sortFn).map(renderCard);
              })()}
            </div>
            </>
            )}
          </>
        )}
      </main>

      {showAddModal && <AddEditModal formData={formData} setFormData={setFormData} onSubmit={handleSubmit} onClose={closeModal} activeTab={activeTab} positions={positions} onSelectPos={handlePositionSelect} isSaving={isSaving} />}
      {executionPlan && <ExecutionModal plan={executionPlan} onClose={() => setExecutionPlan(null)} onConfirm={handleExecutionConfirm} isLoading={isExecuting} />}
      {stockTradePosition && <StockTradeModal position={stockTradePosition} onClose={() => setStockTradePosition(null)} onConfirm={(action, shares, price, date, notes) => handleStockTrade(stockTradePosition, action, shares, price, date, notes)} />}
      <MessageModal isOpen={messageModal.isOpen} title={messageModal.title} content={messageModal.content} type={messageModal.type} variant={messageModal.variant} onClose={() => setMessageModal({ ...messageModal, isOpen: false })} />
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} content={confirmModal.content} loading={isMigrating} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
    </div>
  );
}
