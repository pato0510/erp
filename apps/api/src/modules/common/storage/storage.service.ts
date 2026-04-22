import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly logger = new Logger(StorageService.name);

  constructor() {
    this.s3 = new S3Client({
      endpoint: `http${process.env.MINIO_USE_SSL === 'true' ? 's' : ''}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_API_PORT || '9000'}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ROOT_USER || 'minioadmin',
        secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin',
      },
      forcePathStyle: true,
    });
  }

  /**
   * Whether MinIO/S3 looks usable. Without an endpoint the SDK builds a
   * malformed URL like `http://undefined:9000` that always errors out — we'd
   * rather fall back deterministically than wait for a network timeout.
   */
  isConfigured(): boolean {
    return Boolean(process.env.MINIO_ENDPOINT && process.env.MINIO_ENDPOINT.trim().length > 0);
  }

  async uploadFile(bucket: string, key: string, buffer: Buffer, mimetype: string): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      }),
    );
    this.logger.log(`Uploaded ${key} to ${bucket}`);
    return key;
  }

  async downloadFile(bucket: string, key: string): Promise<Buffer> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = res.Body;
    if (!body) throw new Error(`Empty body returned for ${bucket}/${key}`);
    if (body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    // Newer SDK builds expose a `transformToByteArray` helper — fall back to
    // it when the body is not a Node Readable (e.g. browser-like stream).
    const maybeArray = body as { transformToByteArray?: () => Promise<Uint8Array> };
    if (typeof maybeArray.transformToByteArray === 'function') {
      const bytes = await maybeArray.transformToByteArray();
      return Buffer.from(bytes);
    }
    throw new Error(`Unsupported S3 body type for ${bucket}/${key}`);
  }

  async getFileUrl(bucket: string, key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: 3600 });
  }
}
