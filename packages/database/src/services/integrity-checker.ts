import { DatabaseClient } from '../client.js';
import sharp from 'sharp';
import { createHash } from 'crypto';

export interface FileIntegrityResult {
  fileId: string;
  path: string;
  storedChecksum: string;
  computedChecksum: string;
  matches: boolean;
  error?: string;
}

export interface ImageIntegrityResult {
  assetId: string;
  jobId: string;
  mimeType: string;
  hasValidMagicBytes: boolean;
  hasValidEOF: boolean;
  checksumValid: boolean;
  dimensionsValid: boolean;
  error?: string;
}

export class IntegrityChecker {
  constructor(private db: DatabaseClient) {}

  async verifyFileChecksums(appId?: string): Promise<FileIntegrityResult[]> {
    const result = await this.db.query<{
      file_id: string;
      path: string;
      stored_checksum: Buffer;
      computed_checksum: Buffer;
      matches: boolean;
    }>(
      `SELECT * FROM core.verify_file_checksums($1)`,
      [appId ?? null]
    );

    return result.rows.map(row => ({
      fileId: row.file_id,
      path: row.path,
      storedChecksum: row.stored_checksum.toString('hex'),
      computedChecksum: row.computed_checksum.toString('hex'),
      matches: row.matches
    }));
  }

  async verifyImageIntegrity(jobId?: string): Promise<ImageIntegrityResult[]> {
    const result = await this.db.query<{
      asset_id: string;
      job_id: string;
      mime_type: string;
      has_valid_magic_bytes: boolean;
      has_valid_eof: boolean;
      checksum_valid: boolean;
    }>(
      `SELECT * FROM core.verify_image_integrity($1)`,
      [jobId ?? null]
    );

    const results: ImageIntegrityResult[] = [];

    for (const row of result.rows) {
      try {
        const assetResult = await this.db.query<{ bytes: Buffer; width: number; height: number }>(
          `SELECT bytes, width, height FROM core.image_assets WHERE id = $1`,
          [row.asset_id]
        );

        const asset = assetResult.rows[0];
        let dimensionsValid = false;

        if (asset && asset.bytes) {
          try {
            const metadata = await sharp(asset.bytes).metadata();
            dimensionsValid = metadata.width === asset.width && metadata.height === asset.height;
          } catch {
            dimensionsValid = false;
          }
        }

        results.push({
          assetId: row.asset_id,
          jobId: row.job_id,
          mimeType: row.mime_type,
          hasValidMagicBytes: row.has_valid_magic_bytes,
          hasValidEOF: row.has_valid_eof,
          checksumValid: row.checksum_valid,
          dimensionsValid
        });
      } catch (error: any) {
        results.push({
          assetId: row.asset_id,
          jobId: row.job_id,
          mimeType: row.mime_type,
          hasValidMagicBytes: row.has_valid_magic_bytes,
          hasValidEOF: row.has_valid_eof,
          checksumValid: row.checksum_valid,
          dimensionsValid: false,
          error: error.message
        });
      }
    }

    return results;
  }

  async runFullIntegrityCheck(appId?: string): Promise<{
    files: FileIntegrityResult[];
    images: ImageIntegrityResult[];
    summary: {
      totalFiles: number;
      validFiles: number;
      totalImages: number;
      validImages: number;
    };
  }> {
    const files = await this.verifyFileChecksums(appId);
    const images = await this.verifyImageIntegrity();

    const validFiles = files.filter(f => f.matches).length;
    const validImages = images.filter(i =>
      i.hasValidMagicBytes && i.hasValidEOF && i.checksumValid && i.dimensionsValid
    ).length;

    return {
      files,
      images,
      summary: {
        totalFiles: files.length,
        validFiles,
        totalImages: images.length,
        validImages
      }
    };
  }

  async repairFileChecksum(fileId: string): Promise<boolean> {
    const result = await this.db.query<{ content_text: string; content_bytes: Buffer }>(
      `SELECT fv.content_text, fv.content_bytes
       FROM core.files f
       JOIN core.file_versions fv ON f.head_version_id = fv.id
       WHERE f.id = $1`,
      [fileId]
    );

    const version = result.rows[0];
    if (!version) return false;

    const content = version.content_text
      ? Buffer.from(version.content_text, 'utf-8')
      : version.content_bytes;

    if (!content) return false;

    const correctChecksum = createHash('sha256').update(content).digest();

    await this.db.query(
      `UPDATE core.files SET sha256 = $2 WHERE id = $1`,
      [fileId, correctChecksum]
    );

    return true;
  }
}
