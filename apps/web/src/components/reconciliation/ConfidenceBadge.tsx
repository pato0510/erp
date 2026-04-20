'use client';

export function ConfidenceBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        —
      </span>
    );
  }

  const pct = Math.round(Number(score) * 100);
  let cls: string;
  if (pct >= 80) cls = 'bg-green-100 text-green-700';
  else if (pct >= 50) cls = 'bg-yellow-100 text-yellow-700';
  else cls = 'bg-red-100 text-red-700';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}
    >
      {pct}% match
    </span>
  );
}
