// Schema-driven parameter validation shared by strategies and the evaluator.
//
// Schema item: { key, label, type, min?, max?, help?, group? }
//   type: 'int' | 'number' | 'bool' | 'date' | 'intList'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function defaultsFromSchema(schema) {
  return Object.fromEntries(schema.map(f => [f.key, f.default]));
}

function inRange(v, f) {
  return (f.min == null || v >= f.min) && (f.max == null || v <= f.max);
}

function rangeText(f) {
  if (f.min != null && f.max != null) return `${f.min} ~ ${f.max}`;
  if (f.min != null) return `≥ ${f.min}`;
  return `≤ ${f.max}`;
}

/**
 * @param {Array} schema
 * @param {object} raw - values as edited in the form (strings / booleans)
 * @returns {{ values: object, errors: object }}
 */
export function validateParams(schema, raw) {
  const values = {};
  const errors = {};

  for (const f of schema) {
    const v = raw?.[f.key];
    switch (f.type) {
      case 'bool':
        values[f.key] = Boolean(v);
        break;

      case 'int':
      case 'number': {
        const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
        if (String(v ?? '').trim() === '' || !Number.isFinite(n)) { errors[f.key] = '请输入数字'; break; }
        if (f.type === 'int' && !Number.isInteger(n)) { errors[f.key] = '请输入整数'; break; }
        if (!inRange(n, f)) { errors[f.key] = `范围 ${rangeText(f)}`; break; }
        values[f.key] = n;
        break;
      }

      case 'date': {
        const s = String(v ?? '').trim();
        if (s === '') { values[f.key] = ''; break; }
        if (!DATE_PATTERN.test(s) || !Number.isFinite(Date.parse(`${s}T00:00:00Z`))) { errors[f.key] = '格式 YYYY-MM-DD'; break; }
        values[f.key] = s;
        break;
      }

      case 'intList': {
        const parts = String(v ?? '').split(/[,，\s]+/).filter(Boolean);
        const nums = parts.map(Number);
        if (!nums.length || nums.some(n => !Number.isInteger(n) || !inRange(n, f))) {
          errors[f.key] = `逗号分隔的整数，${rangeText(f)}`;
          break;
        }
        values[f.key] = [...new Set(nums)].sort((a, b) => a - b);
        break;
      }

      default:
        errors[f.key] = '未知参数类型';
    }
  }
  return { values, errors };
}

/** Form-friendly representation of defaults (lists as text). */
export function toFormValues(schema, values) {
  return Object.fromEntries(schema.map(f => {
    const v = values[f.key];
    if (f.type === 'intList') return [f.key, Array.isArray(v) ? v.join(',') : String(v ?? '')];
    if (f.type === 'bool') return [f.key, Boolean(v)];
    return [f.key, v == null ? '' : String(v)];
  }));
}
