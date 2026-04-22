import { Logger } from '@nestjs/common';
import { DocumentDirection, DocumentType, TaxDocumentStatus } from '@prisma/client';
import { ISiiProvider, SiiPeriod, TaxDocumentResult } from '../sii-provider.interface';

export interface BaseApiCredentials {
  rut?: string;
  password?: string;
}

/**
 * Maps SII's numeric document-type codes (TipoDTE) to our DocumentType enum.
 * Unknown codes fall back to FACTURA_ELECTRONICA rather than crashing the
 * whole sync — BaseAPI occasionally surfaces niche codes (e.g. settlement
 * invoices) that we'd rather import-but-mis-classify than drop silently.
 */
function mapDocumentType(codigo: number | string | undefined): DocumentType {
  const n = typeof codigo === 'string' ? parseInt(codigo, 10) : codigo;
  switch (n) {
    case 33:
      return DocumentType.FACTURA_ELECTRONICA;
    case 34:
      return DocumentType.FACTURA_NO_AFECTA;
    case 39:
      return DocumentType.BOLETA_ELECTRONICA;
    case 43:
      return DocumentType.LIQUIDACION_FACTURA;
    case 56:
      return DocumentType.NOTA_DEBITO;
    case 61:
      return DocumentType.NOTA_CREDITO;
    default:
      return DocumentType.FACTURA_ELECTRONICA;
  }
}

// Pick the first defined value across alternative field names. BaseAPI's
// responses mirror the SII's raw shape, so the same datum can arrive as
// `MntTotal`, `mntTotal`, `monto_total`, etc. — this lets us stay resilient
// without committing to one spelling.
function pick<T = unknown>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return undefined;
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function parseIssueDate(raw: unknown): Date {
  if (!raw) return new Date();
  const s = String(raw);
  // SII dates are frequently YYYY-MM-DD; JS `new Date(...)` handles that.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  // Some BaseAPI shapes emit DD-MM-YYYY or DD/MM/YYYY — try that too.
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return new Date();
}

function extractDocuments(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    // Most BaseAPI responses wrap the list in { success, data } or similar.
    for (const key of ['data', 'documentos', 'detalles', 'result', 'ventas', 'compras']) {
      const v = p[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

export class BaseApiSiiProvider implements ISiiProvider {
  private readonly logger = new Logger(BaseApiSiiProvider.name);

  private get baseUrl(): string {
    return (process.env.BASEAPI_BASE_URL || 'https://api.baseapi.cl/api/v1').replace(/\/+$/, '');
  }

  private resolveCredentials(credentials: unknown): { rut: string; password: string } {
    const envRut = process.env.SII_RUT;
    const envPassword = process.env.SII_PASSWORD;
    const creds = (credentials ?? {}) as BaseApiCredentials;
    const rut = creds.rut || envRut;
    const password = creds.password || envPassword;
    if (!rut || !password) {
      throw new Error(
        'BaseAPI: missing SII credentials (set SII_RUT and SII_PASSWORD env vars, or pass them explicitly)',
      );
    }
    return { rut, password };
  }

  async getEmitidos(credentials: unknown, period: SiiPeriod): Promise<TaxDocumentResult[]> {
    const { rut, password } = this.resolveCredentials(credentials);
    // BaseAPI puts the period and tipo in the URL path (not the body). `tipo`
    // is singular — `venta` for emitidos, `compra` for recibidos.
    const payload = await this.post(`/sii/rcv/${this.formatPeriod(period)}/venta`, {
      rut,
      password,
    });
    return extractDocuments(payload).map((row) =>
      this.mapRow(row, DocumentDirection.EMITIDO, rut, period),
    );
  }

  async getRecibidos(credentials: unknown, period: SiiPeriod): Promise<TaxDocumentResult[]> {
    const { rut, password } = this.resolveCredentials(credentials);
    const payload = await this.post(`/sii/rcv/${this.formatPeriod(period)}/compra`, {
      rut,
      password,
    });
    return extractDocuments(payload).map((row) =>
      this.mapRow(row, DocumentDirection.RECIBIDO, rut, period),
    );
  }

  async validateConnection(credentials: BaseApiCredentials = {}): Promise<{
    ok: boolean;
    message: string;
  }> {
    try {
      const { rut, password } = this.resolveCredentials(credentials);
      const res = await this.post('/sii/contribuyente/informacion', { rut, password });
      const success =
        res && typeof res === 'object' ? (res as Record<string, unknown>).success !== false : true;
      return {
        ok: Boolean(success),
        message: success ? 'Conexión exitosa con SII vía BaseAPI' : 'BaseAPI reportó un error',
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Error desconocido' };
    }
  }

  async validateRut(rut: string): Promise<boolean> {
    const res = await this.validateConnection({ rut });
    return res.ok;
  }

  async getDocumentXml(): Promise<string> {
    throw new Error('BaseAPI provider does not expose raw DTE XML — use PDF/JSON endpoints');
  }

  getProviderName(): string {
    return 'baseapi';
  }

  private formatPeriod(period: SiiPeriod): string {
    return `${period.year}-${String(period.month).padStart(2, '0')}`;
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const apiKey = process.env.BASEAPI_KEY;
    if (!apiKey) throw new Error('BASEAPI_KEY not configured');

    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
      });
    } catch (err) {
      this.logger.error(
        `BaseAPI connection failed POST ${path}: ${err instanceof Error ? err.message : err}`,
      );
      throw new Error('BaseAPI connection failed');
    }

    if (res.status === 401) {
      this.logger.warn(`BaseAPI 401 on POST ${path}`);
      throw new Error('Invalid BaseAPI credentials');
    }

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON error body — surface the raw text
      this.logger.warn(`BaseAPI POST ${path} → ${res.status} non-JSON body: ${text.slice(0, 300)}`);
      throw new Error(`BaseAPI ${res.status}: ${text.slice(0, 200) || res.statusText}`);
    }

    if (!res.ok) {
      const msg =
        (parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).message) ||
        res.statusText ||
        `HTTP ${res.status}`;
      this.logger.warn(`BaseAPI POST ${path} → ${res.status}: ${String(msg)}`);
      throw new Error(`BaseAPI ${res.status}: ${String(msg)}`);
    }

    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      if (p.success === false) {
        const msg = p.message || p.error || 'BaseAPI reportó error';
        this.logger.warn(`BaseAPI POST ${path} success=false: ${String(msg)}`);
        throw new Error(String(msg));
      }
    }

    return parsed;
  }

  private mapRow(
    row: Record<string, unknown>,
    direction: DocumentDirection,
    companyRut: string,
    period: SiiPeriod,
  ): TaxDocumentResult {
    const codigo = pick<number | string>(row, 'tipoDTE', 'TipoDoc', 'tipoDoc', 'codigo', 'tipo');
    const folioRaw = pick<number | string>(row, 'folio', 'FolioDoc', 'Folio');
    const folio = typeof folioRaw === 'number' ? folioRaw : parseInt(String(folioRaw ?? 0), 10);

    const counterpartyRut = String(
      pick(row, 'rutReceptor', 'RUTDoc', 'rutEmisor', 'RUTEmisor', 'rut', 'rutContraparte') ?? '',
    );
    const counterpartyName = String(
      pick(
        row,
        'razonSocial',
        'RznSoc',
        'rznSocRecep',
        'nombreRazonSocial',
        'razonSocialReceptor',
        'razonSocialEmisor',
      ) ?? 'Sin nombre',
    );

    const netAmount = toNumber(pick(row, 'mntNeto', 'MntNeto', 'netAmount', 'monto_neto'));
    const taxAmount = toNumber(pick(row, 'mntIVA', 'MntIVA', 'iva', 'taxAmount', 'monto_iva'));
    const totalAmount = toNumber(
      pick(row, 'mntTotal', 'MntTotal', 'totalAmount', 'monto_total', 'total'),
    );

    const issueDate = parseIssueDate(pick(row, 'fchEmis', 'FchEmis', 'fechaEmision', 'fecha'));
    const type = mapDocumentType(codigo);

    const issuerRut = direction === DocumentDirection.EMITIDO ? companyRut : counterpartyRut;
    const issuerName =
      direction === DocumentDirection.EMITIDO
        ? String(pick(row, 'rznSocEmisor', 'razonSocialEmisor') ?? counterpartyName)
        : counterpartyName;
    const receiverRut = direction === DocumentDirection.EMITIDO ? counterpartyRut : companyRut;
    const receiverName =
      direction === DocumentDirection.EMITIDO
        ? counterpartyName
        : String(pick(row, 'rznSocRecep', 'razonSocialReceptor') ?? counterpartyName);

    return {
      type,
      direction,
      folio: Number.isFinite(folio) ? folio : 0,
      issuerRut,
      issuerName,
      receiverRut,
      receiverName,
      issueDate,
      netAmount,
      taxAmount,
      totalAmount: totalAmount || netAmount + taxAmount,
      status: TaxDocumentStatus.ACCEPTED,
      externalId: `BASEAPI-${direction}-${period.year}${String(period.month).padStart(2, '0')}-${type}-${folio}`,
      metadata: { provider: 'baseapi', raw: row },
    };
  }
}
