import React from 'react';

const Input = ({ label, type = "text", value, onChange, placeholder, required = false, step, readOnly = false, className = "", ...rest }) => (
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
      {...rest}
    />
  </div>
);

export default Input;
