import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Calendar, 
  TrendingUp, 
  Mail, 
  Edit3, 
  CheckCircle, 
  AlertCircle,
  Settings,
  Sparkles,
  Loader2,
  X,
  RefreshCw,
  Key,
  List, 
  ArrowRight,
  History,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  HelpCircle,
  ScanSearch,
  Archive
} from 'lucide-react';

// --- Helper: Date Functions ---
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
  exp.setHours(0,0,0,0);
  now.setHours(0,0,0,0);
  
  const diffTime = now - exp;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 2; 
};

// --- Gemini API Configuration ---
const apiKey = ""; 

const callGeminiAPI = async (prompt, systemInstruction = "", useSearch = false, customKey = "") => {
  const keyToUse = customKey || apiKey;

  if (!keyToUse) {
    throw new Error("MISSING_API_KEY");
  }

  try {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    if (systemInstruction && systemInstruction.trim()) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (useSearch) {
      payload.tools = [{ google_search: {} }];
    } else {
      payload.generationConfig = {
         responseMimeType: "application/json"
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${keyToUse}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (response.status === 401) {
      throw new Error("INVALID_API_KEY");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Gemini API Error Details:", errorData);
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("No content generated");
    }

    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      return JSON.parse(text);
    } catch (e) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.error("Failed to parse extracted JSON:", jsonMatch[0]);
          throw new Error("无法解析 AI 返回的数据格式");
        }
      } else {
        console.error("Raw AI response:", text);
        throw new Error("AI 未返回有效的 JSON 数据");
      }
    }
  } catch (error) {
    if (error.message === "MISSING_API_KEY" || error.message === "INVALID_API_KEY") {
      throw error; 
    }
    console.error("Gemini API Failed:", error);
    throw error;
  }
};

// --- Components ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = "primary", className = "", type="button", disabled=false }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500",
    secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 focus:ring-slate-500",
    danger: "bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400 focus:ring-red-500",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500",
    ai: "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white focus:ring-purple-500 shadow-sm",
    warning: "bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500",
    calendar: "bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500"
  };
  
  return (
    <button 
      type={type} 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({ label, type = "text", value, onChange, placeholder, required = false, step, readOnly = false, className="" }) => (
  <div className="flex flex-col gap-1 w-full">
    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
      {label} {required && !readOnly ? <span className="text-red-500">*</span> : ''}
    </label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      step={step}
      required={required}
      readOnly={readOnly}
      placeholder={placeholder}
      className={`w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all ${readOnly ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed' : ''} ${className}`}
    />
  </div>
);

const Select = ({ label, value, onChange, options, required = false }) => (
  <div className="flex flex-col gap-1 w-full">
    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
      {label} {required ? <span className="text-red-500">*</span> : ''}
    </label>
    <select
      value={value}
      onChange={onChange}
      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all appearance-none"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

// --- AI Analysis Component ---
const AIAnalysisCard = ({ position, onClose, customApiKey, onMissingKey }) => {
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      const prompt = `
        Analyze this option position risk:
        Ticker: ${position.ticker}
        Type: ${position.direction} ${position.type}
        Strike: ${position.strike}
        Expiration: ${position.expiration}
        Cost Basis (Net Credit/Debit): ${position.entryPrice + (position.rollCredit || 0)}
        
        Provide a concise risk analysis (max 3 sentences). Focus on break-even.
        Output JSON only: { "analysis": "text", "suggestion": "text" }
      `;
      try {
        const result = await callGeminiAPI(prompt, "You are an expert options trading risk manager.", false, customApiKey);
        setAnalysis(result);
      } catch (e) {
        if (e.message === "MISSING_API_KEY" || e.message === "INVALID_API_KEY") {
           onMissingKey(); 
           onClose();      
           return;
        }
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalysis();
  }, [position, customApiKey, onMissingKey, onClose]);

  if (!loading && !analysis && !error) return null;

  return (
    <div className="mt-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg p-3 relative animate-in fade-in slide-in-from-top-2">
      <button onClick={onClose} className="absolute top-2 right-2 text-indigo-400 hover:text-indigo-600"><X size={14}/></button>
      <div className="flex items-start gap-3">
        <div className="mt-1 text-indigo-600 dark:text-indigo-400">
           {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
        </div>
        <div className="text-sm text-slate-700 dark:text-slate-300 w-full">
          {loading ? (
            <p>Gemini 正在分析持仓风险...</p>
          ) : error ? (
             <div className="text-red-500">
               <p className="font-bold">分析失败</p>
               <p className="text-xs">{error}</p>
             </div>
          ) : (
            <>
              <p className="font-medium text-indigo-900 dark:text-indigo-200 mb-1">{analysis.analysis}</p>
              <p className="text-slate-500 dark:text-slate-400 text-xs">💡 建议: {analysis.suggestion}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Execution Confirmation Modal ---
const ExecutionModal = ({ plan, positions, onClose, onConfirm }) => {
  const [execData, setExecData] = useState({
    price: '', 
    strike: plan.newStrike || plan.strike,
    expiration: plan.newExpirationPeriod || plan.expiration 
  });

  const isRoll = plan.actionCategory === 'ROLL';
  const isClose = plan.actionCategory === 'CLOSE';

  const handleConfirm = () => {
    onConfirm(plan, execData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <h3 className="text-xl font-bold mb-2 text-slate-800 dark:text-white flex items-center gap-2">
            <CheckSquare size={20} className="text-emerald-500"/> 确认交易执行
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            请输入实际成交的细节，系统将自动更新持仓状态。
          </p>

          <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800 mb-4">
            <div className="text-xs font-bold uppercase text-slate-400 mb-1">Plan</div>
            <div className="font-medium">
              {plan.actionCategory} {plan.ticker}
              {isRoll && ` to ${plan.newStrike} (Exp: ${plan.newExpirationPeriod || '?'})`}
            </div>
          </div>

          <div className="space-y-4">
            {/* --- PRICE INPUT --- */}
            {isRoll ? (
              <div>
                <Input 
                  label="Net Roll Price (净价)" 
                  type="number" step="0.01"
                  value={execData.price}
                  onChange={e => setExecData({...execData, price: e.target.value})}
                  placeholder="-0.50 (Credit) / 0.50 (Debit)"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                  <HelpCircle size={10}/> 负数(-) = Credit (收钱) | 正数(+) = Debit (付钱)
                </p>
              </div>
            ) : (
              <Input 
                label={isClose ? "Closing Price (平仓价)" : "Opening Price (开仓价)"}
                type="number" step="0.01"
                value={execData.price}
                onChange={e => setExecData({...execData, price: e.target.value})}
                placeholder="2.50"
                required
              />
            )}

            {/* --- DETAILS INPUT --- */}
            {!isClose && (
              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="Actual Strike" 
                  type="number" step="0.5"
                  value={execData.strike}
                  onChange={e => setExecData({...execData, strike: e.target.value})}
                  required
                />
                <Input 
                  label="Actual Exp. Date"
                  type="date"
                  value={execData.expiration.includes('-') ? execData.expiration : ''} 
                  onChange={e => setExecData({...execData, expiration: e.target.value})}
                  required
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <Button variant="secondary" onClick={onClose} className="flex-1">取消</Button>
            <Button variant="success" onClick={handleConfirm} className="flex-1">确认并更新持仓</Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

// --- Main Application ---

export default function App() {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [showAddModal, setShowAddModal] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  
  // Data States
  const [positions, setPositions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [analyzingId, setAnalyzingId] = useState(null); 
  
  const [executionPlan, setExecutionPlan] = useState(null); 
  const [expandedHistories, setExpandedHistories] = useState({}); 

  // Form States
  const [formData, setFormData] = useState({
    id: null,
    ticker: '',
    type: 'CALL', 
    direction: 'BUY', 
    actionCategory: 'OPEN', 
    strike: '',
    expiration: getLocalTodayString(),
    newStrike: '',
    newExpirationPeriod: '',
    entryPrice: '', 
    rollCredit: '0',
    selectedPositionId: '',
    actionDate: getLocalTodayString(),
    notes: ''
  });

  // AI Modal State
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState({ ticker: '', outlook: '' });
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  // Load Data
  useEffect(() => {
    const savedPositions = localStorage.getItem('opt_positions');
    const savedPlans = localStorage.getItem('opt_plans');
    const savedEmail = localStorage.getItem('opt_email');
    const savedKey = localStorage.getItem('opt_api_key');
    
    if (savedPositions) setPositions(JSON.parse(savedPositions));
    if (savedPlans) setPlans(JSON.parse(savedPlans));
    if (savedEmail) setUserEmail(savedEmail);
    if (savedKey) setCustomApiKey(savedKey);
  }, []);

  // Save Data
  useEffect(() => {
    localStorage.setItem('opt_positions', JSON.stringify(positions));
  }, [positions]);

  useEffect(() => {
    localStorage.setItem('opt_plans', JSON.stringify(plans));
  }, [plans]);

  useEffect(() => {
    localStorage.setItem('opt_email', userEmail);
  }, [userEmail]);

  useEffect(() => {
    localStorage.setItem('opt_api_key', customApiKey);
  }, [customApiKey]);

  // --- Core Handlers ---

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePositionSelect = (posId) => {
    if (!posId) return;
    const pos = positions.find(p => p.id === posId);
    if (pos) {
      setFormData(prev => ({
        ...prev,
        selectedPositionId: posId,
        ticker: pos.ticker,
        type: pos.type,
        direction: pos.direction,
        strike: pos.strike,
        expiration: pos.expiration,
        newStrike: pos.strike, 
        newExpirationPeriod: ''
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newItem = {
      ...formData,
      id: formData.id || Date.now().toString(),
      entryPrice: parseFloat(formData.entryPrice) || 0,
      rollCredit: parseFloat(formData.rollCredit) || 0,
      strike: parseFloat(formData.strike) || 0,
      newStrike: parseFloat(formData.newStrike) || 0,
      newExpirationPeriod: formData.newExpirationPeriod,
      actionCategory: formData.actionCategory || 'OPEN',
      selectedPositionId: formData.selectedPositionId,
      status: formData.id ? (positions.find(p => p.id === formData.id)?.status || 'OPEN') : 'OPEN',
      history: formData.id ? (positions.find(p => p.id === formData.id)?.history || []) : [],
      dateOpened: formData.id ? (positions.find(p => p.id === formData.id)?.dateOpened || getLocalTodayString()) : getLocalTodayString()
    };

    if (activeTab === 'portfolio') {
      if (formData.id) {
        setPositions(positions.map(p => p.id === formData.id ? newItem : p));
      } else {
        setPositions([...positions, newItem]);
      }
    } else {
      if (formData.id) {
        setPlans(plans.map(p => p.id === formData.id ? newItem : p));
      } else {
        setPlans([...plans, newItem]);
      }
    }
    closeModal();
  };

  const deleteItem = (id, listType) => {
    if (listType === 'portfolio') {
      setPositions(positions.filter(p => p.id !== id));
    } else {
      setPlans(plans.filter(p => p.id !== id));
    }
  };

  const openEdit = (item) => {
    setFormData({ ...item });
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setFormData({
      id: null,
      ticker: '',
      type: 'CALL',
      direction: 'BUY',
      actionCategory: 'OPEN',
      strike: '',
      expiration: getLocalTodayString(),
      newStrike: '',
      newExpirationPeriod: '',
      entryPrice: '',
      rollCredit: '0',
      selectedPositionId: '',
      actionDate: getLocalTodayString(),
      notes: ''
    });
  };

  const toggleHistory = (posId) => {
    setExpandedHistories(prev => ({ ...prev, [posId]: !prev[posId] }));
  };

  // --- Execution Logic ---

  const handleExecutionConfirm = (plan, execData) => {
    const today = getLocalTodayString();

    if (plan.actionCategory === 'OPEN') {
        const newPos = {
            id: Date.now().toString(),
            status: 'OPEN',
            ticker: plan.ticker,
            type: plan.type,
            direction: plan.direction,
            strike: parseFloat(execData.strike),
            expiration: execData.expiration,
            entryPrice: parseFloat(execData.price),
            rollCredit: 0,
            history: [],
            dateOpened: today
        };
        setPositions([...positions, newPos]);
    } 
    else if (plan.actionCategory === 'CLOSE') {
        const pos = positions.find(p => p.id === plan.selectedPositionId);
        if (pos) {
            const closePrice = parseFloat(execData.price);
            
            // Create History Entry for Close
            const historyEntry = {
                date: today,
                action: 'CLOSE',
                closePrice: closePrice,
                notes: 'Closed via Planner'
            };

            const updatedPos = {
                ...pos,
                status: 'CLOSED', // Mark as closed, DO NOT REMOVE
                closePrice: closePrice, // Store final close price
                dateClosed: today,
                history: [historyEntry, ...(pos.history || [])]
            };

            setPositions(positions.map(p => p.id === pos.id ? updatedPos : p));
        }
    } 
    else if (plan.actionCategory === 'ROLL') {
        const pos = positions.find(p => p.id === plan.selectedPositionId);
        if (pos) {
            const rollInputPrice = parseFloat(execData.price) || 0;
            let basisAdjustment = 0;
            
            if (pos.direction === 'SELL') {
                basisAdjustment = -1 * rollInputPrice;
            } else {
                basisAdjustment = rollInputPrice;
            }

            // Create History Entry
            // We store "newStrike" and "newExpiration" in history to say "Roll TO X"
            // The "From" part is implied by being the 'next' item in history (or initial).
            // But user wants explicit "Roll TO" display.
            const historyEntry = {
                date: today,
                action: 'ROLL',
                oldStrike: pos.strike,
                oldExpiration: pos.expiration,
                // New additions for display
                newStrike: parseFloat(execData.strike), 
                newExpiration: execData.expiration,
                
                rollPrice: rollInputPrice,
                snapshotEntryPrice: pos.entryPrice 
            };

            const updatedPos = {
                ...pos,
                strike: parseFloat(execData.strike),
                expiration: execData.expiration,
                rollCredit: (parseFloat(pos.rollCredit) || 0) + basisAdjustment,
                history: [historyEntry, ...(pos.history || [])] 
            };

            setPositions(positions.map(p => p.id === pos.id ? updatedPos : p));
        }
    }

    setPlans(plans.filter(p => p.id !== plan.id));
    setExecutionPlan(null);
  };

  // --- Calculations ---

  const calculateNetBasis = (pos) => {
    const base = parseFloat(pos.entryPrice) || 0;
    const rolls = parseFloat(pos.rollCredit) || 0;
    return (base + rolls) * 100; 
  };

  const calculateFinalPnL = (pos) => {
    let closePrice = 0;
    
    // Determine exit price:
    if (pos.status === 'CLOSED') {
        closePrice = parseFloat(pos.closePrice) || 0;
    } else if (isExpiredByTwoDays(pos.expiration)) {
        closePrice = 0; // Expired worthless
    } else {
        return null; // Active position, no final P&L
    }

    // Single share values
    const netBasisPerShare = calculateNetBasis(pos) / 100; 
    
    let pnl = 0;
    if (pos.direction === 'SELL') {
        // Sold @ Basis, Bought Back @ Close.
        // PnL = (Basis - Close) * 100
        pnl = (netBasisPerShare - closePrice) * 100;
    } else {
        // Bought @ Basis, Sold @ Close.
        // PnL = (Close - Basis) * 100
        pnl = (closePrice - netBasisPerShare) * 100;
    }
    return pnl;
  };

  const promptMissingKey = () => {
    alert("请先在“设置 (Settings)”中配置您的 Gemini API Key 才能使用 AI 功能。\n\n(Key 仅保存在您的本地浏览器中)");
    setActiveTab('settings');
  };

  // --- Gemini Functions ---

  const handleAIFill = async () => {
    if (!customApiKey && !apiKey) {
      promptMissingKey();
      return;
    }

    if (!aiPrompt.ticker || !aiPrompt.outlook) {
      alert("请输入股票代码和您的看法");
      return;
    }
    setIsAiGenerating(true);
    
    const prompt = `
      I want to trade options on ${aiPrompt.ticker}. 
      My outlook is: "${aiPrompt.outlook}".
      
      Suggest a specific option strategy.
      Return JSON only:
      {
        "type": "CALL" or "PUT",
        "direction": "BUY" or "SELL",
        "strike": number (suggest a logical strike price based on outlook),
        "expiration": "YYYY-MM-DD" (suggest a date 2-4 weeks out unless outlook implies otherwise),
        "notes": "Reasoning for this trade..."
      }
    `;

    try {
      const result = await callGeminiAPI(prompt, "You are a helpful options trading assistant. Always return valid JSON.", false, customApiKey);
      
      setFormData(prev => ({
        ...prev,
        ticker: aiPrompt.ticker.toUpperCase(),
        type: result.type,
        direction: result.direction,
        strike: result.strike,
        expiration: result.expiration,
        notes: `[AI Suggestion] ${result.notes}`
      }));
      
      setShowAIModal(false); 
    } catch (error) {
      if (error.message === "MISSING_API_KEY" || error.message === "INVALID_API_KEY") {
         promptMissingKey();
      } else {
         alert(`AI 生成失败: ${error.message}`);
      }
    } finally {
      setIsAiGenerating(false);
    }
  };

  // --- Calendar Integration ---
  
  const addToGoogleCalendar = () => {
    const targetDate = getLocalTodayString();
    const todaysPlans = plans.filter(p => p.actionDate === targetDate);

    if (todaysPlans.length === 0) {
      alert("今天没有预定的操作计划。");
      return;
    }

    const title = `📈 OptionFocus: 交易计划 (${todaysPlans.length} 笔)`;
    let details = `今日 (${targetDate}) 美股开盘操作计划：\n\n`;

    todaysPlans.forEach((plan, index) => {
      let actionPrefix = "";
      if (plan.actionCategory === 'ROLL') actionPrefix = "🔴 展期 (ROLL)";
      else if (plan.actionCategory === 'CLOSE') actionPrefix = "⚫ 平仓 (CLOSE)";
      else actionPrefix = plan.direction === 'BUY' ? "🟢 开仓买入" : "🔴 开仓卖出";

      details += `${index + 1}. ${actionPrefix} ${plan.ticker}\n`;
      if (plan.actionCategory === 'ROLL') {
         details += `   - 原持仓: $${plan.strike} ${plan.type}, 到期: ${plan.expiration}\n`;
         details += `   - 目标: $${plan.newStrike} ${plan.type}, 到期: ${plan.newExpirationPeriod || '未定'}\n`;
      } else {
         details += `   - 目标: $${plan.strike} ${plan.type}, 到期: ${plan.expiration}\n`;
      }
      details += `   - 备注: ${plan.notes || '无'}\n\n`;
    });

    const dateStr = targetDate.replace(/-/g, '');
    const dates = `${dateStr}T093000/${dateStr}T100000`; // 09:30 AM ET
    
    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}&dates=${dates}&ctz=America/New_York`;
    
    window.open(calendarUrl, '_blank');
  };

  // --- Render Helpers ---

  const todaysPlanCount = plans.filter(p => p.actionDate === getLocalTodayString()).length;
  const isKeyMissing = !customApiKey && !apiKey;
  const expiredCount = positions.filter(p => p.status !== 'CLOSED' && isExpiredByTwoDays(p.expiration)).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <TrendingUp size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">OptionFocus <span className="text-xs font-normal opacity-70 ml-1">+ Gemini AI</span></h1>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('settings')}
              className={`p-2 rounded-lg transition-colors relative ${activeTab === 'settings' ? 'bg-slate-100 dark:bg-slate-700 text-blue-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              <Settings size={20} />
              {isKeyMissing && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-800 animate-pulse"></span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        
        {/* Settings View */}
        {activeTab === 'settings' ? (
           <Card className="p-6 max-w-lg mx-auto mt-10">
             <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
               <Settings size={20}/>设置
             </h2>
             <div className="space-y-6">
               <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Mail size={16}/> 邮箱设置
                  </label>
                  <Input 
                    label="Gmail 邮箱 (备用)" 
                    value={userEmail} 
                    onChange={(e) => setUserEmail(e.target.value)} 
                    placeholder="example@gmail.com" 
                  />
               </div>

               <div className="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-4">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Key size={16}/> API Key 设置 (可选)
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    如果您遇到 401/403 错误，或者希望使用自己的 Google Gemini Key，请在此处输入。
                    <br/>(您的 Key 仅存储在本地浏览器中)
                  </p>
                  <Input 
                    label="Gemini API Key" 
                    type="password"
                    value={customApiKey} 
                    onChange={(e) => setCustomApiKey(e.target.value)} 
                    placeholder="AIzaSy..." 
                  />
               </div>

               <Button onClick={() => setActiveTab('portfolio')} className="w-full mt-4">
                 保存并返回
               </Button>
             </div>
           </Card>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-slate-200 dark:border-slate-700 pb-1">
              <button
                onClick={() => setActiveTab('portfolio')}
                className={`pb-3 px-2 font-medium text-sm transition-all relative ${
                  activeTab === 'portfolio' 
                    ? 'text-blue-600 dark:text-blue-400' 
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                持仓监控 (Portfolio)
                {activeTab === 'portfolio' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full"></div>}
              </button>
              <button
                onClick={() => setActiveTab('planner')}
                className={`pb-3 px-2 font-medium text-sm transition-all relative flex items-center gap-2 ${
                  activeTab === 'planner' 
                    ? 'text-blue-600 dark:text-blue-400' 
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                交易备忘 (Planner)
                {todaysPlanCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                    {todaysPlanCount}
                  </span>
                )}
                {activeTab === 'planner' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full"></div>}
              </button>
            </div>

            {/* Action Bar */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                {activeTab === 'portfolio' ? '当前持仓 (Open Positions)' : '操作计划 (Planner)'}
              </h2>
              <div className="flex gap-2">
                {activeTab === 'planner' && (
                  <Button 
                    variant="calendar" 
                    onClick={addToGoogleCalendar}
                    className="hidden sm:flex"
                    disabled={todaysPlanCount === 0}
                  >
                    <Calendar size={18} /> 添加到 Google 日历
                  </Button>
                )}
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus size={18} /> {activeTab === 'portfolio' ? '记录持仓' : '新增备忘'}
                </Button>
              </div>
            </div>

            {/* Expired Scan Alert */}
            {activeTab === 'portfolio' && expiredCount > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 flex items-center gap-3 animate-in slide-in-from-top-2">
                    <ScanSearch size={24} className="text-red-500"/>
                    <div>
                        <h4 className="font-bold text-red-700 dark:text-red-300">过期扫描报告</h4>
                        <p className="text-xs text-red-600 dark:text-red-400">
                            检测到 {expiredCount} 个期权已过期超过2天。系统已按“价值归零”自动计算了最终盈亏。
                        </p>
                    </div>
                </div>
            )}

            {/* Content List */}
            {activeTab === 'portfolio' ? (
              <div className="grid gap-4">
                {positions.length === 0 && (
                  <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    <p>暂无持仓记录</p>
                  </div>
                )}
                {positions.map(pos => {
                  const netBasis = calculateNetBasis(pos);
                  const isAnalyzing = analyzingId === pos.id;
                  const isClosed = pos.status === 'CLOSED';
                  const isExpired = !isClosed && isExpiredByTwoDays(pos.expiration);
                  const finalPnL = (isClosed || isExpired) ? calculateFinalPnL(pos) : null;
                  
                  const hasHistory = pos.history && pos.history.length > 0;
                  const showHistory = expandedHistories[pos.id];

                  // Construct history list for display
                  // Logic: Find the earliest entry price from history if possible to detect origin
                  // But the user wants 'Initial Open' line to reflect the 'entryPrice' field which never changes.
                  const displayHistory = [...(pos.history || [])];
                  displayHistory.push({
                    action: 'OPEN',
                    date: pos.dateOpened || 'Initial',
                    price: pos.entryPrice,
                    isInitial: true 
                  });

                  return (
                    <Card key={pos.id} className={`p-4 transition-shadow hover:shadow-md ${isClosed ? 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 opacity-80' : isExpired ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' : ''}`}>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 text-xs font-bold rounded ${pos.direction === 'BUY' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'}`}>
                              {pos.direction === 'BUY' ? 'LONG' : 'SHORT'}
                            </span>
                            <h3 className="text-lg font-bold">{pos.ticker}</h3>
                            <span className="text-slate-400 text-sm">
                              {pos.expiration} ${pos.strike} {pos.type}
                            </span>
                            {isClosed && (
                                <span className="bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                    <Archive size={10} /> CLOSED
                                </span>
                            )}
                            {isExpired && !isClosed && (
                                <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                    <AlertTriangle size={10} /> EXPIRED
                                </span>
                            )}
                            
                            {/* AI Risk Analysis Trigger (Only for active positions) */}
                            {!isClosed && !isExpired && (
                              <button 
                                onClick={() => setAnalyzingId(isAnalyzing ? null : pos.id)}
                                className="ml-2 p-1 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition-colors"
                                title="AI 风险分析 (基于静态数据)"
                              >
                                <Sparkles size={16} />
                              </button>
                            )}
                          </div>
                          
                          <div className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                            <span>初始: ${pos.entryPrice.toFixed(2)}</span>
                            {pos.rollCredit !== 0 && (
                              <span className={`${pos.rollCredit > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {pos.rollCredit > 0 ? '+' : ''}展期: ${pos.rollCredit.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="text-right">
                            {(isClosed || isExpired) ? (
                                <>
                                    <div className="text-xs text-slate-400 uppercase tracking-wide">最终盈亏 (Final P&L)</div>
                                    <div className={`text-xl font-bold font-mono ${finalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {finalPnL >= 0 ? '+' : ''}{finalPnL.toFixed(2)}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-xs text-slate-400 uppercase tracking-wide">总成本 (Net Basis)</div>
                                    <div className={`text-xl font-bold font-mono ${netBasis >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {netBasis >= 0 ? '+' : ''}{netBasis.toFixed(0)}
                                    </div>
                                </>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {(hasHistory || isClosed) && (
                                <button onClick={() => toggleHistory(pos.id)} title="查看完整历史" className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded">
                                    {showHistory ? <ChevronUp size={18}/> : <History size={18}/>}
                                </button>
                            )}
                            <button onClick={() => openEdit(pos)} title="编辑" className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"><Edit3 size={18}/></button>
                            <button onClick={() => deleteItem(pos.id, 'portfolio')} title="删除" className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"><Trash2 size={18}/></button>
                          </div>
                        </div>
                      </div>

                      {/* History Accordion */}
                      {showHistory && (
                          <div className="mt-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-sm animate-in slide-in-from-top-2">
                              <div className="text-xs font-bold text-slate-400 mb-2 uppercase flex items-center gap-1">
                                  <History size={12}/> 交易历史 (Transaction History)
                              </div>
                              <div className="space-y-2">
                                  {displayHistory.map((h, idx) => {
                                      let val = 0;
                                      let isCredit = false;
                                      let label = "";

                                      if (h.isInitial) {
                                          // Find original initial state by traversing back if history exists
                                          // Actually `pos.history` holds snapshots.
                                          // The last element of `pos.history` holds the state BEFORE the first roll.
                                          // So if history exists, use the last element's `oldStrike` etc.
                                          // If no history, use current `pos`.
                                          let initStrike = pos.strike;
                                          let initExp = pos.expiration;
                                          if (pos.history && pos.history.length > 0) {
                                              const oldest = pos.history[pos.history.length - 1];
                                              initStrike = oldest.oldStrike;
                                              initExp = oldest.oldExpiration;
                                          }

                                          label = `初始开仓 (Initial Open) $${initStrike} (${initExp}) ${pos.type}`;
                                          
                                          // SELL = Credit (Negative), BUY = Debit (Positive)
                                          if (pos.direction === 'SELL') {
                                              val = -Math.abs(h.price); 
                                              isCredit = true;
                                          } else {
                                              val = Math.abs(h.price);
                                              isCredit = false;
                                          }
                                      } else if (h.action === 'CLOSE') {
                                          label = `平仓 (Close)`;
                                          // Close BUY = Credit (Neg cost), Close SELL = Debit (Pos cost to buy back)
                                          if (pos.direction === 'SELL') {
                                              val = Math.abs(h.closePrice); // Cost to buy back (Debit)
                                              isCredit = false; // Debit is red
                                          } else {
                                              val = -Math.abs(h.closePrice); // Money back (Credit)
                                              isCredit = true; // Credit is green
                                          }
                                      } else if (h.action === 'ROLL') {
                                          label = `Roll to ${h.newExpiration} $${h.newStrike} ${pos.type}`;
                                          val = h.rollPrice; // User input directly
                                          isCredit = val < 0;
                                      }

                                      return (
                                          <div key={idx} className="flex justify-between items-center text-slate-600 dark:text-slate-300 pb-2 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0">
                                              <div>
                                                  <span className="font-mono text-xs opacity-60 mr-2">{h.date}</span>
                                                  <span>{label}</span>
                                              </div>
                                              {/* Display logic:
                                                - If Credit (Negative value): Show as Green, Negative sign (e.g., -1.00)
                                                - If Debit (Positive value): Show as Red, Positive sign (e.g., +1.00)
                                              */}
                                              <div className={`font-mono ${isCredit ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                  {val > 0 ? '+' : ''}{val.toFixed(2)}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}

                      {/* AI Analysis Panel */}
                      {isAnalyzing && !isClosed && !isExpired && (
                        <AIAnalysisCard 
                          position={pos} 
                          onClose={() => setAnalyzingId(null)}
                          customApiKey={customApiKey}
                          onMissingKey={promptMissingKey}
                        />
                      )}
                    </Card>
                  )
                })}
              </div>
            ) : (
              <div className="grid gap-4">
                {todaysPlanCount > 0 && (
                   <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-4 flex justify-between items-center">
                     <div>
                       <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold mb-1">
                         <AlertCircle size={20}/> 今日待办 ({getLocalTodayString()})
                       </div>
                       <p className="text-sm text-blue-600 dark:text-blue-400">
                         您有 {todaysPlanCount} 个需要今天执行的操作。
                       </p>
                     </div>
                     <Button 
                        variant="calendar" 
                        onClick={addToGoogleCalendar}
                        className="text-sm"
                      >
                        <Calendar size={16} /> 添加提醒
                      </Button>
                   </div>
                )}

                {plans.length === 0 && (
                  <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    <p>暂无操作计划</p>
                  </div>
                )}
                
                {plans.sort((a,b) => a.actionDate.localeCompare(b.actionDate)).map(plan => {
                   const isToday = plan.actionDate === getLocalTodayString();
                   const isPast = plan.actionDate < getLocalTodayString();
                   const actionType = plan.actionCategory || 'OPEN';

                   return (
                    <Card key={plan.id} className={`p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group ${isToday ? 'ring-2 ring-blue-500' : ''} ${isPast ? 'opacity-60' : ''}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <div className={`px-2 py-1 rounded text-xs font-bold flex flex-col items-center leading-none min-w-[3.5rem] ${isToday ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700'}`}>
                            <span className="text-[10px] opacity-70">ACTION</span>
                            <span>{plan.actionDate.slice(5)}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                               {/* Action Type Badge */}
                               {actionType === 'ROLL' && (
                                 <span className="flex items-center gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs px-2 py-0.5 rounded font-bold">
                                   <RefreshCw size={12}/> ROLL
                                 </span>
                               )}
                               {actionType === 'CLOSE' && (
                                 <span className="flex items-center gap-1 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-xs px-2 py-0.5 rounded font-bold">
                                   CLOSE
                                 </span>
                               )}
                               
                               <span className={`font-bold ${plan.direction === 'BUY' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                 {actionType === 'OPEN' ? (plan.direction === 'BUY' ? '买入' : '卖出') : plan.direction === 'BUY' ? 'LONG' : 'SHORT'}
                               </span>
                               <span className="font-bold text-slate-800 dark:text-slate-100">{plan.ticker}</span>
                            </div>
                            
                            {/* Improved Display Logic for Roll vs Open/Close */}
                            {actionType === 'ROLL' ? (
                              <div className="text-sm mt-1 space-y-0.5">
                                <div className="text-slate-500 flex items-center gap-2">
                                  <span className="text-[10px] uppercase bg-slate-100 dark:bg-slate-700 px-1 rounded">FROM</span>
                                  {plan.expiration} ${plan.strike} {plan.type}
                                </div>
                                <div className="text-amber-600 dark:text-amber-400 flex items-center gap-2 font-medium">
                                  <span className="text-[10px] uppercase bg-amber-100 dark:bg-amber-900/40 px-1 rounded">TO</span>
                                  {plan.newExpirationPeriod} ${plan.newStrike}
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-slate-500">
                                 {plan.expiration} ${plan.strike} {plan.type}
                              </div>
                            )}
                          </div>
                        </div>
                        {plan.notes && (
                          <div className="mt-2 text-sm bg-slate-50 dark:bg-slate-700/50 p-2 rounded text-slate-600 dark:text-slate-300">
                            Note: {plan.notes}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <Button 
                           variant="primary" 
                           onClick={() => setExecutionPlan(plan)}
                           className="text-xs px-3 py-1.5"
                        >
                           <CheckSquare size={14} /> 执行
                        </Button>
                        <button onClick={() => openEdit(plan)} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"><Edit3 size={18}/></button>
                        <button onClick={() => deleteItem(plan.id, 'planner')} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"><CheckCircle size={18}/></button>
                      </div>
                    </Card>
                   )
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Execution Modal */}
      {executionPlan && (
        <ExecutionModal 
          plan={executionPlan} 
          positions={positions}
          onClose={() => setExecutionPlan(null)}
          onConfirm={handleExecutionConfirm}
        />
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <Card className="w-full max-w-lg shadow-2xl relative">
            <form onSubmit={handleSubmit} className="p-6">
              <h3 className="text-xl font-bold mb-6 text-slate-800 dark:text-white">
                {formData.id ? '编辑记录' : (activeTab === 'portfolio' ? '新增持仓' : '新增操作计划')}
              </h3>
              
              {/* Action Category Selector (Planner Only) */}
              {activeTab === 'planner' && (
                <div className="mb-6">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">操作类型 (Action Type)</label>
                  <div className="flex gap-2">
                    {['OPEN', 'ROLL', 'CLOSE'].map(type => {
                      const isActive = formData.actionCategory === type;
                      let activeClass = "";
                      if (type === 'OPEN') activeClass = "bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300";
                      else if (type === 'CLOSE') activeClass = "bg-slate-600 text-white border-slate-600 ring-2 ring-slate-300";
                      else activeClass = "bg-amber-500 text-white border-amber-500 ring-2 ring-amber-300"; // ROLL

                      return (
                       <button
                         key={type}
                         type="button"
                         onClick={() => updateField('actionCategory', type)}
                         className={`flex-1 py-3 text-sm rounded-xl border font-bold transition-all ${
                           isActive 
                             ? activeClass 
                             : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
                         }`}
                       >
                         {type === 'OPEN' && '开仓 (Open)'}
                         {type === 'CLOSE' && '平仓 (Close)'}
                         {type === 'ROLL' && <span className="flex items-center justify-center gap-1"><RefreshCw size={14}/> 展期 (Roll)</span>}
                       </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Conditional Inputs based on Mode */}
              
              {/* --- PORTFOLIO SELECTOR (For Roll/Close in Planner) --- */}
              {activeTab === 'planner' && formData.actionCategory !== 'OPEN' && (
                <div className="mb-6 animate-in fade-in slide-in-from-top-2">
                   <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                     <List size={14} /> 选择持仓 (Select Position) <span className="text-red-500">*</span>
                   </label>
                   <select 
                     className="w-full px-3 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                     onChange={(e) => handlePositionSelect(e.target.value)}
                     value={formData.selectedPositionId || ""}
                     required
                   >
                     <option value="">-- 请选择要操作的期权 --</option>
                     {positions.map(p => (
                       <option key={p.id} value={p.id}>
                         {p.ticker} - {p.expiration} ${p.strike} {p.type} ({p.direction})
                       </option>
                     ))}
                   </select>
                   {positions.length === 0 && (
                     <p className="text-xs text-red-500 mt-1">没有可用的持仓，请先在“持仓监控”中添加。</p>
                   )}
                </div>
              )}

              {/* --- BASIC INFO (Ticker, Strike, etc) --- */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                   <Input 
                    label="Ticker" 
                    value={formData.ticker} 
                    onChange={(e) => updateField('ticker', e.target.value.toUpperCase())} 
                    placeholder="SPY" 
                    required
                    readOnly={activeTab === 'planner' && formData.actionCategory !== 'OPEN'}
                  />
                  {/* AI Smart Fill (Only for OPEN Planner) */}
                  {!formData.id && activeTab === 'planner' && formData.actionCategory === 'OPEN' && (
                    <button
                      type="button"
                      onClick={() => {
                         setAiPrompt(prev => ({ ...prev, ticker: formData.ticker }));
                         setShowAIModal(true);
                      }}
                      className="mt-2 text-xs flex items-center gap-1 text-indigo-600 font-bold hover:underline"
                    >
                      <Sparkles size={12} /> AI 智能填单
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                   <Select 
                    label="Type" 
                    value={formData.type} 
                    onChange={(e) => updateField('type', e.target.value)}
                    options={[{value: 'CALL', label: 'Call'}, {value: 'PUT', label: 'Put'}]}
                  />
                  <Select 
                    label="Side" 
                    value={formData.direction} 
                    onChange={(e) => updateField('direction', e.target.value)}
                    options={[{value: 'BUY', label: 'Buy (Long)'}, {value: 'SELL', label: 'Sell (Short)'}]}
                  />
                </div>
              </div>

              {/* Standard Details (Strike/Exp) - ReadOnly if Roll/Close Source */}
              <div className={`p-3 rounded-lg border mb-4 ${activeTab === 'planner' && formData.actionCategory !== 'OPEN' ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700' : 'bg-transparent border-transparent p-0'}`}>
                {activeTab === 'planner' && formData.actionCategory !== 'OPEN' && (
                  <div className="text-xs font-bold text-slate-400 mb-2 uppercase">当前持仓详情 (From)</div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="Strike (行权价)" 
                    type="number" 
                    step="0.5"
                    value={formData.strike} 
                    onChange={(e) => updateField('strike', e.target.value)} 
                    placeholder="500" 
                    required
                    readOnly={activeTab === 'planner' && formData.actionCategory !== 'OPEN'}
                  />
                  <Input 
                    label="Exp. Date (到期日)"
                    type="date" 
                    value={formData.expiration} 
                    onChange={(e) => updateField('expiration', e.target.value)} 
                    required={activeTab === 'portfolio'} 
                    readOnly={activeTab === 'planner' && formData.actionCategory !== 'OPEN'}
                  />
                </div>
              </div>

              {/* --- ROLL TARGETS (Only for Planner ROLL) --- */}
              {activeTab === 'planner' && formData.actionCategory === 'ROLL' && (
                <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-100 dark:border-amber-800/30 mb-6 animate-in slide-in-from-left-2">
                  <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-3 uppercase flex items-center gap-2">
                    <RefreshCw size={14}/> 展期目标 (Roll To) <ArrowRight size={14}/>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input 
                      label="New Strike (新行权价)"
                      type="number" 
                      step="0.5"
                      value={formData.newStrike} 
                      onChange={(e) => updateField('newStrike', e.target.value)} 
                      placeholder="510" 
                      className="bg-white dark:bg-slate-900"
                    />
                    <Select
                       label="New Exp. (新周期)"
                       value={formData.newExpirationPeriod}
                       onChange={(e) => updateField('newExpirationPeriod', e.target.value)}
                       required={false}
                       options={[
                         {value: '', label: '选择周期...'},
                         {value: '1 Week', label: '一周后 (1 Week)'},
                         {value: '1 Month', label: '一个月后 (1 Month)'},
                         {value: '2 Months', label: '两个月后 (2 Months)'},
                         {value: '3 Months', label: '三个月后 (3 Months)'},
                         {value: '1 Year', label: '一年后 (1 Year)'},
                       ]}
                     />
                  </div>
                </div>
              )}

              {/* --- PORTFOLIO SPECIFIC: FINANCIALS --- */}
              {activeTab === 'portfolio' ? (
                <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/30 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                     <Input 
                      label="Initial Price (初始价格)" 
                      type="number" 
                      step="0.01"
                      value={formData.entryPrice} 
                      onChange={(e) => updateField('entryPrice', e.target.value)} 
                      placeholder="2.50" 
                      required
                    />
                    <Input 
                      label="Net Roll Credit (展期净利)" 
                      type="number" 
                      step="0.01"
                      value={formData.rollCredit} 
                      onChange={(e) => updateField('rollCredit', e.target.value)} 
                      placeholder="0.00" 
                    />
                  </div>
                  <div className="mt-2 text-[10px] text-emerald-600/80 dark:text-emerald-400/80">
                    * 正数代表收到的权利金 (Credit)，负数代表支付的权利金 (Debit)。
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <Input 
                      label="Action Date (执行日期)" 
                      type="date" 
                      value={formData.actionDate} 
                      onChange={(e) => updateField('actionDate', e.target.value)} 
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Notes (备注)</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => updateField('notes', e.target.value)}
                      placeholder="为什么要这样操作？止损位是多少？"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 mt-6">
                <Button variant="secondary" onClick={closeModal} className="flex-1">取消</Button>
                <Button type="submit" className="flex-1">保存</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* AI Strategy Generation Modal */}
      {showAIModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-sm shadow-2xl p-6 bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 dark:to-slate-900 border-indigo-200 dark:border-indigo-900">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                  <Sparkles size={20} className="text-indigo-500"/> AI 策略生成器
                </h3>
                <button onClick={() => setShowAIModal(false)}><X size={20} className="text-slate-400"/></button>
             </div>
             
             <div className="space-y-3">
               <Input 
                 label="Ticker (股票代码)"
                 value={aiPrompt.ticker}
                 onChange={(e) => setAiPrompt({...aiPrompt, ticker: e.target.value.toUpperCase()})}
                 placeholder="NVDA"
               />
               <Input 
                 label="Current Stock Price (approx.)"
                 type="number"
                 value={aiPrompt.currentPrice}
                 onChange={(e) => setAiPrompt({...aiPrompt, currentPrice: e.target.value})}
                 placeholder="120.50 (Optional but recommended)"
               />
               <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Your Outlook (您的看法)</label>
                  <textarea
                    value={aiPrompt.outlook}
                    onChange={(e) => setAiPrompt({...aiPrompt, outlook: e.target.value})}
                    placeholder="例如: 财报前看涨，想做短期投机..."
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-20 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  />
               </div>
               
               <Button 
                 variant="ai" 
                 onClick={handleAIFill} 
                 disabled={isAiGenerating}
                 className="w-full mt-2"
               >
                 {isAiGenerating ? <Loader2 className="animate-spin" /> : '生成策略建议'}
               </Button>
               <p className="text-xs text-center text-slate-400">
                 Gemini 将根据您的看法生成行权价和到期日建议
               </p>
             </div>
          </Card>
        </div>
      )}

    </div>
  );
}