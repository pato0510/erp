import { DocumentDirection, DocumentType, TaxDocumentStatus } from '@prisma/client';

export interface SiiPeriod {
  year: number;
  month: number;
}

export interface TaxDocumentResult {
  type: DocumentType;
  direction: DocumentDirection;
  folio: number;
  issuerRut: string;
  issuerName: string;
  receiverRut: string;
  receiverName: string;
  issueDate: Date;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: TaxDocumentStatus;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

export interface ISiiProvider {
  getEmitidos(credentials: unknown, period: SiiPeriod): Promise<TaxDocumentResult[]>;
  getRecibidos(credentials: unknown, period: SiiPeriod): Promise<TaxDocumentResult[]>;
  getDocumentXml(credentials: unknown, folio: number, type: DocumentType): Promise<string>;
  validateRut(rut: string): Promise<boolean>;
  getProviderName(): string;
}
