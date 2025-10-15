/**
 * Migration 008: Brand Kit System
 *
 * Purpose:
 * - Store user-uploaded brand assets (logos, images)
 * - Extract and store color palettes
 * - Link brand kits to user accounts
 * - Support versioning and metadata
 *
 * Tables:
 * - core.brand_kits: Main brand kit metadata
 * - core.brand_assets: Individual assets (logos, images)
 * - core.brand_colors: Extracted color palettes
 */

-- ============================================================================
-- BRAND KITS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.brand_kits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,

  -- Metadata
  name              TEXT NOT NULL,
  description       TEXT,

  -- Status
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived', 'deleted')),

  -- Versioning
  version           INT NOT NULL DEFAULT 1,

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Indexes
  CONSTRAINT brand_kits_name_check CHECK (char_length(name) >= 1 AND char_length(name) <= 100)
);

CREATE INDEX idx_brand_kits_user_id ON core.brand_kits(user_id);
CREATE INDEX idx_brand_kits_status ON core.brand_kits(status);
CREATE INDEX idx_brand_kits_created_at ON core.brand_kits(created_at DESC);

-- ============================================================================
-- BRAND ASSETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.brand_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id      UUID NOT NULL REFERENCES core.brand_kits(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,

  -- Asset metadata
  asset_type        TEXT NOT NULL
                    CHECK (asset_type IN ('logo', 'image', 'icon', 'pattern')),
  file_name         TEXT NOT NULL,

  -- Storage
  storage_key       TEXT NOT NULL,  -- S3/GCS object key
  storage_provider  TEXT NOT NULL DEFAULT 'gcs'
                    CHECK (storage_provider IN ('s3', 'gcs', 'local')),

  -- File details
  mime_type         TEXT NOT NULL,
  file_size_bytes   BIGINT NOT NULL CHECK (file_size_bytes > 0),

  -- Image dimensions
  width_px          INT,
  height_px         INT,

  -- Processing status
  processing_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error  TEXT,

  -- Metadata
  metadata          JSONB DEFAULT '{}',

  -- Timestamps
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT brand_assets_file_size_check CHECK (file_size_bytes <= 10485760)  -- 10MB max
);

CREATE INDEX idx_brand_assets_brand_kit_id ON core.brand_assets(brand_kit_id);
CREATE INDEX idx_brand_assets_user_id ON core.brand_assets(user_id);
CREATE INDEX idx_brand_assets_asset_type ON core.brand_assets(asset_type);
CREATE INDEX idx_brand_assets_processing_status ON core.brand_assets(processing_status);

-- ============================================================================
-- BRAND COLORS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.brand_colors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id      UUID NOT NULL REFERENCES core.brand_kits(id) ON DELETE CASCADE,
  asset_id          UUID REFERENCES core.brand_assets(id) ON DELETE SET NULL,  -- Source asset (optional)

  -- Color information
  color_hex         TEXT NOT NULL CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),  -- e.g., #FF5733
  color_rgb         JSONB NOT NULL,  -- { "r": 255, "g": 87, "b": 51 }
  color_hsl         JSONB,           -- { "h": 12, "s": 100, "l": 60 }

  -- Color metadata
  color_name        TEXT,            -- Optional: "Primary Red", "Brand Blue", etc.
  color_role        TEXT CHECK (color_role IN ('primary', 'secondary', 'accent', 'neutral', 'extracted')),

  -- Prominence (for extracted colors)
  prominence_score  FLOAT CHECK (prominence_score >= 0 AND prominence_score <= 1),
  pixel_percentage  FLOAT CHECK (pixel_percentage >= 0 AND pixel_percentage <= 100),

  -- Ordering
  display_order     INT DEFAULT 0,

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_brand_colors_brand_kit_id ON core.brand_colors(brand_kit_id);
CREATE INDEX idx_brand_colors_asset_id ON core.brand_colors(asset_id);
CREATE INDEX idx_brand_colors_color_role ON core.brand_colors(color_role);
CREATE INDEX idx_brand_colors_display_order ON core.brand_colors(brand_kit_id, display_order);

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Auto-update updated_at for brand_kits
CREATE OR REPLACE FUNCTION update_brand_kit_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_kits_updated_at
  BEFORE UPDATE ON core.brand_kits
  FOR EACH ROW
  EXECUTE FUNCTION update_brand_kit_timestamp();

-- Auto-update updated_at for brand_colors
CREATE OR REPLACE FUNCTION update_brand_color_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_colors_updated_at
  BEFORE UPDATE ON core.brand_colors
  FOR EACH ROW
  EXECUTE FUNCTION update_brand_color_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE core.brand_kits IS 'User-created brand kits containing assets and color palettes';
COMMENT ON TABLE core.brand_assets IS 'Individual assets (logos, images) uploaded to brand kits';
COMMENT ON TABLE core.brand_colors IS 'Color palettes extracted from brand assets or manually defined';

COMMENT ON COLUMN core.brand_assets.storage_key IS 'Cloud storage object key (e.g., brand-kits/user123/asset456.png)';
COMMENT ON COLUMN core.brand_assets.processing_status IS 'Status of image processing and palette extraction';
COMMENT ON COLUMN core.brand_colors.prominence_score IS 'AI-determined color importance (0-1, higher = more prominent)';
COMMENT ON COLUMN core.brand_colors.pixel_percentage IS 'Percentage of image pixels with this color';
