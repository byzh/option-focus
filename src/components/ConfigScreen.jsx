import React from 'react';
import { Code } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';

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

export default ConfigScreen;
