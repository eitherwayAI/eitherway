import type { NFTMetadata, UploadImageResult, UploadMetadataResult } from '../types/nft';
import { Blob } from 'buffer';

export class PinataService {
  private jwt: string;
  private gatewayUrl: string = 'https://gateway.pinata.cloud';

  constructor() {
    this.jwt = process.env.PINATA_JWT || '';

    if (!this.jwt) {
      throw new Error('PINATA_JWT environment variable is required');
    }
  }

  async uploadImage(imageBuffer: Buffer, filename: string): Promise<UploadImageResult> {
    try {
      // Create FormData using Node 18+ globals
      const formData = new (globalThis as any).FormData();

      // Create a Blob from the buffer
      const blob = new Blob([imageBuffer], { type: this.getContentType(filename) });

      // Append file to form data
      formData.append('file', blob, filename);

      // Append Pinata metadata
      const pinataMetadata = JSON.stringify({
        name: filename,
      });
      formData.append('pinataMetadata', pinataMetadata);

      const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.jwt}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata upload failed: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as { IpfsHash: string };
      const ipfsCID = data.IpfsHash;

      return {
        success: true,
        ipfsCID,
        ipfsUrl: `ipfs://${ipfsCID}`,
        gatewayUrl: `${this.gatewayUrl}/ipfs/${ipfsCID}`,
      };
    } catch (error) {
      console.error('Error uploading image to Pinata:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error uploading image',
      };
    }
  }

  async uploadMetadata(metadata: NFTMetadata): Promise<UploadMetadataResult> {
    try {
      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.jwt}`,
        },
        body: JSON.stringify({
          pinataContent: metadata,
          pinataMetadata: {
            name: `${metadata.name} Metadata`,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata metadata upload failed: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as { IpfsHash: string };
      const metadataCID = data.IpfsHash;

      return {
        success: true,
        metadataCID,
        tokenURI: `ipfs://${metadataCID}`,
      };
    } catch (error) {
      console.error('Error uploading metadata to Pinata:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error uploading metadata',
      };
    }
  }

  generateNFTMetadata(params: {
    name: string;
    description: string;
    imageCID: string;
    attributes?: Array<{ trait_type: string; value: string | number }>;
    externalUrl?: string;
  }): NFTMetadata {
    return {
      name: params.name,
      description: params.description,
      image: `ipfs://${params.imageCID}`,
      external_url: params.externalUrl,
      attributes: params.attributes,
    };
  }

  getIPFSUrl(cid: string): string {
    return `ipfs://${cid}`;
  }

  getGatewayUrl(cid: string): string {
    return `${this.gatewayUrl}/ipfs/${cid}`;
  }

  private getContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'svg':
        return 'image/svg+xml';
      case 'webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }
}
