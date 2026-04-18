import { formatCLP } from '../../lib/formatters';

type ColorVariant = 'green' | 'yellow' | 'red' | 'orange' | 'blue' | 'gray';

const VARIANT_STYLES: Record<ColorVariant, { text: string; bg: string }> = {
  green: { text: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  yellow: { text: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
  red: { text: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  orange: { text: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  blue: { text: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  gray: { text: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' },
};

interface CashPositionCardProps {
  title: string;
  amount: number;
  color: ColorVariant;
  subtitle?: string;
}

export function CashPositionCard({ title, amount, color, subtitle }: CashPositionCardProps) {
  const style = VARIANT_STYLES[color];
  return (
    <div className={`rounded-xl border p-5 ${style.bg}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${style.text}`}>{formatCLP(amount)}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}
