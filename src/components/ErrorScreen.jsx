import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';

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

export default ErrorScreen;
