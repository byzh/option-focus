import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Loader2, AlertTriangle, ChevronUp, Clock, User, BarChart2 } from 'lucide-react';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';

const APP_ID = 'option-focus-v2';
const TASTYTRADE_API = 'https://api.tastytrade.com';

// Pure helpers (no React hooks)
const getHoursUntilExpiry = (iso) => {
  if (!iso) return -1;
  return (new Date(iso) - new Date()) / 3600000;
};

const isTokenValid = (iso) => {
  return getHoursUntilExpiry(iso) > (5 / 60); // 5 min buffer
};

const formatExpiry = (iso) => {
  const h = getHoursUntilExpiry(iso);
  if (h < 0) return 'Token 已过期';
  if (h < 1) return `Token 将在 ${Math.round(h * 60)} 分钟后过期`;
  return `Token 将在 ${h.toFixed(1)} 小时后过期`;
};

function MonitorTab({ user, db }) {
  // Connection lifecycle state
  const [status, setStatus] = useState('idle'); // idle | loading | connected | error

  // Form inputs
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Session data from Firestore or API
  const [sessionData, setSessionData] = useState(null);

  // Error state
  const [error, setError] = useState(null);

  // Debug display
  const [rawResponse, setRawResponse] = useState(null);
  const [isRawExpanded, setIsRawExpanded] = useState(false);

  // Cache loading state
  const [isLoadingCache, setIsLoadingCache] = useState(true);

  // Load cached token on mount
  useEffect(() => {
    if (!user || !db) {
      setIsLoadingCache(false);
      return;
    }

    const loadCachedToken = async () => {
      setIsLoadingCache(true);
      try {
        const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'config', 'tastytrade');
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          if (data.sessionToken && isTokenValid(data.sessionExpiration)) {
            // Token is still valid
            setSessionData(data);
            setStatus('connected');
          } else if (data.sessionToken) {
            // Token exists but expired — clean it up
            await deleteDoc(ref);
            setStatus('idle');
          }
        } else {
          setStatus('idle');
        }
      } catch (e) {
        console.error('Failed to load cached Tastytrade token:', e);
        setStatus('idle'); // fail open: show connect form
      } finally {
        setIsLoadingCache(false);
      }
    };

    loadCachedToken();
  }, [user, db]);

  // Handle connection
  const handleConnect = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setStatus('loading');
    setError(null);
    setRawResponse(null);

    const body = {
      login: username.trim(),
      password: password,
      'remember-me': true,
    };

    let response;
    try {
      response = await fetch(TASTYTRADE_API + '/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (fetchError) {
      // fetch() throws if request never reaches server (CORS, offline, etc)
      if (!navigator.onLine) {
        setError({
          type: 'network',
          message: '无网络连接，请检查网络后重试。',
        });
      } else {
        // Almost certainly CORS
        setError({
          type: 'cors',
          message:
            'API 请求被浏览器拦截（CORS 策略限制）。' +
            'Tastytrade API 不允许直接从浏览器发起请求，' +
            '后续版本将通过代理服务器解决此问题。',
        });
      }
      setStatus('error');
      return;
    }

    // Read response body
    let responseData;
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }

    setRawResponse(responseData);

    if (response.status === 201) {
      // SUCCESS
      const token = responseData?.data?.['session-token'];
      const expiration = responseData?.data?.['session-expiration'];
      const apiUsername = responseData?.data?.user?.username || username.trim();

      if (!token) {
        setError({
          type: 'unknown',
          message: 'API 返回成功，但响应中未找到 session-token。',
        });
        setStatus('error');
        return;
      }

      const newSessionData = {
        sessionToken: token,
        sessionExpiration: expiration,
        tastyUsername: apiUsername,
        cachedAt: Date.now(),
      };

      // Persist to Firestore
      try {
        const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'config', 'tastytrade');
        await setDoc(ref, newSessionData, { merge: true });
      } catch (firestoreError) {
        console.error('Failed to cache token in Firestore:', firestoreError);
        // Non-fatal: token is usable in-memory
      }

      setSessionData(newSessionData);
      setStatus('connected');
      setPassword(''); // Clear password immediately
    } else if (response.status === 401) {
      setError({
        type: 'auth',
        message: '用户名或密码错误（401 Unauthorized）。请检查 Tastytrade 账户凭据。',
      });
      setStatus('error');
    } else if (response.status === 403) {
      // 403 could be CORS preflight rejection or API rate limit
      const errorMsg = responseData?.error?.message || '请求被拒绝';
      setError({
        type: 'cors',
        message: `API 返回 403 Forbidden: ${errorMsg}。这通常表示：\n1. CORS 策略限制\n2. API 账户权限不足\n3. 登录尝试过多被临时锁定\n\n请检查 Tastytrade 账户状态，或稍后重试。`,
      });
      setStatus('error');
    } else {
      setError({
        type: 'unknown',
        message: `API 返回非预期状态码 ${response.status}。响应: ${responseData?.error?.message || '无详情'}`,
      });
      setStatus('error');
    }

    // Log for debugging
    console.log(`[Tastytrade API Response] Status: ${response.status}`, responseData);
  };

  // Clear stored token
  const clearStoredToken = async () => {
    if (!user || !db) return;
    try {
      const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'config', 'tastytrade');
      await deleteDoc(ref);
    } catch (e) {
      console.error('Failed to delete stored token:', e);
    }
  };

  // Handle disconnection
  const handleDisconnect = async () => {
    await clearStoredToken();
    setSessionData(null);
    setStatus('idle');
    setError(null);
    setRawResponse(null);
    setIsRawExpanded(false);
    setPassword('');
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
          行情监控 (Monitor)
          {/* Inline status badge */}
          {status === 'connected' && (
            <span className="text-sm font-normal px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
              <Wifi size={12} /> 已连接
            </span>
          )}
          {status === 'loading' && (
            <span className="text-sm font-normal px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> 连接中...
            </span>
          )}
          {status === 'error' && (
            <span className="text-sm font-normal px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 flex items-center gap-1">
              <WifiOff size={12} /> 连接失败
            </span>
          )}
        </h2>
      </div>

      {/* Tastytrade API Connection Card */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-slate-100 dark:bg-slate-700 p-1.5 rounded-lg text-slate-600 dark:text-slate-400">
            <Wifi size={16} />
          </div>
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">
            Tastytrade API 连接
          </h3>
        </div>

        {/* Loading cache */}
        {isLoadingCache && (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
            <Loader2 size={16} className="animate-spin" />
            正在恢复连接状态...
          </div>
        )}

        {/* Connection form (not connected) */}
        {!isLoadingCache && status !== 'connected' && (
          <form onSubmit={handleConnect} className="space-y-4">
            <Input
              label="Tastytrade 用户名"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="your@email.com"
              required
            />
            <Input
              label="密码"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            {/* Error display */}
            {error && (
              <div
                className={`p-3 rounded-lg text-sm border ${
                  error.type === 'cors'
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    size={14}
                    className={`mt-0.5 shrink-0 ${
                      error.type === 'cors' ? 'text-amber-500' : 'text-red-500'
                    }`}
                  />
                  <span>{error.message}</span>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={status === 'loading' || !username.trim() || !password.trim()}
              className="w-full"
            >
              {status === 'loading' ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> 连接中...
                </>
              ) : (
                <>
                  <Wifi size={16} /> 连接
                </>
              )}
            </Button>
          </form>
        )}

        {/* Connected state */}
        {!isLoadingCache && status === 'connected' && sessionData && (
          <div className="space-y-4">
            {/* User info row */}
            <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center">
                  <User size={16} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                    {sessionData.tastyUsername}
                  </div>
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Clock size={10} />
                    {formatExpiry(sessionData.sessionExpiration)}
                  </div>
                </div>
              </div>
              <span className="text-xs font-medium px-2 py-1 bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-full">
                已连接
              </span>
            </div>

            {/* Disconnect button */}
            <Button variant="danger" onClick={handleDisconnect} className="w-full">
              <WifiOff size={16} /> 断开连接
            </Button>

            {/* Raw response (collapsible) */}
            {rawResponse && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setIsRawExpanded(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <span className="font-medium">原始 API 响应 (调试)</span>
                  <ChevronUp
                    size={12}
                    className={`transition-transform ${
                      isRawExpanded ? '' : 'rotate-180'
                    }`}
                  />
                </button>
                {isRawExpanded && (
                  <pre className="p-3 text-[11px] bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 overflow-auto max-h-48 border-t border-slate-200 dark:border-slate-700">
                    {JSON.stringify(rawResponse, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Placeholder for future modules */}
      <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
        <div className="text-slate-400 dark:text-slate-500">
          <BarChart2 size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">行情扫描模块</p>
          <p className="text-xs mt-1">即将上线 — 需要先完成 API 连接</p>
        </div>
      </div>
    </div>
  );
}

export default MonitorTab;
