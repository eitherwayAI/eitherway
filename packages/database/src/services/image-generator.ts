import OpenAI from 'openai';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { DatabaseClient } from '../client.js';
import { ImageJobsRepository, ImageAssetsRepository } from '../repositories/images.js';

export interface ImageGenerationOptions {
  prompt: string;
  model?: 'dall-e-3' | 'dall-e-2';
  size?: '1024x1024' | '1792x1024' | '1024x1792' | '256x256' | '512x512';
  quality?: 'standard' | 'hd';
  n?: number;
  sessionId?: string;
  appId?: string;
}

export class ImageGenerationService {
  private openai: OpenAI;
  private jobsRepo: ImageJobsRepository;
  private assetsRepo: ImageAssetsRepository;

  constructor(db: DatabaseClient, openaiApiKey?: string) {
    this.openai = new OpenAI({
      apiKey: openaiApiKey || process.env.OPENAI_API_KEY,
    });
    this.jobsRepo = new ImageJobsRepository(db);
    this.assetsRepo = new ImageAssetsRepository(db);
  }

  async generateImage(options: ImageGenerationOptions): Promise<string> {
    const job = await this.jobsRepo.create(options.prompt, options.model || 'dall-e-3', {
      sessionId: options.sessionId,
      appId: options.appId,
      size: options.size || '1024x1024',
      n: options.n || 1,
    });

    this.processJobAsync(job.id, options).catch((error) => {
      console.error(`Background image generation failed for job ${job.id}:`, error);
    });

    return job.id;
  }

  private async processJobAsync(jobId: string, options: ImageGenerationOptions): Promise<void> {
    try {
      await this.jobsRepo.markStarted(jobId);

      const response = await this.openai.images.generate({
        model: options.model || 'dall-e-3',
        prompt: options.prompt,
        n: options.n || 1,
        size: options.size || '1024x1024',
        quality: options.quality || 'standard',
        response_format: 'b64_json',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No image data returned from OpenAI');
      }

      const assets: Array<{ bytes: Buffer; mimeType: string; width: number; height: number }> = [];

      for (let i = 0; i < response.data.length; i++) {
        const imageData = response.data[i];

        if (!imageData.b64_json) {
          throw new Error(`No b64_json data for image ${i}`);
        }

        const bytes = Buffer.from(imageData.b64_json, 'base64');

        const { mimeType, isValid } = this.sniffImageMimeType(bytes);
        if (!isValid) {
          throw new Error(`Invalid image data for position ${i}: unrecognized format`);
        }

        let width: number;
        let height: number;
        try {
          const metadata = await sharp(bytes).metadata();
          if (!metadata.width || !metadata.height) {
            throw new Error('Failed to extract image dimensions');
          }
          width = metadata.width;
          height = metadata.height;

          await sharp(bytes).toBuffer();
        } catch (error: any) {
          throw new Error(`Image validation failed for position ${i}: ${error.message}`);
        }

        const checksum = createHash('sha256').update(bytes).digest();

        await this.assetsRepo.create(jobId, i, mimeType, bytes, {
          checksum,
          width,
          height,
        });

        assets.push({
          bytes,
          mimeType,
          width,
          height,
        });
      }

      await this.jobsRepo.markSucceeded(jobId);
    } catch (error: any) {
      console.error(`Image generation failed for job ${jobId}:`, error);
      await this.jobsRepo.markFailed(jobId, {
        message: error.message,
        stack: error.stack,
        code: error.code,
      });
      throw error;
    }
  }

  private sniffImageMimeType(bytes: Buffer): { mimeType: string; isValid: boolean } {
    if (bytes.length < 4) {
      return { mimeType: 'application/octet-stream', isValid: false };
    }

    const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (isPNG) {
      return { mimeType: 'image/png', isValid: true };
    }

    const isJPEG = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (isJPEG) {
      const hasJPEGEnd = bytes.length >= 2 &&
                        bytes[bytes.length - 2] === 0xff &&
                        bytes[bytes.length - 1] === 0xd9;
      return { mimeType: 'image/jpeg', isValid: hasJPEGEnd };
    }

    const isWEBP = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    if (isWEBP) {
      return { mimeType: 'image/webp', isValid: true };
    }

    return { mimeType: 'application/octet-stream', isValid: false };
  }

  async getJobStatus(jobId: string): Promise<{
    job: any;
    assets: Array<Omit<any, 'bytes'>>;
  }> {
    const job = await this.jobsRepo.findById(jobId);
    if (!job) {
      throw new Error(`Image job ${jobId} not found`);
    }

    const assets = await this.assetsRepo.findByJobWithoutBytes(jobId);

    return { job, assets };
  }

  async getAsset(assetId: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const asset = await this.assetsRepo.findById(assetId);
    if (!asset || !asset.bytes) {
      return null;
    }

    return {
      bytes: asset.bytes,
      mimeType: asset.mime_type,
    };
  }

  async pollJobUntilComplete(
    jobId: string,
    timeoutMs = 60000,
    pollIntervalMs = 1000
  ): Promise<{ job: any; assets: Array<Omit<any, 'bytes'>> }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getJobStatus(jobId);

      if (status.job.state === 'succeeded' || status.job.state === 'failed') {
        return status;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Image generation timed out after ${timeoutMs}ms`);
  }
}
