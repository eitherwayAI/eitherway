import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@eitherway/database';
import { NFTService } from '@eitherway/database';
import type { NFTAttribute } from '@eitherway/database';

export async function registerIPFSRoutes(fastify: FastifyInstance, db: DatabaseClient) {
  const nftService = new NFTService();

  fastify.post('/api/ipfs/upload-image', async (request, reply) => {
    try {
      const data = await (request as any).file();
      if (!data) {
        return reply.code(400).send({ success: false, error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      const filename = data.filename;

      const validImageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
      const isValidImage = validImageTypes.some((ext) => filename.toLowerCase().endsWith(ext));

      if (!isValidImage) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid file type. Only images (jpg, png, gif, svg, webp) are allowed',
        });
      }

      const result = await nftService.getPinataService().uploadImage(buffer, filename);

      return reply.send(result);
    } catch (error) {
      fastify.log.error({ error }, 'Error uploading image to IPFS');
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error uploading image',
      });
    }
  });

  fastify.post<{
    Body: {
      name: string;
      description: string;
      image: string;
      attributes?: NFTAttribute[];
      externalUrl?: string;
    };
  }>('/api/ipfs/upload-metadata', async (request, reply) => {
    try {
      const { name, description, image, attributes, externalUrl } = request.body;

      if (!name || !description || !image) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required fields: name, description, image',
        });
      }

      const metadata = {
        name,
        description,
        image,
        attributes,
        external_url: externalUrl,
      };

      const result = await nftService.getPinataService().uploadMetadata(metadata);

      return reply.send(result);
    } catch (error) {
      fastify.log.error({ error }, 'Error uploading metadata to IPFS');
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error uploading metadata',
      });
    }
  });

  fastify.post('/api/ipfs/create-nft-asset', async (request, reply) => {
    try {
      // Parse multipart form data with file + text fields
      const parts = (request as any).parts();
      let fileBuffer: Buffer | null = null;
      let filename: string | null = null;
      let nftName: string | null = null;
      let nftDescription: string | null = null;
      let attributes: NFTAttribute[] | undefined;

      for await (const part of parts) {
        if (part.type === 'file') {
          // Handle file upload
          fileBuffer = await part.toBuffer();
          filename = part.filename;
        } else {
          // Handle text field
          const fieldValue = (part as any).value;

          if (part.fieldname === 'nftName') {
            nftName = fieldValue;
          } else if (part.fieldname === 'nftDescription') {
            nftDescription = fieldValue;
          } else if (part.fieldname === 'attributes') {
            try {
              attributes = JSON.parse(fieldValue);
            } catch (e) {
              return reply.code(400).send({
                success: false,
                error: 'Invalid attributes JSON',
              });
            }
          }
        }
      }

      // Validate required fields
      if (!fileBuffer || !filename) {
        return reply.code(400).send({ success: false, error: 'No file uploaded' });
      }

      if (!nftName || !nftDescription) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required fields: nftName, nftDescription',
        });
      }

      const result = await nftService.createNFTAsset({
        imageBuffer: fileBuffer,
        imageName: filename,
        nftName,
        nftDescription,
        attributes,
      });

      return reply.send(result);
    } catch (error) {
      fastify.log.error({ error }, 'Error creating NFT asset');
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating NFT asset',
      });
    }
  });

  fastify.post<{
    Body: {
      imageCID: string;
      nftName: string;
      nftDescription: string;
      attributes?: NFTAttribute[];
      externalUrl?: string;
    };
  }>('/api/ipfs/create-metadata', async (request, reply) => {
    try {
      const { imageCID, nftName, nftDescription, attributes, externalUrl } = request.body;

      if (!imageCID || !nftName || !nftDescription) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required fields: imageCID, nftName, nftDescription',
        });
      }

      const metadata = nftService.getPinataService().generateNFTMetadata({
        name: nftName,
        description: nftDescription,
        imageCID,
        attributes,
        externalUrl,
      });

      const result = await nftService.getPinataService().uploadMetadata(metadata);

      return reply.send(result);
    } catch (error) {
      fastify.log.error({ error }, 'Error creating metadata');
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating metadata',
      });
    }
  });

  fastify.get<{
    Params: {
      cid: string;
    };
  }>('/api/ipfs/:cid', async (request, reply) => {
    try {
      const { cid } = request.params;
      const gatewayUrl = nftService.getPinataService().getGatewayUrl(cid);

      const response = await fetch(gatewayUrl);
      if (!response.ok) {
        return reply.code(404).send({
          success: false,
          error: 'IPFS content not found',
        });
      }

      const contentType = response.headers.get('content-type');
      if (contentType) {
        reply.header('Content-Type', contentType);
      }

      const buffer = await response.arrayBuffer();
      return reply.send(Buffer.from(buffer));
    } catch (error) {
      fastify.log.error({ error }, 'Error fetching IPFS content');
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error fetching IPFS content',
      });
    }
  });
}
