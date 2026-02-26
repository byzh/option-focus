import React from 'react';

const Select = ({ label, value, onChange, options, required = false }) => (
  <div className="flex flex-col gap-1 w-full">
    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label} {required && <span className="text-red-500">*</span>}</label>
    <select value={value} onChange={onChange} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600">
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

export default Select;
