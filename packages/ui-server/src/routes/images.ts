import { FastifyInstance } from 'fastify';
import {
  ImageGenerationService,
  EventsRepository,
  DatabaseClient
} from '@eitherway/database';

export async function registerImageRoutes(fastify: FastifyInstance, db: DatabaseClient) {
  const imageService = new ImageGenerationService(db);
  const eventsRepo = new EventsRepository(db);

  fastify.post<{
    Body: {
      prompt: string;
      model?: 'dall-e-3' | 'dall-e-2';
      size?: '1024x1024' | '1792x1024' | '1024x1792' | '256x256' | '512x512';
      quality?: 'standard' | 'hd';
      n?: number;
      sessionId?: string;
      appId?: string;
    }
  }>('/api/images/generate', async (request, reply) => {
    const options = request.body;

    const jobId = await imageService.generateImage(options);

    await eventsRepo.log('image.job.created', { jobId, prompt: options.prompt }, {
      sessionId: options.sessionId,
      appId: options.appId,
      actor: 'user'
    });

    return { jobId };
  });

  fastify.get<{
    Params: { jobId: string }
  }>('/api/images/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params;

    try {
      const status = await imageService.getJobStatus(jobId);
      return status;
    } catch (error: any) {
      return reply.code(404).send({ error: error.message });
    }
  });

  fastify.get<{
    Params: { assetId: string }
  }>('/api/images/assets/:assetId', async (request, reply) => {
    const { assetId } = request.params;

    const asset = await imageService.getAsset(assetId);

    if (!asset) {
      return reply.code(404).send({ error: 'Asset not found' });
    }

    reply.header('Content-Type', asset.mimeType);
    reply.header('Cache-Control', 'public, max-age=31536000');
    return reply.send(asset.bytes);
  });

  fastify.post<{
    Body: { jobId: string; timeoutMs?: number }
  }>('/api/images/poll', async (request, reply) => {
    const { jobId, timeoutMs = 60000 } = request.body;

    try {
      const result = await imageService.pollJobUntilComplete(jobId, timeoutMs);
      return result;
    } catch (error: any) {
      return reply.code(408).send({ error: error.message });
    }
  });
}
