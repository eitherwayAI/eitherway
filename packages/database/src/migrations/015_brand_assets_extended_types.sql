-- Migration 015: Extend brand_assets to support font and video asset types
-- This migration adds 'font' and 'video' to the allowed asset_type values

-- Drop the existing constraint
ALTER TABLE core.brand_assets
DROP CONSTRAINT IF EXISTS brand_assets_asset_type_check;

-- Add the new constraint with extended types
ALTER TABLE core.brand_assets
ADD CONSTRAINT brand_assets_asset_type_check
CHECK (asset_type IN ('logo', 'image', 'icon', 'pattern', 'font', 'video'));

-- Add comment for documentation
COMMENT ON CONSTRAINT brand_assets_asset_type_check ON core.brand_assets IS
'Allowed asset types: logo, image, icon, pattern, font, video';
