import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import {
  createDatabaseClient,
  DatabaseClient,
  ImageGenerationService,
  ImageJobsRepository
} from '../index.js';

describe('Image Generation Pipeline Smoke Tests', () => {
  let db: DatabaseClient;
  let imageService: ImageGenerationService;
  let jobsRepo: ImageJobsRepository;

  beforeAll(async () => {
    db = createDatabaseClient();
    imageService = new ImageGenerationService(db);
    jobsRepo = new ImageJobsRepository(db);

    const healthy = await db.healthCheck();
    expect(healthy).toBe(true);
  });

  afterAll(async () => {
    await db.close();
  });

  it('should create an image generation job', async () => {
    const jobId = await imageService.generateImage({
      prompt: 'A small red cube on a white background',
      model: 'dall-e-3',
      size: '1024x1024',
      quality: 'standard',
      n: 1
    });

    expect(jobId).toBeDefined();

    const job = await jobsRepo.findById(jobId);
    expect(job).toBeDefined();
    expect(job?.state).toMatch(/queued|generating/);
    expect(job?.prompt).toBe('A small red cube on a white background');
  });

  it('should poll and complete an image generation job', { timeout: 90000 }, async () => {
    const jobId = await imageService.generateImage({
      prompt: 'A simple geometric shape',
      model: 'dall-e-3',
      size: '1024x1024',
      n: 1
    });

    const result = await imageService.pollJobUntilComplete(jobId, 60000);

    expect(result.job.state).toBe('succeeded');
    expect(result.assets).toHaveLength(1);

    const asset = result.assets[0];
    expect(asset.mime_type).toMatch(/image\/(png|jpeg)/);
    expect(asset.width).toBe(1024);
    expect(asset.height).toBe(1024);

    const fullAsset = await imageService.getAsset(asset.id);
    expect(fullAsset).toBeDefined();
    expect(fullAsset?.bytes).toBeInstanceOf(Buffer);
    expect(fullAsset?.bytes.length).toBeGreaterThan(0);

    const isPNG = fullAsset!.bytes[0] === 0x89 &&
                  fullAsset!.bytes[1] === 0x50 &&
                  fullAsset!.bytes[2] === 0x4E &&
                  fullAsset!.bytes[3] === 0x47;

    const isJPEG = fullAsset!.bytes[0] === 0xFF &&
                   fullAsset!.bytes[1] === 0xD8;

    expect(isPNG || isJPEG).toBe(true);
  });

  it('should verify image bytes are not corrupted', { timeout: 90000 }, async () => {
    const jobId = await imageService.generateImage({
      prompt: 'A blue square',
      model: 'dall-e-3',
      size: '1024x1024'
    });

    const result = await imageService.pollJobUntilComplete(jobId, 60000);

    expect(result.job.state).toBe('succeeded');

    const fullAsset = await imageService.getAsset(result.assets[0].id);
    expect(fullAsset).toBeDefined();

    const bytes = fullAsset!.bytes;

    const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;

    if (isPNG) {
      const hasIENDChunk = bytes.includes(Buffer.from('IEND'));
      expect(hasIENDChunk).toBe(true);
    } else {
      const isJPEG = bytes[0] === 0xFF && bytes[1] === 0xD8;
      expect(isJPEG).toBe(true);

      const hasEOI = bytes[bytes.length - 2] === 0xFF && bytes[bytes.length - 1] === 0xD9;
      expect(hasEOI).toBe(true);
    }

    expect(result.assets[0].checksum).toBeDefined();
    expect(result.assets[0].checksum).toBeInstanceOf(Buffer);
  });

  it('should handle job state transitions', async () => {
    const job = await jobsRepo.create(
      'Test prompt',
      'dall-e-3',
      { size: '1024x1024', n: 1 }
    );

    expect(job.state).toBe('queued');

    const started = await jobsRepo.markStarted(job.id);
    expect(started.state).toBe('generating');
    expect(started.started_at).toBeDefined();

    const succeeded = await jobsRepo.markSucceeded(job.id);
    expect(succeeded.state).toBe('succeeded');
    expect(succeeded.finished_at).toBeDefined();
  });

  it('should handle job failures', async () => {
    const job = await jobsRepo.create(
      'Test failure',
      'dall-e-3'
    );

    const failed = await jobsRepo.markFailed(job.id, {
      message: 'Test error',
      code: 'TEST_ERROR'
    });

    expect(failed.state).toBe('failed');
    expect(failed.error).toBeDefined();
    expect(failed.error?.message).toBe('Test error');
  });
});
