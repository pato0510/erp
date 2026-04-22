import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { StorageService } from '../common/storage/storage.service';
import { LibreDteClient } from './libredte.client';

const MAX_CERT_BYTES = 1 * 1024 * 1024; // 1MB
const PFX_ALLOWED_MIMETYPES = [
  'application/x-pkcs12',
  'application/pkcs12',
  'application/octet-stream',
];
const AES_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

@Injectable()
export class SiiConnectionService {
  private readonly logger = new Logger(SiiConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storage: StorageService,
    private readonly libredte: LibreDteClient,
  ) {}

  async uploadCertificate(
    companyId: string,
    userId: string,
    file: Express.Multer.File | undefined,
    password: string,
    rut: string,
  ) {
    if (!file) throw new BadRequestException('Certificate file is required');
    if (!password) throw new BadRequestException('Certificate password is required');
    if (!rut || !rut.trim()) throw new BadRequestException('RUT is required');

    this.validatePfx(file);

    const bucket = process.env.SII_CERT_BUCKET || 'excelsia-documents';
    const key = `sii/${companyId}/certificate.pfx`;

    // Prefer MinIO/S3 when configured. If the endpoint isn't set or the upload
    // throws (network, missing bucket, auth), persist the bytes in Postgres as
    // a fallback so deployments without object storage still work end-to-end.
    let storedPath: string | null = null;
    let storedData: Uint8Array<ArrayBuffer> | null = null;
    let storedName: string | null = null;

    // Prisma's Bytes column input expects `Uint8Array<ArrayBuffer>`. Multer's
    // `file.buffer` is a Buffer over a possibly shared/sliced ArrayBufferLike,
    // which TS won't narrow. `Uint8Array.from(...)` allocates a fresh, plain
    // ArrayBuffer-backed copy that matches the expected type.
    const fileBytes: Uint8Array<ArrayBuffer> = Uint8Array.from(file.buffer);

    if (this.storage.isConfigured()) {
      try {
        await this.storage.uploadFile(bucket, key, file.buffer, 'application/x-pkcs12');
        storedPath = key;
      } catch (err) {
        this.logger.warn(
          `MinIO upload failed (${err instanceof Error ? err.message : err}); falling back to DB storage`,
        );
        storedData = fileBytes;
        storedName = file.originalname;
      }
    } else {
      this.logger.warn('MinIO not available, storing certificate in DB');
      storedData = fileBytes;
      storedName = file.originalname;
    }

    const encryptedPassword = this.encryptPassword(password);

    const connection = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.siiConnection.upsert({
        where: { companyId },
        update: {
          rut: rut.trim(),
          certificatePath: storedPath,
          certificateData: storedData,
          certificateName: storedName,
          certificatePasswordHash: encryptedPassword,
          lastErrorMessage: null,
        },
        create: {
          companyId,
          rut: rut.trim(),
          certificatePath: storedPath,
          certificateData: storedData,
          certificateName: storedName,
          certificatePasswordHash: encryptedPassword,
        },
      });
    });

    return { success: true, connectionId: connection.id };
  }

  /**
   * Loads the .pfx bytes for a company, preferring the DB-backed copy (which
   * is the fallback when MinIO is unavailable) and only fetching from MinIO
   * when nothing is stored locally.
   */
  private async loadCertificateBuffer(connection: {
    certificateData: Uint8Array | null;
    certificatePath: string | null;
  }): Promise<Buffer | null> {
    if (connection.certificateData) {
      return Buffer.isBuffer(connection.certificateData)
        ? connection.certificateData
        : Buffer.from(connection.certificateData);
    }
    if (!connection.certificatePath) return null;
    if (!this.storage.isConfigured()) {
      throw new BadRequestException(
        'Certificado almacenado en MinIO pero MinIO no está configurado',
      );
    }
    const bucket = process.env.SII_CERT_BUCKET || 'excelsia-documents';
    return this.storage.downloadFile(bucket, connection.certificatePath);
  }

  async testConnection(companyId: string, userId: string) {
    const connection = await this.prisma.siiConnection.findUnique({ where: { companyId } });
    if (!connection) throw new NotFoundException('SII connection not configured');
    const hasCertificate = Boolean(connection.certificatePath || connection.certificateData);
    if (!hasCertificate || !connection.certificatePasswordHash) {
      throw new BadRequestException('Certificate not uploaded yet');
    }

    // Ensure the encrypted password can still be decoded — if not, the stored
    // ciphertext is corrupt or APP_SECRET changed, and we should surface that.
    try {
      this.decryptPassword(connection.certificatePasswordHash);
    } catch (err) {
      this.logger.error(
        `Could not decrypt cert password for company=${companyId}: ${err instanceof Error ? err.message : err}`,
      );
      await this.updateStatus(
        companyId,
        userId,
        false,
        'No se pudo descifrar la contraseña del certificado',
      );
      return {
        isActive: false,
        message: 'No se pudo descifrar la contraseña del certificado',
      };
    }

    // Confirm the certificate bytes are reachable via either source. We don't
    // forward the buffer to the LibreDTE info endpoint (it only needs the API
    // hash/key), but exercising the loader here surfaces storage gaps before
    // a real sync run depends on it.
    try {
      const buffer = await this.loadCertificateBuffer(connection);
      if (!buffer) throw new Error('Certificate buffer is empty');
    } catch (err) {
      const message = `No se pudo cargar el certificado: ${err instanceof Error ? err.message : err}`;
      this.logger.error(`testConnection company=${companyId}: ${message}`);
      await this.updateStatus(companyId, userId, false, message);
      return { isActive: false, message };
    }

    try {
      await this.libredte.get(`/dte/contribuyentes/info/${encodeURIComponent(connection.rut)}`);
      await this.updateStatus(companyId, userId, true, null);
      return { isActive: true, message: 'Conexión exitosa con LibreDTE' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de conexión';
      this.logger.warn(`testConnection company=${companyId}: ${message}`);
      await this.updateStatus(companyId, userId, false, message);
      return { isActive: false, message };
    }
  }

  async getConnection(companyId: string) {
    const connection = await this.prisma.siiConnection.findUnique({
      where: { companyId },
      // Never return certificateData (potentially huge) or the encrypted
      // password to clients. We only expose existence flags.
      select: {
        id: true,
        rut: true,
        certificatePath: true,
        certificateName: true,
        isActive: true,
        lastSyncAt: true,
        lastErrorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!connection) return null;

    // Probe certificateData existence without pulling the bytes over the wire.
    const certificateDataPresent = await this.prisma.siiConnection.count({
      where: { companyId, certificateData: { not: null } },
    });

    return {
      id: connection.id,
      rut: connection.rut,
      hasCertificate: Boolean(connection.certificatePath) || certificateDataPresent > 0,
      certificateSource: connection.certificatePath
        ? ('minio' as const)
        : certificateDataPresent > 0
          ? ('database' as const)
          : null,
      certificateName: connection.certificateName,
      isActive: connection.isActive,
      lastSyncAt: connection.lastSyncAt,
      lastErrorMessage: connection.lastErrorMessage,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  private async updateStatus(
    companyId: string,
    userId: string,
    isActive: boolean,
    lastErrorMessage: string | null,
  ) {
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.siiConnection.update({
        where: { companyId },
        data: { isActive, lastErrorMessage, lastSyncAt: new Date() },
      });
    });
  }

  private validatePfx(file: Express.Multer.File) {
    if (file.size > MAX_CERT_BYTES) {
      throw new BadRequestException('El certificado supera 1MB');
    }
    if (!PFX_ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo inválido (${file.mimetype}). Se espera .pfx/.p12`,
      );
    }
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!ext || !['pfx', 'p12'].includes(ext)) {
      throw new BadRequestException(`Extensión inválida (.${ext}). Se acepta .pfx o .p12`);
    }
    // PKCS#12 always starts with an ASN.1 SEQUENCE marker (0x30). This is a
    // cheap sanity check that rejects arbitrary non-PFX payloads renamed to
    // `.pfx` without pulling in a full ASN.1 parser.
    if (file.buffer.length < 4 || file.buffer[0] !== 0x30) {
      throw new BadRequestException('El archivo no parece un PKCS#12 válido');
    }
  }

  private getEncryptionKey(): Buffer {
    const secret = process.env.APP_SECRET;
    if (!secret || secret.length < 16) {
      throw new InternalServerErrorException(
        'APP_SECRET no configurado (mínimo 16 caracteres) — no se puede cifrar el certificado',
      );
    }
    // Derive a fixed 32-byte key from APP_SECRET via SHA-256 so the caller
    // doesn't have to worry about env-var length.
    return createHash('sha256').update(secret).digest();
  }

  private encryptPassword(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(AES_ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  private decryptPassword(ciphertext: string): string {
    const key = this.getEncryptionKey();
    const raw = Buffer.from(ciphertext, 'base64');
    if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error('Ciphertext too short');
    }
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const data = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(AES_ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
