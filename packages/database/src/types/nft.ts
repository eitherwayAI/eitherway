export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  external_url?: string;
  attributes?: NFTAttribute[];
  background_color?: string;
  animation_url?: string;
  youtube_url?: string;
}

export interface NFTAttribute {
  trait_type: string;
  value: string | number;
  display_type?: 'number' | 'boost_percentage' | 'boost_number' | 'date';
}

export interface UploadImageResult {
  success: boolean;
  ipfsCID?: string;
  ipfsUrl?: string;
  gatewayUrl?: string;
  error?: string;
}

export interface UploadMetadataResult {
  success: boolean;
  metadataCID?: string;
  tokenURI?: string;
  error?: string;
}

export interface CreateNFTAssetParams {
  imageBuffer: Buffer;
  imageName: string;
  nftName: string;
  nftDescription: string;
  attributes?: NFTAttribute[];
  externalUrl?: string;
}

export interface CreateNFTAssetResult {
  success: boolean;
  imageCID?: string;
  imageUrl?: string;
  metadataCID?: string;
  tokenURI?: string;
  error?: string;
}
