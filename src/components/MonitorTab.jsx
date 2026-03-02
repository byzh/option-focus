import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Loader2, AlertTriangle, ChevronUp, Clock, User, BarChart2, BookOpen, ExternalLink, RefreshCw } from 'lucide-react';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';

const APP_ID = 'option-focus-v2';
const TASTYTRADE_API = 'https://api.tastytrade.com';

// Pure helpers (no React hooks)
const getMinutesUntilExpiry = (iso) => {
  if (!iso) return -1;
  return (new Date(iso) - new Date()) / 60000;
};

const getHoursUntilExpiry = (iso) => {
  if (!iso) return -1;
  return (new Date(iso) - new Date()) / 3600000;
};

const isAccessTokenValid = (iso) => {
  return getMinutesUntilExpiry(iso) > 5; // 5 min buffer
};

const formatExpiry = (iso, isOAuth = false) => {
  if (isOAuth) {
    const m = getMinutesUntilExpiry(iso);
    if (m < 0) return 'Token 已过期';
    if (m < 1) return `Token 将在 ${Math.round(m * 60)} 秒后过期`;
    return `Token 将在 ${Math.round(m)} 分钟后过期`;
  } else {
    const h = getHoursUntilExpiry(iso);
    if (h < 0) return 'Token 已过期';
    if (h < 1) return `Token 将在 ${Math.round(h * 60)} 分钟后过期`;
    return `Token 将在 ${h.toFixed(1)} 小时后过期`;
  }
};

function MonitorTab({ user, db, functions }) {
  // Connection lifecycle state
  const [status, setStatus] = useState('idle'); // idle | loading | connected | error

  // Form inputs (OAuth mode) - only refreshToken from user, clientId and clientSecret are server-side (Secret Manager)
  const [refreshToken, setRefreshToken] = useState('');

  // OAuth setup guide state
  const [isGuideExpanded, setIsGuideExpanded] = useState(true);

  // Session data from Firestore or API
  const [sessionData, setSessionData] = useState(null);

  // Error state
  const [error, setError] = useState(null);

  // Debug display
  const [rawResponse, setRawResponse] = useState(null);
  const [isRawExpanded, setIsRawExpanded] = useState(false);

  // Cache loading state
  const [isLoadingCache, setIsLoadingCache] = useState(true);

  // Demo mode toggle
  const [isDemoMode, setIsDemoMode] = useState(false);

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

          // Demo mode: check session token validity
          if (data.isDemoMode && isAccessTokenValid(data.sessionExpiration || data.accessTokenExpiry)) {
            setSessionData(data);
            setStatus('connected');
            setIsLoadingCache(false);
            return;
          }

          // OAuth mode: check access token validity
          if (data.refreshToken) {
            if (data.accessToken && isAccessTokenValid(data.accessTokenExpiry)) {
              // Access token still valid
              setSessionData(data);
              setStatus('connected');
              setIsLoadingCache(false);
              return;
            } else {
              // Access token expired or missing — refresh it
              await refreshAccessToken(data, ref);
              setIsLoadingCache(false);
              return;
            }
          }

          // Cleanup: data exists but is invalid
          await deleteDoc(ref);
          setStatus('idle');
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

  // Refresh access token via Cloud Function (clientSecret stays server-side, never sent to client)
  const refreshAccessToken = async (storedData, firestoreRef) => {
    try {
      if (!user) {
        throw new Error('User not authenticated.');
      }

      console.log('[refreshAccessToken] Auth user:', user?.uid, 'Refreshing access token...');

      // Get Firebase ID token
      const idToken = await user.getIdToken();

      // Call Cloud Function as HTTP endpoint
      const cloudFunctionUrl = 'https://us-central1-option-focus-test.cloudfunctions.net/tastytradeRefreshToken';
      const response = await fetch(cloudFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          refreshToken: storedData.refreshToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('[refreshAccessToken] Cloud Function returned:', result);

      // result is { access_token, expires_in }
      const { access_token, expires_in } = result;
      const expiry = new Date(Date.now() + expires_in * 1000).toISOString();

      const updated = {
        ...storedData,
        accessToken: access_token,
        accessTokenExpiry: expiry,
      };

      await setDoc(firestoreRef, updated, { merge: true });
      setSessionData(updated);
      setStatus('connected');
    } catch (e) {
      console.error('Token refresh failed:', e);
      setStatus('idle');
      setError({
        type: 'oauth',
        message: `OAuth token 刷新失败: ${e.message}。请重新连接。`,
      });
    }
  };

  // Handle connection via Cloud Function (clientSecret is server-side only)
  const handleConnect = async (e) => {
    e.preventDefault();
    if (!refreshToken.trim()) return;

    setStatus('loading');
    setError(null);
    setRawResponse(null);

    // DEMO MODE: Skip API call and simulate successful connection
    if (isDemoMode) {
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate network delay

      const demoExpiration = new Date();
      demoExpiration.setHours(demoExpiration.getHours() + 24); // 24 hours from now

      const newSessionData = {
        sessionToken: `demo_token_${Date.now()}`,
        sessionExpiration: demoExpiration.toISOString(),
        tastyUsername: '演示账户',
        cachedAt: Date.now(),
        isDemoMode: true,
      };

      // Persist to Firestore
      try {
        const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'config', 'tastytrade');
        await setDoc(ref, newSessionData, { merge: true });
      } catch (firestoreError) {
        console.error('Failed to cache token in Firestore:', firestoreError);
      }

      setSessionData(newSessionData);
      setStatus('connected');
      setRefreshToken('');
      setRawResponse({ mode: 'demo', message: '演示模式 - 使用模拟数据' });
      return;
    }

    // OAUTH MODE: Call Cloud Function to get access token
    // Cloud Function handles clientSecret securely (server-side only)
    try {
      if (!user) {
        throw new Error('User not authenticated.');
      }

      // Get Firebase ID token for authorization
      const idToken = await user.getIdToken();

      // Call Cloud Function as HTTP endpoint (onRequest, not onCall)
      const cloudFunctionUrl = 'https://us-central1-option-focus-test.cloudfunctions.net/tastytradeRefreshToken';
      const response = await fetch(cloudFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          refreshToken: refreshToken.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      const { access_token, expires_in } = result;
      const accessTokenExpiry = new Date(Date.now() + expires_in * 1000).toISOString();

      // Store minimal data in Firestore (only refreshToken, not clientSecret/clientId)
      const newSessionData = {
        refreshToken: refreshToken.trim(),
        accessToken: access_token,
        accessTokenExpiry,
        cachedAt: Date.now(),
      };

      try {
        const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'config', 'tastytrade');
        await setDoc(ref, newSessionData, { merge: true });
      } catch (firestoreError) {
        console.error('Failed to cache OAuth credentials in Firestore:', firestoreError);
        // Non-fatal: token is usable in-memory
      }

      // Update state
      setSessionData(newSessionData);
      setStatus('connected');
      setRefreshToken(''); // Clear password field
      setRawResponse({ success: true, access_token_expires_in: expires_in, message: '连接成功' });
    } catch (e) {
      console.error('OAuth connection failed:', e);
      setError({
        type: 'auth',
        message: `连接失败: ${e.message}。请检查 Refresh Token。`,
      });
      setStatus('error');
    }
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

  // Test API: fetch /customers/me and a sample quote
  const [apiTestResult, setApiTestResult] = useState(null);
  const [apiTestLoading, setApiTestLoading] = useState(false);

  const handleTestApi = async () => {
    if (!sessionData?.accessToken) return;
    setApiTestLoading(true);
    setApiTestResult(null);

    const results = {};
    const headers = {
      'Authorization': `Bearer ${sessionData.accessToken}`,
    };

    // Market data: GET /market-data/by-type?equity=SPY
    try {
      const quoteRes = await fetch(`${TASTYTRADE_API}/market-data/by-type?equity=SPY`, { headers });
      if (quoteRes.ok) {
        const quoteData = await quoteRes.json();
        results.spyQuote = { status: 'ok', data: quoteData.data };
      } else {
        results.spyQuote = { status: 'error', code: quoteRes.status, text: await quoteRes.text() };
      }
    } catch (e) {
      results.spyQuote = { status: 'cors_or_network_error', message: e.message };
    }

    setApiTestResult(results);
    setApiTestLoading(false);
  };

  // Handle disconnection
  const handleDisconnect = async () => {
    await clearStoredToken();
    setSessionData(null);
    setStatus('idle');
    setError(null);
    setRawResponse(null);
    setIsRawExpanded(false);
    setRefreshToken('');
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="bg-slate-100 dark:bg-slate-700 p-1.5 rounded-lg text-slate-600 dark:text-slate-400">
              <Wifi size={16} />
            </div>
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">
              Tastytrade API 连接
            </h3>
            {isDemoMode && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium">
                🎭 演示模式
              </span>
            )}
          </div>
          {!isLoadingCache && status !== 'connected' && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isDemoMode}
                onChange={(e) => setIsDemoMode(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-slate-600 dark:text-slate-400">演示模式</span>
            </label>
          )}
        </div>

        {/* Loading cache */}
        {isLoadingCache && (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
            <Loader2 size={16} className="animate-spin" />
            正在恢复连接状态...
          </div>
        )}

        {/* Connection form (not connected) */}
        {!isLoadingCache && status !== 'connected' && !isDemoMode && (
          <form onSubmit={handleConnect} className="space-y-4">
            {/* OAuth Setup Guide (Collapsible) */}
            <div className="border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden bg-blue-50 dark:bg-blue-900/20">
              <button
                type="button"
                onClick={() => setIsGuideExpanded(!isGuideExpanded)}
                className="w-full flex items-center justify-between px-3 py-3 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <BookOpen size={16} /> 🔑 如何获取 OAuth 凭据（一次性操作）
                </span>
                <ChevronUp
                  size={16}
                  className={`transition-transform ${
                    isGuideExpanded ? '' : 'rotate-180'
                  }`}
                />
              </button>

              {isGuideExpanded && (
                <div className="px-3 py-3 border-t border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 space-y-2">
                  <div>
                    <p className="font-medium mb-1">步骤 1：访问 Tastytrade 开发者门户</p>
                    <p className="ml-3">→ 打开 <a href="https://developer.tastytrade.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline hover:opacity-80">
                      developer.tastytrade.com <ExternalLink size={12} />
                    </a>，登录 Tastytrade 账号</p>
                  </div>
                  <div>
                    <p className="font-medium mb-1">步骤 2：创建应用</p>
                    <p className="ml-3">→ 点击 "Create Application"，填写应用名称<br/>
                    → 设置 Scope: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">read</code>（不需要 trade）<br/>
                    → Redirect URI 填写：<code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">http://localhost</code></p>
                  </div>
                  <div>
                    <p className="font-medium mb-1">步骤 3：获取 Refresh Token</p>
                    <p className="ml-3">→ 点击 "Create Grant"，复制显示的 Refresh Token</p>
                  </div>
                  <div>
                    <p className="font-medium mb-1">步骤 4：填写下方表单</p>
                    <p className="ml-3">→ 将 Refresh Token 粘贴到下面的表单中并点击"连接"<br/>
                    → Client ID 和 Client Secret 由应用服务端通过 Secret Manager 安全保管</p>
                  </div>
                </div>
              )}
            </div>

            <Input
              label="Refresh Token"
              type="password"
              value={refreshToken}
              onChange={e => setRefreshToken(e.target.value)}
              placeholder="从 developer.tastytrade.com 复制"
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
              disabled={status === 'loading' || !refreshToken.trim()}
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

        {/* Demo mode form */}
        {!isLoadingCache && status !== 'connected' && isDemoMode && (
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                演示模式 — 在这个模式下，连接会使用模拟数据进行测试，不需要实际的 OAuth 凭据。
              </p>
            </div>

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
              disabled={status === 'loading'}
              className="w-full"
            >
              {status === 'loading' ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> 连接中...
                </>
              ) : (
                <>
                  <Wifi size={16} /> 连接（演示模式）
                </>
              )}
            </Button>
          </form>
        )}

        {/* Connected state */}
        {!isLoadingCache && status === 'connected' && sessionData && (
          <div className="space-y-4">
            {/* Mode banner */}
            {sessionData.isDemoMode && (
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3">
                <p className="text-sm text-indigo-700 dark:text-indigo-300">
                  🎭 <strong>演示模式</strong> — 使用模拟数据进行测试。
                </p>
              </div>
            )}
            {sessionData.accessToken && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                <p className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <RefreshCw size={14} /> <strong>OAuth 已连接</strong> — 使用 refresh token 自动更新凭据。
                </p>
              </div>
            )}

            {/* User info row */}
            <div className={`flex items-center justify-between p-3 rounded-lg border ${
              sessionData.isDemoMode
                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  sessionData.isDemoMode
                    ? 'bg-indigo-100 dark:bg-indigo-800'
                    : 'bg-emerald-100 dark:bg-emerald-800'
                }`}>
                  <User size={16} className={sessionData.isDemoMode ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'} />
                </div>
                <div>
                  <div className={`text-sm font-semibold ${
                    sessionData.isDemoMode
                      ? 'text-indigo-800 dark:text-indigo-200'
                      : 'text-emerald-800 dark:text-emerald-200'
                  }`}>
                    {sessionData.tastyUsername}
                  </div>
                  <div className={`text-xs flex items-center gap-1 ${
                    sessionData.isDemoMode
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    <Clock size={10} />
                    {formatExpiry(sessionData.isDemoMode ? sessionData.sessionExpiration : sessionData.accessTokenExpiry, !sessionData.isDemoMode)}
                  </div>
                </div>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                sessionData.isDemoMode
                  ? 'bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300'
                  : 'bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300'
              }`}>
                {sessionData.isDemoMode ? '演示已连接' : 'OAuth 已连接'}
              </span>
            </div>

            {/* Test API button */}
            {!sessionData.isDemoMode && (
              <Button onClick={handleTestApi} disabled={apiTestLoading} className="w-full">
                {apiTestLoading ? (
                  <><Loader2 size={16} className="animate-spin" /> 测试中...</>
                ) : (
                  <><BarChart2 size={16} /> 测试 API（获取 SPY 报价）</>
                )}
              </Button>
            )}

            {/* API Test Results */}
            {apiTestResult && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">API 测试结果：</p>
                <pre className="text-[11px] bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 p-2 rounded overflow-auto max-h-64">
                  {JSON.stringify(apiTestResult, null, 2)}
                </pre>
              </div>
            )}

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
