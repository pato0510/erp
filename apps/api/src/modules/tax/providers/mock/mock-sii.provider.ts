import { DocumentDirection, DocumentType, TaxDocumentStatus } from '@prisma/client';
import { ISiiProvider, SiiPeriod, TaxDocumentResult } from '../sii-provider.interface';

const RECEIVERS = [
  { rut: '76.543.210-K', name: 'COMERCIAL LOS ALERCES SPA' },
  { rut: '96.789.012-3', name: 'RETAIL SANTIAGO S.A.' },
  { rut: '77.444.333-2', name: 'CONSTRUCTORA ANDES LIMITADA' },
  { rut: '78.111.222-3', name: 'DISTRIBUIDORA NORTE SUR SPA' },
  { rut: '96.222.111-4', name: 'SUPERMERCADOS UNIDOS S.A.' },
  { rut: '77.888.777-6', name: 'INVERSIONES PACIFICO LTDA' },
  { rut: '76.333.444-5', name: 'GRUPO INDUSTRIAL METROPOLITANO SPA' },
  { rut: '96.555.666-7', name: 'HOLDING EMPRESARIAL CHILENO S.A.' },
];

const SUPPLIERS = [
  { rut: '76.111.000-1', name: 'PROVEEDOR TECNOLOGIA SPA' },
  { rut: '77.222.000-2', name: 'SERVICIOS GENERALES LTDA' },
  { rut: '96.333.000-3', name: 'ARRIENDOS COMERCIALES S.A.' },
  { rut: '78.444.000-4', name: 'SUMINISTROS INDUSTRIALES SPA' },
  { rut: '76.555.000-5', name: 'LOGISTICA Y TRANSPORTE LTDA' },
  { rut: '96.666.000-6', name: 'TELEFONICA CHILE S.A.' },
  { rut: '77.777.000-7', name: 'ENERGIA ELECTRICA NACIONAL S.A.' },
  { rut: '78.888.000-8', name: 'AGUAS METROPOLITANAS SPA' },
  { rut: '76.999.000-9', name: 'CONSULTORIA LEGAL CHILE LTDA' },
  { rut: '96.101.010-1', name: 'PROVEEDOR OFICINA Y PAPELERIA SPA' },
];

const COMPANY_RUT = '76.123.456-7';
const COMPANY_NAME = 'EXCELSIA DEMO SPA';

// Deterministic PRNG so same (period) → same documents → idempotency.
function seeded(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function periodSeed(period: SiiPeriod, salt = 0): number {
  return period.year * 10000 + period.month * 100 + salt;
}

function randomDayInMonth(period: SiiPeriod, seed: number): Date {
  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  const day = Math.max(1, Math.min(daysInMonth, Math.floor(seeded(seed) * daysInMonth) + 1));
  return new Date(period.year, period.month - 1, day);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class MockSiiProvider implements ISiiProvider {
  async getEmitidos(_credentials: unknown, period: SiiPeriod): Promise<TaxDocumentResult[]> {
    const base = periodSeed(period, 1);
    // 3-8 documents per month, deterministic.
    const count = 3 + Math.floor(seeded(base) * 6);
    const startFolio = 1001 + ((period.year - 2026) * 12 + (period.month - 1)) * 20;

    const results: TaxDocumentResult[] = [];
    for (let i = 0; i < count; i++) {
      const folio = startFolio + i;
      const receiver = RECEIVERS[Math.floor(seeded(base + i * 7) * RECEIVERS.length)];
      const netAmount = round2(500000 + seeded(base + i * 11) * 4500000);
      const taxAmount = round2(netAmount * 0.19);
      const totalAmount = round2(netAmount + taxAmount);

      results.push({
        type: DocumentType.FACTURA_ELECTRONICA,
        direction: DocumentDirection.EMITIDO,
        folio,
        issuerRut: COMPANY_RUT,
        issuerName: COMPANY_NAME,
        receiverRut: receiver.rut,
        receiverName: receiver.name,
        issueDate: randomDayInMonth(period, base + i * 13),
        netAmount,
        taxAmount,
        totalAmount,
        status: TaxDocumentStatus.ACCEPTED,
        externalId: `SII-EMI-${period.year}${String(period.month).padStart(2, '0')}-${folio}`,
        metadata: { provider: 'mock-sii', period },
      });
    }

    return results;
  }

  async getRecibidos(_credentials: unknown, period: SiiPeriod): Promise<TaxDocumentResult[]> {
    const base = periodSeed(period, 2);
    const count = 5 + Math.floor(seeded(base) * 6); // 5-10 docs
    const startFolio = 500001 + ((period.year - 2026) * 12 + (period.month - 1)) * 50;

    const results: TaxDocumentResult[] = [];
    for (let i = 0; i < count; i++) {
      const folio = startFolio + i;
      const supplier = SUPPLIERS[Math.floor(seeded(base + i * 5) * SUPPLIERS.length)];
      const type =
        seeded(base + i * 9) > 0.3
          ? DocumentType.FACTURA_ELECTRONICA
          : DocumentType.BOLETA_ELECTRONICA;

      const netBase =
        type === DocumentType.BOLETA_ELECTRONICA
          ? 30000 + seeded(base + i * 17) * 470000 // 30K–500K for services
          : 200000 + seeded(base + i * 19) * 2800000; // 200K–3M for supplier invoices

      const netAmount = round2(netBase);
      const taxAmount = round2(netAmount * 0.19);
      const totalAmount = round2(netAmount + taxAmount);

      results.push({
        type,
        direction: DocumentDirection.RECIBIDO,
        folio,
        issuerRut: supplier.rut,
        issuerName: supplier.name,
        receiverRut: COMPANY_RUT,
        receiverName: COMPANY_NAME,
        issueDate: randomDayInMonth(period, base + i * 23),
        netAmount,
        taxAmount,
        totalAmount,
        status: TaxDocumentStatus.ACCEPTED,
        externalId: `SII-REC-${period.year}${String(period.month).padStart(2, '0')}-${folio}`,
        metadata: { provider: 'mock-sii', period },
      });
    }

    return results;
  }

  async getDocumentXml(_credentials: unknown, folio: number, type: DocumentType): Promise<string> {
    return `<?xml version="1.0" encoding="UTF-8"?>
<DTE version="1.0">
  <Documento ID="MOCK-${type}-${folio}">
    <Encabezado>
      <IdDoc>
        <TipoDTE>${this.typeToSiiCode(type)}</TipoDTE>
        <Folio>${folio}</Folio>
      </IdDoc>
    </Encabezado>
  </Documento>
</DTE>`;
  }

  async validateRut(): Promise<boolean> {
    return true;
  }

  getProviderName(): string {
    return 'mock-sii';
  }

  private typeToSiiCode(type: DocumentType): number {
    switch (type) {
      case DocumentType.FACTURA_ELECTRONICA:
        return 33;
      case DocumentType.FACTURA_NO_AFECTA:
        return 34;
      case DocumentType.BOLETA_ELECTRONICA:
        return 39;
      case DocumentType.LIQUIDACION_FACTURA:
        return 43;
      case DocumentType.NOTA_DEBITO:
        return 56;
      case DocumentType.NOTA_CREDITO:
        return 61;
      default:
        return 0;
    }
  }
}
