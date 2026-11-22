import React from 'react';

const inputCls =
  'w-full px-2 py-1.5 text-xs rounded border bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500';

/** Renders inputs from a parameter schema; the schema drives everything. */
export default function ParamFields({ schema, values, errors, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {schema.map(f => {
        const err = errors?.[f.key];
        const border = err ? 'border-red-400' : 'border-slate-300 dark:border-slate-600';
        if (f.type === 'bool') {
          return (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none mt-4">
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  disabled={disabled}
                  onChange={e => onChange(f.key, e.target.checked)}
                  className="rounded border-slate-300"
                />
                {f.label}
              </label>
              {f.help && <span className="text-[10px] text-slate-400 leading-tight">{f.help}</span>}
            </div>
          );
        }
        return (
          <div key={f.key} className="flex flex-col gap-1" title={f.help}>
            <label className="text-[10px] font-semibold text-slate-400">{f.label}</label>
            <input
              type={f.type === 'date' ? 'date' : 'text'}
              inputMode={f.type === 'int' || f.type === 'number' ? 'decimal' : undefined}
              value={values[f.key] ?? ''}
              disabled={disabled}
              onChange={e => onChange(f.key, e.target.value)}
              className={`${inputCls} ${border}`}
            />
            {err
              ? <span className="text-[10px] text-red-500">{err}</span>
              : f.help && <span className="text-[10px] text-slate-400 leading-tight">{f.help}</span>}
          </div>
        );
      })}
    </div>
  );
}
