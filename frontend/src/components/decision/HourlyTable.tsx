import type { DecisionPoint } from '../../api/types';
import { fmtGW, fmtSignedPower, fmtUtcDateTime, fmtUtcTime } from '../../lib/format';

/** The chart's data as a table: the accessible, exact-value view of the decision day. */
export function HourlyTable({ points }: { points: DecisionPoint[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[640px] text-left text-[13px]">
        <caption className="sr-only">Hourly forecast, P10/P90, actual and error for the delivery day</caption>
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">Hour (UTC)</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Forecast</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">P10</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">P90</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Actual</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Error (F − A)</th>
            <th scope="col" className="py-2 pr-3 font-medium">Run · lead</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => {
            const big = p.error !== null && p.p10 !== null && p.forecast !== null && p.error > p.forecast - p.p10;
            return (
              <tr key={p.start_time} className="border-b border-line last:border-0 hover:bg-sunken">
                <th scope="row" className="py-1.5 pr-3 font-medium text-ink">{fmtUtcTime(p.start_time)}</th>
                <td className="py-1.5 pr-3 text-right text-ink">{fmtGW(p.forecast, 2)}</td>
                <td className="py-1.5 pr-3 text-right text-ink2">{fmtGW(p.p10, 2)}</td>
                <td className="py-1.5 pr-3 text-right text-ink2">{fmtGW(p.p90, 2)}</td>
                <td className="py-1.5 pr-3 text-right text-ink">{fmtGW(p.actual, 2)}</td>
                <td className="py-1.5 pr-3 text-right">
                  {big && <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-risk align-middle" />}
                  <span className={big ? 'font-semibold text-ink' : 'text-ink'}>{fmtSignedPower(p.error)}</span>
                  {big && <span className="sr-only"> (shortfall beyond P10)</span>}
                </td>
                <td className="py-1.5 pr-3 text-ink2">
                  {p.publish_time ? `${fmtUtcDateTime(p.publish_time)} · ${p.horizon_h?.toFixed(1)}h` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
