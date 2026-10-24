import type { Insight } from '../../lib/insights';

const TONE: Record<Insight['tone'], string> = {
  risk: 'bg-risk',
  neutral: 'bg-metric',
  good: 'bg-good',
};

export function InsightCallout({ insight }: { insight: Insight }) {
  return (
    <article className="flex min-w-0 gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
      <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TONE[insight.tone]}`} />
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-snug text-ink">{insight.headline}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink2">{insight.detail}</p>
      </div>
    </article>
  );
}
