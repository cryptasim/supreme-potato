import { useId } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
  title?: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
}

/** Accessible segmented control built on a native radio group (arrow keys work for free). */
export function Segmented<T extends string>({ label, value, options, onChange, hideLabel }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className={hideLabel ? 'sr-only' : 'mb-1 text-xs font-medium text-ink2'}>{label}</legend>
      <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5">
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              title={o.title}
              className={`relative cursor-pointer select-none rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 ${
                checked ? 'bg-surface text-ink shadow-card' : 'text-ink2 hover:text-ink'
              }`}
              style={{ outlineColor: 'var(--focus)' }}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
