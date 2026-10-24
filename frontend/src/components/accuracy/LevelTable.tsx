import type { ByLevel } from '../../api/types';
import { fmtPower, fmtSignedPower } from '../../lib/format';

/** Error by forecast level: absolute error grows with the amount of wind expected. */
export function LevelTable({ rows }: { rows: ByLevel[] }) {
  const maxMae = Math.max(1, ...rows.map((r) => r.mae));
  return (
    <table className="tabular w-full text-left text-[13px]">
      <caption className="sr-only">Error by forecast wind level</caption>
      <thead>
        <tr className="border-b border-line text-xs text-muted">
          <th scope="col" className="py-2 pr-3 font-medium">Forecast level</th>
          <th scope="col" className="py-2 pr-3 font-medium">MAE</th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">Bias</th>
          <th scope="col" className="py-2 text-right font-medium">Hours</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.bucket} className="border-b border-line last:border-0">
            <th scope="row" className="py-1.5 pr-3 font-medium text-ink">{r.bucket}</th>
            <td className="py-1.5 pr-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-24 shrink-0 rounded-full bg-sunken">
                  <div className="h-2 rounded-full bg-metric" style={{ width: `${(r.mae / maxMae) * 100}%` }} />
                </div>
                <span className="text-ink">{fmtPower(r.mae)}</span>
              </div>
            </td>
            <td className="py-1.5 pr-3 text-right text-ink2">{fmtSignedPower(r.bias)}</td>
            <td className="py-1.5 text-right text-ink2">{r.n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
