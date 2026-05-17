import type { SelectHTMLAttributes } from 'react';

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: readonly string[] | string[];
};

export function Select({ label, options, className = '', id, ...rest }: Props) {
  const selectId = id ?? `sel-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={selectId} className="block">
      <span className="block text-xs font-medium text-slate-400 mb-1">{label}</span>
      <select
        id={selectId}
        {...rest}
        className={`w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-3 text-slate-100 focus:border-brand-accent focus:outline-none ${className}`}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
