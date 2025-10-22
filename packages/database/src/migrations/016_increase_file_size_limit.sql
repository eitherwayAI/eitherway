-- Migration 016: Increase file size limit to support videos up to 100MB
-- Current constraint limits files to 10MB (10485760 bytes)
-- Video files commonly exceed this, so we're increasing to 100MB (104857600 bytes)

-- Drop the existing constraint
ALTER TABLE core.brand_assets
DROP CONSTRAINT IF EXISTS brand_assets_file_size_check;

-- Add the new constraint with 100MB limit
ALTER TABLE core.brand_assets
ADD CONSTRAINT brand_assets_file_size_check
CHECK (file_size_bytes <= 104857600);

-- Add comment for documentation
COMMENT ON CONSTRAINT brand_assets_file_size_check ON core.brand_assets IS
'Maximum file size: 100MB (104857600 bytes) - supports large video files';
