import React from 'react';
import { HelpCircle, Loader2 } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';

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

export default ConfirmModal;
