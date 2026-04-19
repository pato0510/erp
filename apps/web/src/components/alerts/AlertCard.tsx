import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { formatRelativeDate } from '../../lib/formatters';

interface AlertCardProps {
  alert: {
    id: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    createdAt: string;
  };
  onDismiss: (id: string) => void;
}

const SEVERITY_CONFIG: Record<
  string,
  { icon: React.ElementType; bg: string; border: string; text: string; iconColor: string }
> = {
  CRITICAL: {
    icon: AlertCircle,
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    iconColor: 'text-red-500',
  },
  WARNING: {
    icon: AlertTriangle,
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    iconColor: 'text-yellow-500',
  },
  INFO: {
    icon: Info,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    iconColor: 'text-blue-500',
  },
};

export function AlertCard({ alert, onDismiss }: AlertCardProps) {
  const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.INFO;
  const Icon = config.icon;

  return (
    <div className={`${config.bg} ${config.border} border rounded-xl p-4 flex items-start gap-3`}>
      <Icon size={20} className={`${config.iconColor} mt-0.5 flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${config.text}`}>{alert.title}</p>
        <p className="text-sm text-gray-600 mt-0.5">{alert.message}</p>
        <p className="text-xs text-gray-400 mt-1">{formatRelativeDate(alert.createdAt)}</p>
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        className="p-1 rounded hover:bg-white/50 transition flex-shrink-0"
        title="Descartar"
      >
        <X size={16} className="text-gray-400" />
      </button>
    </div>
  );
}
