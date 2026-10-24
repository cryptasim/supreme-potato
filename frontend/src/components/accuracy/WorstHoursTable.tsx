import { Link } from 'react-router-dom';
import type { WorstHour } from '../../api/types';
import { fmtGW, fmtSignedPower, fmtUtcDateTime } from '../../lib/format';

/** Top-10 absolute misses, each linking to that delivery day on the Decision Desk. */
export function WorstHoursTable({ rows, cutoff }: { rows: WorstHour[]; cutoff: string | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[520px] text-left text-[13px]">
        <caption className="sr-only">Ten hours with the largest absolute forecast error</caption>
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">Hour (UTC)</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Forecast</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Actual</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Error (F − A)</th>
            <th scope="col" className="py-2 pr-3 font-medium">Direction</th>
            <th scope="col" className="py-2 font-medium"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const day = r.start_time.slice(0, 10);
            const href = `/?date=${day}${cutoff ? `&cutoff=${cutoff}` : ''}`;
            const short = r.error > 0;
            return (
              <tr key={r.start_time} className="border-b border-line last:border-0 hover:bg-sunken">
                <th scope="row" className="py-1.5 pr-3 font-medium text-ink">{fmtUtcDateTime(r.start_time)}</th>
                <td className="py-1.5 pr-3 text-right text-ink">{fmtGW(r.forecast, 2)}</td>
                <td className="py-1.5 pr-3 text-right text-ink">{fmtGW(r.actual, 2)}</td>
                <td className="py-1.5 pr-3 text-right font-semibold text-ink">{fmtSignedPower(r.error)}</td>
                <td className="py-1.5 pr-3 text-ink2">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className={`h-2 w-2 rounded-full ${short ? 'bg-risk' : 'bg-metric'}`} />
                    {short ? 'Wind short' : 'Wind surplus'}
                  </span>
                </td>
                <td className="py-1.5 text-right">
                  <Link to={href} className="text-xs font-medium text-ink2 underline decoration-line underline-offset-2 hover:text-ink">
                    Open day
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
