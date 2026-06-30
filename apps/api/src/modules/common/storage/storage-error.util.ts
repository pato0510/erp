/**
 * Formats an S3 / MinIO / Cloudflare R2 error for logging so the REAL failure
 * reason is visible instead of empty parens. AWS SDK v3 errors (the SDK this
 * project uses, @aws-sdk/client-s3) carry `name` and `message`, and service
 * errors additionally expose a string `Code` (e.g. `SignatureDoesNotMatch`,
 * `NoSuchBucket`, `AccessDenied`) plus `$metadata.httpStatusCode`.
 *
 * NEVER include credentials — only error identity/status fields are read.
 */
export function formatStorageError(err: unknown): string {
  if (err instanceof Error) {
    const parts: string[] = [`${err.name}: ${err.message || '(no message)'}`];
    const awsErr = err as { Code?: string; $metadata?: { httpStatusCode?: number } };
    if (awsErr.Code) parts.push(`Code=${awsErr.Code}`);
    if (awsErr.$metadata?.httpStatusCode) {
      parts.push(`httpStatus=${awsErr.$metadata.httpStatusCode}`);
    }
    return parts.join(' ');
  }
  return String(err);
}
