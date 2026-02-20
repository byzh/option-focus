import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Calendar, TrendingUp, Mail, Edit3, CheckCircle, AlertCircle,
  Settings, Loader2, X, RefreshCw, Key, List, ArrowRight, History,
  CheckSquare, ChevronUp, AlertTriangle, HelpCircle, ScanSearch, Archive,
  Cloud, CloudUpload, StopCircle, Info, Database, LogIn, LogOut, Code
} from 'lucide-react';

// --- Firebase Imports ---
// --- Firebase Imports ---
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query
} from 'firebase/firestore';

// ... (omitted config constants) ...

// ==================================================================================
// 🔧 必填配置区域 (CONFIGURATION AREA)
// 请在项目根目录创建 .env.local 文件并填入以下配置
// ==================================================================================

// --- Initialization Logic ---
let app = null;
let auth = null;
let db = null;
let analytics = null;
let initError = null;

const getFirebaseConfig = () => {
  // 1. 优先尝试读取 Vite 环境变量 (本地开发/Vercel)
  try {
    if (import.meta && import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) {
      return {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
        measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
      };
    }
  } catch (e) { }

  // 2. 最后尝试全局变量 (Canvas 预览环境)
  if (typeof __firebase_config !== 'undefined') {
    try { return JSON.parse(__firebase_config); } catch (e) { }
  }

  return null;
};

// 尝试初始化
try {
  const config = getFirebaseConfig();
  if (config) {
    // Avoid re-initialization error in HMR
    if (getApps().length === 0) {
      app = initializeApp(config);
    } else {
      app = getApp(); // Use existing default app
    }

    auth = getAuth(app);
    db = getFirestore(app);
    if (typeof window !== 'undefined') {
      analytics = getAnalytics(app);
    }
  }
} catch (e) {
  initError = e.message;
  console.error("Firebase Init Failed:", e);
}

// Fixed App ID for Firestore path
const APP_ID = 'option-focus-v2';

const getLocalTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isExpiredByTwoDays = (expirationDate) => {
  if (!expirationDate) return false;
  const exp = new Date(expirationDate);
  const now = new Date();
  exp.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffTime = now - exp;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 2;
};

// --- UI Components ---
const Card = ({ children, className = "" }) => (
  <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 ${className}`}>{children}</div>
);

const Button = ({ children, onClick, variant = "primary", className = "", type = "button", disabled = false }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95";
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500",
    secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 focus:ring-slate-500",
    danger: "bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400 focus:ring-red-500",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500",
    warning: "bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500",
    calendar: "bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500"
  };
  return <button type={type} onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`}>{children}</button>;
};

const Input = ({ label, type = "text", value, onChange, placeholder, required = false, step, readOnly = false, className = "" }) => (
  <div className="flex flex-col gap-1 w-full">
    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label} {required && !readOnly && <span className="text-red-500">*</span>}</label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      step={step}
      required={required}
      readOnly={readOnly}
      placeholder={placeholder}
      className={`w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all ${type === 'date' ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600' : ''} ${readOnly ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed' : ''} ${className}`}
    />
  </div>
);

const Select = ({ label, value, onChange, options, required = false }) => (
  <div className="flex flex-col gap-1 w-full">
    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label} {required && <span className="text-red-500">*</span>}</label>
    <select value={value} onChange={onChange} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600">
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

// --- Modal Components ---
const MessageModal = ({ isOpen, title, content, onClose, type = 'info' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <Card className="w-full max-w-sm p-6 relative">
        <h3 className={`text-lg font-bold mb-2 flex items-center gap-2 ${type === 'error' ? 'text-red-600' : 'text-slate-800 dark:text-white'}`}>
          {type === 'error' ? <AlertCircle size={24} /> : <Info size={24} />}
          {title}
        </h3>
        <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm whitespace-pre-wrap">{content}</p>
        <Button onClick={onClose} variant="secondary" className="w-full">关闭</Button>
      </Card>
    </div>
  );
};

const ConfirmModal = ({ isOpen, title, content, onConfirm, onCancel, loading }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <Card className="w-full max-w-sm p-6 relative">
        <h3 className="text-lg font-bold mb-2 text-slate-800 dark:text-white flex items-center gap-2">
          <HelpCircle size={24} className="text-blue-500" />
          {title}
        </h3>
        <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm">{content}</p>
        <div className="flex gap-3">
          <Button onClick={onCancel} variant="secondary" className="flex-1" disabled={loading}>取消</Button>
          <Button onClick={onConfirm} variant="primary" className="flex-1" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : '确定'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

// --- Config Missing Screen ---
const ConfigScreen = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
    <Card className="w-full max-w-md p-8 text-center">
      <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
        <Code size={32} />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">配置 Firebase</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">
        检测到缺少 Firebase 配置，无法连接云端数据库。
      </p>

      <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg text-left text-xs mb-6 border border-amber-100 dark:border-amber-800">
        <p className="font-bold text-amber-700 dark:text-amber-400 mb-2">如何修复：</p>
        <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-300">
          <li>在项目根目录创建 <b>.env.local</b> 文件</li>
          <li>填入正确格式的 Firebase 配置 (VITE_FIREBASE_API_KEY=...)</li>
          <li>如果是 Vercel 部署，请在 Vercel 后台添加环境变量</li>
          <li>配置完成后，请重启开发服务器</li>
        </ol>
      </div>

      <Button onClick={() => window.location.reload()} variant="secondary" className="w-full mt-3">刷新页面</Button>
    </Card>
  </div>
);

const ErrorScreen = ({ error }) => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
    <Card className="w-full max-w-md p-8 text-center border-red-200 dark:border-red-900">
      <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 text-red-600">
        <AlertTriangle size={32} />
      </div>
      <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">初始化失败</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-4 text-sm">
        Firebase 配置似乎有误，导致应用无法启动。
      </p>
      <div className="bg-red-50 dark:bg-red-900/10 p-3 rounded text-xs font-mono text-red-600 mb-6 break-all">
        Error: {error}
      </div>
      <Button onClick={() => window.location.reload()} variant="secondary" className="w-full">重试</Button>
    </Card>
  </div>
);

// --- Execution Confirmation Modal ---
const ExecutionModal = ({ plan, onClose, onConfirm }) => {
  const [execData, setExecData] = useState({
    price: '', // Single price input
    strike: plan.newStrike || plan.strike,
    expiration: plan.newExpirationPeriod || plan.expiration
  });
  const [validationError, setValidationError] = useState('');

  const isRoll = plan.actionCategory === 'ROLL';
  const isClose = plan.actionCategory === 'CLOSE';
  const isDirect = plan.isDirect;

  const handleConfirm = () => {
    // Validate price input
    const priceStr = String(execData.price || '').trim();
    if (!priceStr) {
      setValidationError('请输入价格');
      return;
    }

    const priceNum = parseFloat(priceStr);
    if (isNaN(priceNum)) {
      setValidationError('价格必须是有效的数字');
      return;
    }

    // Validate strike and expiration for non-close actions
    if (!isClose) {
      const strikeStr = String(execData.strike || '').trim();
      const expirationStr = String(execData.expiration || '').trim();

      if (!strikeStr) {
        setValidationError('请输入行权价');
        return;
      }
      if (!expirationStr) {
        setValidationError('请选择到期日');
        return;
      }
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
              {plan.actionCategory === 'ROLL' ? '滚仓' : plan.actionCategory === 'CLOSE' ? '平仓' : '开仓'} {plan.ticker}
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
            ) : (
              <Input
                label={isClose ? "平仓价格 (Close Price)" : "开仓价格 (Open Price)"}
                type="number" step="0.01"
                value={execData.price}
                onChange={e => setExecData({ ...execData, price: e.target.value })}
                placeholder="2.50"
                required
              />
            )}

            {/* Details Input */}
            {!isClose && (
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
            <Button variant="secondary" onClick={onClose} className="flex-1">取消</Button>
            <Button variant="success" onClick={handleConfirm} className="flex-1">确认并执行</Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

// --- Login Screen ---
const LoginScreen = ({ onLogin, loading, error }) => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
    <Card className="w-full max-w-sm p-8 text-center shadow-xl">
      <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-6 text-blue-600 dark:text-blue-400">
        <TrendingUp size={32} />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">OptionFocus <span className="text-xs font-normal opacity-70">v2</span></h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8 text-sm">
        Sign in to sync your data across devices
      </p>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 text-xs p-3 rounded-lg mb-4 text-left">
          {error}
        </div>
      )}

      <Button onClick={onLogin} disabled={loading} className="w-full flex items-center justify-center gap-3 py-3 !bg-white !text-slate-700 border border-slate-300 hover:!bg-slate-50 dark:!bg-slate-700 dark:!text-white dark:border-slate-600 shadow-sm">
        {loading ? <Loader2 className="animate-spin" /> : (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        )}
        Sign in with Google
      </Button>
    </Card>
  </div>
);

// --- Main App ---
export default function App() {
  if (initError) return <ErrorScreen error={initError} />;
  if (!app) return <ConfigScreen />;

  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('portfolio');
  const [showAddModal, setShowAddModal] = useState(false);

  const [positions, setPositions] = useState([]);
  const [plans, setPlans] = useState([]);

  const [executionPlan, setExecutionPlan] = useState(null);
  const [expandedHistories, setExpandedHistories] = useState({});
  const [isMigrating, setIsMigrating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [messageModal, setMessageModal] = useState({ isOpen: false, title: '', content: '', type: 'info' });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', content: '', onConfirm: () => { } });

  const [formData, setFormData] = useState({ id: null, ticker: '', type: 'CALL', direction: 'BUY', actionCategory: 'OPEN', strike: '', expiration: getLocalTodayString(), newStrike: '', newExpirationPeriod: '', entryPrice: '', rollCredit: '0', selectedPositionId: '', actionDate: getLocalTodayString(), notes: '' });

  // Auth
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState(null);

  // Auth State Listener
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setIsLoggingIn(false);
    });
  }, []);

  const handleGoogleLogin = async () => {
    if (!auth) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Failed:", error);
      setLoginError(error.message);
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setPositions([]);
      setPlans([]);
    } catch (error) {
      console.error("Logout Failed:", error);
    }
  };

  // Firestore Sync
  useEffect(() => {
    if (!user || !db) return;
    const unsubPos = onSnapshot(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'positions'), (s) => setPositions(s.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
    const unsubPlans = onSnapshot(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'plans'), (s) => setPlans(s.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
    return () => { unsubPos(); unsubPlans(); };
  }, [user]);

  // Migration Logic
  const checkMigrationEligibility = () => {
    if (!user) {
      setMessageModal({ isOpen: true, title: '未连接', content: "⚠️ 尚未连接到云端，请等待右上角显示'云端已连接'后再试。", type: 'error' });
      return;
    }

    const rawPos = localStorage.getItem('opt_positions');
    const rawPlans = localStorage.getItem('opt_plans');

    if (!rawPos && !rawPlans) {
      setMessageModal({ isOpen: true, title: '无数据', content: "本地存储中没有找到历史数据。", type: 'info' });
      return;
    }

    const localPositions = rawPos ? JSON.parse(rawPos) : [];
    const localPlans = rawPlans ? JSON.parse(rawPlans) : [];

    if (localPositions.length === 0 && localPlans.length === 0) {
      setMessageModal({ isOpen: true, title: '无数据', content: "本地存储数据为空。", type: 'info' });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: '确认迁移',
      content: `检测到本地有 ${localPositions.length} 条持仓和 ${localPlans.length} 条备忘。确定要上传到云端吗？`,
      onConfirm: () => performMigration(localPositions, localPlans)
    });
  };

  const performMigration = async (localPositions, localPlans) => {
    setIsMigrating(true);
    try {
      const posPromises = localPositions.map(p => {
        const cleanP = { ...p, history: p.history || [] };
        if (p.id) delete cleanP.id;
        return addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'positions'), cleanP);
      });
      const planPromises = localPlans.map(p => {
        const cleanP = { ...p };
        if (p.id) delete cleanP.id;
        return addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'plans'), cleanP);
      });
      await Promise.all([...posPromises, ...planPromises]);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
      setMessageModal({ isOpen: true, title: '迁移成功', content: `✅ 成功导入了 ${localPositions.length + localPlans.length} 条数据！`, type: 'info' });
    } catch (e) {
      setMessageModal({ isOpen: true, title: '迁移失败', content: `❌ 错误信息: ${e.message}`, type: 'error' });
    } finally { setIsMigrating(false); }
  };

  const calculateNetBasis = (pos) => ((parseFloat(pos.entryPrice) || 0) + (parseFloat(pos.rollCredit) || 0)) * 100;
  const calculateFinalPnL = (pos) => {
    let closePrice = 0;
    if (pos.status === 'CLOSED') closePrice = parseFloat(pos.closePrice) || 0;
    else if (isExpiredByTwoDays(pos.expiration)) closePrice = 0;
    else return null;
    const netBasisPerShare = calculateNetBasis(pos) / 100;
    return pos.direction === 'SELL' ? (netBasisPerShare - closePrice) * 100 : (closePrice - netBasisPerShare) * 100;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setMessageModal({ isOpen: true, title: '未连接', content: "⚠️ 尚未连接到云端，无法保存。", type: 'error' });
      return;
    }
    const colName = activeTab === 'portfolio' ? 'positions' : 'plans';
    const newItem = { ...formData, entryPrice: parseFloat(formData.entryPrice) || 0, rollCredit: parseFloat(formData.rollCredit) || 0, strike: parseFloat(formData.strike) || 0, newStrike: parseFloat(formData.newStrike) || 0, status: formData.id ? undefined : 'OPEN', history: formData.id ? undefined : [], dateOpened: formData.id ? undefined : getLocalTodayString() };
    Object.keys(newItem).forEach(key => newItem[key] === undefined && delete newItem[key]);
    delete newItem.id;

    setIsSaving(true);
    try {
      // Create a timeout promise (e.g., 5 seconds)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out. Please check your network connection.")), 10000)
      );

      const dbOperation = formData.id
        ? updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, colName, formData.id), newItem)
        : addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, colName), newItem);

      await Promise.race([dbOperation, timeoutPromise]);

      closeModal();
    } catch (e) {
      setMessageModal({
        isOpen: true,
        title: '保存失败 (Save Failed)',
        content: `❌ 操作超时或失败。\n错误信息: ${e.message}`,
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteItem = async (id, listType) => {
    setConfirmModal({
      isOpen: true,
      title: '确认删除',
      content: '确定要删除这条记录吗？此操作无法撤销。',
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
    if (pos) setFormData(prev => ({ ...prev, selectedPositionId: posId, ticker: pos.ticker, type: pos.type, direction: pos.direction, strike: pos.strike, expiration: pos.expiration, newStrike: pos.strike, newExpirationPeriod: '' }));
  };

  const handleDirectAction = (position, actionCategory) => {
    setExecutionPlan({ ...position, actionCategory, selectedPositionId: position.id, isDirect: true, newStrike: position.strike, newExpirationPeriod: '' });
  };

  const handleExecutionConfirm = async (plan, execData) => {
    const today = getLocalTodayString();
    try {
      if (plan.actionCategory === 'OPEN') {
        const newPosData = { status: 'OPEN', ticker: plan.ticker, type: plan.type, direction: plan.direction, strike: parseFloat(execData.strike), expiration: execData.expiration, entryPrice: parseFloat(execData.price), rollCredit: 0, history: [], dateOpened: today };
        await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'positions'), newPosData);
      } else if (plan.actionCategory === 'CLOSE') {
        const pos = positions.find(p => p.id === plan.selectedPositionId);
        if (pos) {
          const closePrice = parseFloat(execData.price);
          await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', pos.id), { status: 'CLOSED', closePrice, dateClosed: today, history: [{ date: today, action: 'CLOSE', closePrice, notes: 'Closed' }, ...(pos.history || [])] });
          const netBasis = calculateNetBasis(pos) / 100;
          const pnl = pos.direction === 'SELL' ? (netBasis - closePrice) * 100 : (closePrice - netBasis) * 100;
          setMessageModal({ isOpen: true, title: '平仓成功', content: `已平仓 ${pos.ticker}。\n最终盈亏: $${pnl.toFixed(2)}`, type: 'info' });
        }
      } else if (plan.actionCategory === 'ROLL') {
        const pos = positions.find(p => p.id === plan.selectedPositionId);
        if (pos) {
          const rollInputPrice = parseFloat(execData.price) || 0;
          const basisAdj = pos.direction === 'SELL' ? -1 * rollInputPrice : rollInputPrice;
          await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', pos.id), {
            strike: parseFloat(execData.strike), expiration: execData.expiration, rollCredit: (parseFloat(pos.rollCredit) || 0) + basisAdj,
            history: [{ date: today, action: 'ROLL', oldStrike: pos.strike, oldExpiration: pos.expiration, rollPrice: rollInputPrice, snapshotEntryPrice: pos.entryPrice, newStrike: parseFloat(execData.strike), newExpiration: execData.expiration }, ...(pos.history || [])]
          });
        }
      }
      if (!plan.isDirect && plan.id) await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'plans', plan.id));
      setExecutionPlan(null);
    } catch (e) {
      setMessageModal({
        isOpen: true,
        title: '执行失败',
        content: `❌ 交易执行出错。\n错误信息: ${e.message}`,
        type: 'error'
      });
    }
  };

  const openEdit = (item) => { setFormData({ ...item, id: item.id }); setShowAddModal(true); };
  const closeModal = () => { setShowAddModal(false); setFormData({ id: null, ticker: '', type: 'CALL', direction: 'BUY', actionCategory: 'OPEN', strike: '', expiration: getLocalTodayString(), newStrike: '', newExpirationPeriod: '', entryPrice: '', rollCredit: '0', selectedPositionId: '', actionDate: getLocalTodayString(), notes: '' }); };
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
              <button onClick={() => setActiveTab('portfolio')} className={`pb-3 px-2 font-medium text-sm transition-all relative ${activeTab === 'portfolio' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>持仓监控 (Portfolio){activeTab === 'portfolio' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full"></div>}</button>
              <button onClick={() => setActiveTab('planner')} className={`pb-3 px-2 font-medium text-sm transition-all relative flex items-center gap-2 ${activeTab === 'planner' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>交易备忘 (Planner){todaysPlanCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">{todaysPlanCount}</span>}{activeTab === 'planner' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full"></div>}</button>
            </div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">{activeTab === 'portfolio' ? '当前持仓 (Open Positions)' : '操作计划 (Planner)'}</h2>
              <div className="flex gap-2"><Button onClick={() => setShowAddModal(true)}><Plus size={18} /> {activeTab === 'portfolio' ? '记录持仓' : '新增备忘'}</Button></div>
            </div>
            {activeTab === 'portfolio' && expiredCount > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 flex items-center gap-3 animate-in slide-in-from-top-2">
                <ScanSearch size={24} className="text-red-500" />
                <div><h4 className="font-bold text-red-700 dark:text-red-300">过期扫描报告</h4><p className="text-xs text-red-600 dark:text-red-400">检测到 {expiredCount} 个期权已过期超过2天。系统已按“价值归零”自动计算了最终盈亏。</p></div>
              </div>
            )}
            <div className="grid gap-4">
              {(activeTab === 'portfolio' ? positions : plans).length === 0 && <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700"><p>{!user ? "正在连接云端..." : "暂无记录"}</p></div>}
              {(activeTab === 'portfolio' ? positions : plans).sort((a, b) => (b.dateOpened || b.actionDate || '').localeCompare(a.dateOpened || a.actionDate || '')).map(item => (
                <ItemCard
                  key={item.id} item={item} type={activeTab} onEdit={openEdit} onDelete={deleteItem}
                  onExecute={() => { setExecutionPlan(item); setExecData({ price: '', strike: item.newStrike || item.strike, expiration: item.newExpirationPeriod || item.expiration }); }}
                  onDirectAction={handleDirectAction}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* Popups */}
      {showAddModal && <AddEditModal formData={formData} setFormData={setFormData} onSubmit={handleSubmit} onClose={closeModal} activeTab={activeTab} positions={positions} onSelectPos={handlePositionSelect} isSaving={isSaving} />}
      {executionPlan && <ExecutionModal plan={executionPlan} onClose={() => setExecutionPlan(null)} onConfirm={handleExecutionConfirm} />}
      <MessageModal isOpen={messageModal.isOpen} title={messageModal.title} content={messageModal.content} type={messageModal.type} onClose={() => setMessageModal({ ...messageModal, isOpen: false })} />
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} content={confirmModal.content} loading={isMigrating} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
    </div>
  );
}

// --- Sub-Components ---
function ItemCard({ item, type, onEdit, onDelete, onExecute, onDirectAction }) {
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  if (type === 'portfolio') {
    const netBasis = ((parseFloat(item.entryPrice) || 0) + (parseFloat(item.rollCredit) || 0)) * 100;
    const isClosed = item.status === 'CLOSED';
    const isExpired = !isClosed && isExpiredByTwoDays(item.expiration);

    const daysUntilExpiration = (() => {
      if (isClosed || isExpired || !item.expiration) return null;
      const exp = new Date(item.expiration);
      const now = new Date();
      exp.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    })();
    const isExpiringSoon = daysUntilExpiration !== null && daysUntilExpiration <= 7;
    let finalPnL = null;
    if (isClosed || isExpired) {
      const closeP = isClosed ? (parseFloat(item.closePrice) || 0) : 0;
      const basisPerShare = netBasis / 100;
      finalPnL = item.direction === 'SELL' ? (basisPerShare - closeP) * 100 : (closeP - basisPerShare) * 100;
    }
    const history = [...(item.history || [])];

    // Determine initial strike/expiration from the oldest ROLL record
    let initialStrike = item.strike;
    let initialExpiration = item.expiration;
    const rollHistory = history.filter(h => h.action === 'ROLL');
    if (rollHistory.length > 0) {
      const firstRoll = rollHistory[rollHistory.length - 1];
      if (firstRoll.oldStrike) initialStrike = firstRoll.oldStrike;
      if (firstRoll.oldExpiration) initialExpiration = firstRoll.oldExpiration;
    }

    history.push({
      isInitial: true,
      date: item.dateOpened || 'Initial',
      price: item.entryPrice,
      initialStrike,
      initialExpiration
    });

    return (
      <Card className={`p-4 hover:shadow-md transition-shadow ${isClosed ? 'opacity-75 bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800' : isExpired ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' : ''}`}>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 text-xs font-bold rounded ${item.direction === 'BUY' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'}`}>{item.direction === 'BUY' ? 'LONG' : 'SHORT'}</span>
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{item.ticker}</h3>
              <span className="text-sm text-slate-500 dark:text-slate-400">{item.expiration} ${item.strike} {item.type}</span>
              {isClosed && <span className="bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Archive size={10} /> 已平仓</span>}
              {isExpired && !isClosed && <span className="bg-red-100 text-red-600 text-xs px-2 rounded-full font-bold flex items-center gap-1"><AlertTriangle size={10} /> 已过期</span>}
              {daysUntilExpiration !== null && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${isExpiringSoon ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'}`}>
                  {isExpiringSoon && <AlertTriangle size={10} />} 还剩 {daysUntilExpiration} 天
                </span>
              )}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              初始: ${parseFloat(item.entryPrice).toFixed(2)}
              {parseFloat(item.rollCredit) !== 0 && <span className={item.rollCredit > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}> {item.rollCredit > 0 ? '+' : ''}展期: ${parseFloat(item.rollCredit).toFixed(2)}</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 font-bold uppercase">{isClosed || isExpired ? '最终盈亏 (P&L)' : '总成本 (Net Basis)'}</div>
            <div className={`text-xl font-mono font-bold ${(isClosed || isExpired) ? (finalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : (netBasis >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}`}>
              {(isClosed || isExpired)
                ? `${finalPnL >= 0 ? '+' : '-'}$${Math.abs(finalPnL).toFixed(2)}`
                : `${netBasis >= 0 ? '+' : '-'}$${Math.abs(netBasis).toFixed(0)}`}
            </div>
            <div className="flex gap-1 justify-end mt-1">
              {!isClosed && !isExpired && (
                <>
                  <button onClick={() => onDirectAction(item, 'ROLL')} className="p-1.5 text-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded hover:bg-amber-100" title="滚仓 (Roll)"><RefreshCw size={16} /></button>
                  <button onClick={() => onDirectAction(item, 'CLOSE')} className="p-1.5 text-slate-500 bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200" title="平仓 (Close)"><StopCircle size={16} /></button>
                </>
              )}
              {(history.length > 1 || isClosed) && <button onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} className="p-1.5 text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 rounded hover:bg-indigo-100">{isHistoryExpanded ? <ChevronUp size={16} /> : <History size={16} />}</button>}
              <button onClick={() => onEdit(item)} className="p-1.5 text-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100"><Edit3 size={16} /></button>
              <button onClick={() => onDelete(item.id, 'portfolio')} className="p-1.5 text-rose-500 bg-rose-50 dark:bg-rose-900/20 rounded hover:bg-rose-100"><Trash2 size={16} /></button>
            </div>
          </div>
        </div>

        {isHistoryExpanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-sm">
            <div className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1"><History size={12} /> 交易历史 (Transaction History)</div>
            {history.map((h, idx) => {
              let label = "", val = 0, isCredit = false;
              if (h.isInitial) {
                label = `初始开仓 (Initial Open) $${h.initialStrike} (${h.initialExpiration}) ${item.type}`;
                if (item.direction === 'SELL') { val = -Math.abs(item.entryPrice); isCredit = true; } else { val = Math.abs(item.entryPrice); isCredit = false; }
              } else if (h.action === 'CLOSE') {
                label = '平仓 (Close)';
                val = item.direction === 'SELL' ? Math.abs(h.closePrice) : -Math.abs(h.closePrice); isCredit = val < 0;
              } else if (h.action === 'ROLL') {
                label = `Roll to ${h.newExpiration} $${h.newStrike}`;
                val = h.rollPrice; isCredit = val < 0;
              }
              return (
                <div key={idx} className="flex justify-between py-1 border-b border-dashed border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="text-slate-500 text-xs font-mono w-20">{h.date}</span>
                  <span className="flex-1 truncate px-2 text-slate-600 dark:text-slate-300">{label}</span>
                  <span className={`font-mono ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{val > 0 ? '+' : ''}{val.toFixed(2)}</span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    );
  }
  return (
    <Card className="p-4 hover:shadow-md transition-shadow group">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${item.actionCategory === 'OPEN' ? 'bg-blue-100 text-blue-700' : item.actionCategory === 'CLOSE' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-700'}`}>{item.actionCategory === 'ROLL' ? '滚仓' : item.actionCategory === 'CLOSE' ? '平仓' : '开仓'}</span>
            <span className={`font-bold ${item.direction === 'BUY' ? 'text-emerald-600' : 'text-rose-600'}`}>{item.direction === 'BUY' ? 'LONG' : 'SHORT'}</span>
            <span className="font-bold text-lg text-slate-800 dark:text-slate-100">{item.ticker}</span>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {item.actionCategory === 'ROLL' ? <span>From ${item.strike} <ArrowRight size={12} className="inline" /> To ${item.newStrike} ({item.newExpirationPeriod})</span> : <span>${item.strike} {item.type} ({item.expiration})</span>}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">{item.actionDate}</div>
        </div>
        <div className="flex gap-1">
          <Button variant="success" onClick={onExecute} className="px-3 py-1 text-xs"><CheckSquare size={14} /> 执行</Button>
          <button onClick={() => onDelete(item.id, 'planner')} className="p-2 text-rose-500 hover:bg-rose-50 rounded"><Trash2 size={18} /></button>
        </div>
      </div>
    </Card>
  )
}

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
            <div className="grid grid-cols-2 gap-4">
              <Input label="初始价格 (Entry Price)" type="number" value={formData.entryPrice} onChange={e => update('entryPrice', e.target.value)} required />
              <Input label="展期净利 (Roll Credit)" type="number" value={formData.rollCredit} onChange={e => update('rollCredit', e.target.value)} />
            </div>
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
  )
}