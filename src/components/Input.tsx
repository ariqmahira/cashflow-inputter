import type { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function Input({ label, className = '', id, ...rest }: Props) {
  const inputId = id ?? `in-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={inputId} className="block">
      <span className="block text-xs font-medium text-slate-400 mb-1">{label}</span>
      <input
        id={inputId}
        {...rest}
        className={`w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-3 text-slate-100 placeholder-slate-500 focus:border-brand-accent focus:outline-none ${className}`}
      />
    </label>
  );
}
