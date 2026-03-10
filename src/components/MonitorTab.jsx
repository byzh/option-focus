import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Loader2, AlertTriangle, ChevronUp, BookOpen, ExternalLink } from 'lucide-react';
import MarketScanner from './MarketScanner';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';

const APP_ID = 'option-focus-v2';

function MonitorTab({ user, db }) {
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
          if (data.isDemoMode && data.sessionExpiration && new Date(data.sessionExpiration) > new Date()) {
            setSessionData(data);
            setStatus('connected');
            setIsLoadingCache(false);
            return;
          }

          // OAuth mode: refreshToken exists = connected
          // access_token is managed server-side, we don't check it here
          if (data.refreshToken && data.connected) {
            setSessionData(data);
            setStatus('connected');
            setIsLoadingCache(false);
            return;
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

  // Cloud Function base URL
  const CLOUD_FN_BASE = `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

  // Handle connection via Cloud Function (clientSecret is server-side only)
  const handleConnect = async (e) => {
    e.preventDefault();
    if (!refreshToken.trim()) return;

    setStatus('loading');
    setError(null);
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
      return;
    }

    // OAUTH MODE: Call Cloud Function to verify refresh token
    // access_token stays server-side, never returned to browser
    try {
      if (!user) {
        throw new Error('User not authenticated.');
      }

      const idToken = await user.getIdToken();

      const response = await fetch(`${CLOUD_FN_BASE}/tastytradeRefreshToken`, {
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

      await response.json();
      // result is { connected: true, expiresIn: 900 } — NO access_token

      // Store only refreshToken in Firestore (no access_token)
      const newSessionData = {
        refreshToken: refreshToken.trim(),
        connected: true,
        cachedAt: Date.now(),
      };

      try {
        const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'config', 'tastytrade');
        await setDoc(ref, newSessionData, { merge: true });
      } catch (firestoreError) {
        console.error('Failed to save connection state:', firestoreError);
      }

      setSessionData(newSessionData);
      setStatus('connected');
      setRefreshToken('');
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

  // Handle disconnection
  const handleDisconnect = async () => {
    await clearStoredToken();
    setSessionData(null);
    setStatus('idle');
    setError(null);
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

        {/* Connected state — compact row */}
        {!isLoadingCache && status === 'connected' && sessionData && (
          <div className="space-y-3">
            <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
              sessionData.isDemoMode
                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            }`}>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDisconnect}
                  className={`p-0.5 rounded transition-colors ${sessionData.isDemoMode ? 'text-indigo-500 hover:text-red-500' : 'text-emerald-500 hover:text-red-500'}`}
                  title="断开连接"
                >
                  <Wifi size={14} />
                </button>
                <span className={`text-sm font-semibold ${sessionData.isDemoMode ? 'text-indigo-800 dark:text-indigo-200' : 'text-emerald-800 dark:text-emerald-200'}`}>
                  {sessionData.tastyUsername}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  sessionData.isDemoMode
                    ? 'bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300'
                    : 'bg-emerald-100 dark:bg-emerald-800 text-emerald-600 dark:text-emerald-300'
                }`}>
                  {sessionData.isDemoMode ? '演示' : 'OAuth'}
                </span>
              </div>
            </div>

          </div>
        )}
      </Card>

      {/* Market Scanner — shown when connected (non-demo) */}
      {status === 'connected' && !sessionData?.isDemoMode && (
        <MarketScanner user={user} db={db} />
      )}
    </div>
  );
}

export default MonitorTab;
