import { PinataService } from './pinata-service';
import type {
  CreateNFTAssetParams,
  CreateNFTAssetResult,
} from '../types/nft';

export class NFTService {
  private pinataService: PinataService;

  constructor() {
    this.pinataService = new PinataService();
  }

  async createNFTAsset(params: CreateNFTAssetParams): Promise<CreateNFTAssetResult> {
    try {
      const imageResult = await this.pinataService.uploadImage(
        params.imageBuffer,
        params.imageName
      );

      if (!imageResult.success || !imageResult.ipfsCID) {
        return {
          success: false,
          error: imageResult.error || 'Failed to upload image',
        };
      }

      const metadata = this.pinataService.generateNFTMetadata({
        name: params.nftName,
        description: params.nftDescription,
        imageCID: imageResult.ipfsCID,
        attributes: params.attributes,
        externalUrl: params.externalUrl,
      });

      const metadataResult = await this.pinataService.uploadMetadata(metadata);

      if (!metadataResult.success || !metadataResult.metadataCID) {
        return {
          success: false,
          error: metadataResult.error || 'Failed to upload metadata',
        };
      }

      return {
        success: true,
        imageCID: imageResult.ipfsCID,
        imageUrl: imageResult.gatewayUrl,
        metadataCID: metadataResult.metadataCID,
        tokenURI: metadataResult.tokenURI,
      };
    } catch (error) {
      console.error('Error creating NFT asset:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating NFT asset',
      };
    }
  }

  async createBatchNFTAssets(
    assets: CreateNFTAssetParams[]
  ): Promise<CreateNFTAssetResult[]> {
    const results = await Promise.all(assets.map((asset) => this.createNFTAsset(asset)));
    return results;
  }

  getPinataService(): PinataService {
    return this.pinataService;
  }
}
