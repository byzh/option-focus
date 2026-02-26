import React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';

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

export default MessageModal;
