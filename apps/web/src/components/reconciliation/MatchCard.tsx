'use client';

import { ArrowRight, Check, X, Landmark, Receipt, ArrowLeftRight } from 'lucide-react';
import { formatCLP, formatDate } from '../../lib/formatters';
import { ConfidenceBadge } from './ConfidenceBadge';

interface ExternalMovementRef {
  id: string;
  date: string;
  description: string;
  amount: string;
  type: string;
}

interface TaxDocumentRef {
  id: string;
  folio: number;
  type: string;
  direction: string;
  issueDate: string;
  issuerName: string;
  receiverName: string;
  totalAmount: string;
}

interface MovementRef {
  id: string;
  date: string;
  description: string;
  amount: string;
  type: string;
  status: string;
}

export interface MatchData {
  id: string;
  status: string;
  matchType: string;
  confidenceScore: string | number | null;
  amountDifference: string | number | null;
  externalMovement?: ExternalMovementRef | null;
  taxDocument?: TaxDocumentRef | null;
  movement?: MovementRef | null;
}

interface MatchCardProps {
  match: MatchData;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  isBusy?: boolean;
}

function BankPanel({ bank }: { bank: ExternalMovementRef }) {
  const amount = Math.abs(Number(bank.amount));
  return (
    <div className="flex-1 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-1">
        <Landmark size={12} /> Movimiento bancario
      </div>
      <div className="text-sm text-gray-900 truncate" title={bank.description}>
        {bank.description}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-500">{formatDate(bank.date)}</span>
        <span
          className={`text-sm font-semibold ${bank.type === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}
        >
          {bank.type === 'CREDIT' ? '+' : '-'}
          {formatCLP(amount)}
        </span>
      </div>
    </div>
  );
}

function TaxPanel({ doc }: { doc: TaxDocumentRef }) {
  const counterparty = doc.direction === 'EMITIDO' ? doc.receiverName : doc.issuerName;
  return (
    <div className="flex-1 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-1">
        <Receipt size={12} /> Documento tributario · Folio {doc.folio}
      </div>
      <div className="text-sm text-gray-900 truncate" title={counterparty}>
        {counterparty}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-500">{formatDate(doc.issueDate)}</span>
        <span className="text-sm font-semibold text-gray-900">{formatCLP(doc.totalAmount)}</span>
      </div>
    </div>
  );
}

function MovementPanel({ mov }: { mov: MovementRef }) {
  return (
    <div className="flex-1 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-1">
        <ArrowLeftRight size={12} /> Movimiento interno
      </div>
      <div className="text-sm text-gray-900 truncate" title={mov.description}>
        {mov.description}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-500">{formatDate(mov.date)}</span>
        <span
          className={`text-sm font-semibold ${mov.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}
        >
          {mov.type === 'INCOME' ? '+' : '-'}
          {formatCLP(mov.amount)}
        </span>
      </div>
    </div>
  );
}

export function MatchCard({ match, onConfirm, onReject, isBusy }: MatchCardProps) {
  const panels: React.ReactNode[] = [];
  if (match.externalMovement) panels.push(<BankPanel key="bank" bank={match.externalMovement} />);
  if (match.taxDocument) panels.push(<TaxPanel key="tax" doc={match.taxDocument} />);
  if (match.movement) panels.push(<MovementPanel key="mov" mov={match.movement} />);

  const diff = Number(match.amountDifference ?? 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ConfidenceBadge score={Number(match.confidenceScore)} />
          <span className="text-xs text-gray-400">{match.matchType}</span>
        </div>
        {diff > 0 && (
          <span className="text-xs font-medium text-red-500">Diferencia: {formatCLP(diff)}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {panels.map((panel, idx) => (
          <div key={idx} className="flex items-center gap-3 flex-1">
            {panel}
            {idx < panels.length - 1 && (
              <ArrowRight size={16} className="text-gray-300 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-end mt-4">
        <button
          onClick={() => onReject(match.id)}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition"
        >
          <X size={14} /> Rechazar
        </button>
        <button
          onClick={() => onConfirm(match.id)}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
        >
          <Check size={14} /> Confirmar
        </button>
      </div>
    </div>
  );
}
