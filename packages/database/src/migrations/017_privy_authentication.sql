-- Migration 017: Privy Authentication Support
-- Adds support for Web2 (email, OAuth) and Web3 (wallet) authentication via Privy

-- ============================================================================
-- UPDATE USERS TABLE
-- ============================================================================

-- Add Privy user ID to existing users table
-- This is the primary identifier from Privy (did:privy:...)
ALTER TABLE core.users
  ADD COLUMN IF NOT EXISTS privy_user_id TEXT UNIQUE;

-- Make email nullable since users can authenticate with just a wallet
ALTER TABLE core.users
  ALTER COLUMN email DROP NOT NULL;

-- Add index for Privy user ID lookups
CREATE INDEX IF NOT EXISTS users_privy_id_idx ON core.users(privy_user_id);

-- ============================================================================
-- USER WALLETS TABLE
-- ============================================================================

-- Store wallet addresses linked to users
-- Users can have multiple wallet addresses
CREATE TABLE IF NOT EXISTS core.user_wallets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  wallet_address    TEXT NOT NULL,
  wallet_type       TEXT NOT NULL CHECK (wallet_type IN ('metamask', 'walletconnect', 'coinbase_wallet', 'privy_embedded', 'other')),
  chain_type        TEXT NOT NULL DEFAULT 'ethereum' CHECK (chain_type IN ('ethereum', 'solana', 'bitcoin', 'other')),
  is_embedded       BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (wallet_address, chain_type)
);

-- Indices for wallet lookups
CREATE INDEX IF NOT EXISTS user_wallets_by_user ON core.user_wallets(user_id);
CREATE INDEX IF NOT EXISTS user_wallets_by_address ON core.user_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS user_wallets_primary ON core.user_wallets(user_id, is_primary) WHERE is_primary = TRUE;

-- Trigger for updated_at
CREATE TRIGGER user_wallets_updated_at
  BEFORE UPDATE ON core.user_wallets
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();

-- ============================================================================
-- USER OAUTH ACCOUNTS TABLE
-- ============================================================================

-- Store OAuth provider information
-- Users can link multiple OAuth providers (Google, Twitter, Discord, etc.)
CREATE TABLE IF NOT EXISTS core.user_oauth_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL CHECK (provider IN ('google', 'twitter', 'discord', 'github', 'apple', 'other')),
  provider_user_id  TEXT NOT NULL,
  provider_email    TEXT,
  provider_username TEXT,
  provider_name     TEXT,
  is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (provider, provider_user_id)
);

-- Indices for OAuth lookups
CREATE INDEX IF NOT EXISTS user_oauth_by_user ON core.user_oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS user_oauth_by_provider ON core.user_oauth_accounts(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS user_oauth_by_email ON core.user_oauth_accounts(provider_email) WHERE provider_email IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER user_oauth_accounts_updated_at
  BEFORE UPDATE ON core.user_oauth_accounts
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();

-- ============================================================================
-- USER EMAILS TABLE
-- ============================================================================

-- Store multiple email addresses per user
-- Allows users to have both verified email login and OAuth emails
CREATE TABLE IF NOT EXISTS core.user_emails (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  email             CITEXT NOT NULL UNIQUE,
  is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices for email lookups
CREATE INDEX IF NOT EXISTS user_emails_by_user ON core.user_emails(user_id);
CREATE INDEX IF NOT EXISTS user_emails_by_email ON core.user_emails(email);
CREATE INDEX IF NOT EXISTS user_emails_primary ON core.user_emails(user_id, is_primary) WHERE is_primary = TRUE;

-- Trigger for updated_at
CREATE TRIGGER user_emails_updated_at
  BEFORE UPDATE ON core.user_emails
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();

-- ============================================================================
-- DATA MIGRATION
-- ============================================================================

-- Migrate existing email-based users to the new structure
-- Copy emails from users table to user_emails table
INSERT INTO core.user_emails (user_id, email, is_primary, verified_at, created_at)
SELECT
  id,
  email,
  TRUE,
  created_at,
  created_at
FROM core.users
WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to find or create user by Privy ID
CREATE OR REPLACE FUNCTION core.find_or_create_user_by_privy_id(
  p_privy_user_id TEXT,
  p_display_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Try to find existing user
  SELECT id INTO v_user_id
  FROM core.users
  WHERE privy_user_id = p_privy_user_id;

  -- Create new user if not found
  IF v_user_id IS NULL THEN
    INSERT INTO core.users (privy_user_id, display_name, email)
    VALUES (p_privy_user_id, p_display_name, NULL)
    RETURNING id INTO v_user_id;
  END IF;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to find user by wallet address
CREATE OR REPLACE FUNCTION core.find_user_by_wallet(
  p_wallet_address TEXT,
  p_chain_type TEXT DEFAULT 'ethereum'
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id
  FROM core.user_wallets
  WHERE wallet_address = p_wallet_address
    AND chain_type = p_chain_type;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to find user by email
CREATE OR REPLACE FUNCTION core.find_user_by_email(
  p_email TEXT
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id
  FROM core.user_emails
  WHERE email = p_email;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to link wallet to user
CREATE OR REPLACE FUNCTION core.link_wallet_to_user(
  p_user_id UUID,
  p_wallet_address TEXT,
  p_wallet_type TEXT,
  p_chain_type TEXT DEFAULT 'ethereum',
  p_is_embedded BOOLEAN DEFAULT FALSE,
  p_is_primary BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  v_wallet_id UUID;
BEGIN
  -- Insert or update wallet
  INSERT INTO core.user_wallets (
    user_id,
    wallet_address,
    wallet_type,
    chain_type,
    is_embedded,
    is_primary,
    verified_at
  )
  VALUES (
    p_user_id,
    p_wallet_address,
    p_wallet_type,
    p_chain_type,
    p_is_embedded,
    p_is_primary,
    now()
  )
  ON CONFLICT (wallet_address, chain_type)
  DO UPDATE SET
    user_id = p_user_id,
    wallet_type = p_wallet_type,
    is_embedded = p_is_embedded,
    is_primary = p_is_primary,
    verified_at = now(),
    updated_at = now()
  RETURNING id INTO v_wallet_id;

  RETURN v_wallet_id;
END;
$$ LANGUAGE plpgsql;

-- Function to link OAuth account to user
CREATE OR REPLACE FUNCTION core.link_oauth_to_user(
  p_user_id UUID,
  p_provider TEXT,
  p_provider_user_id TEXT,
  p_provider_email TEXT DEFAULT NULL,
  p_provider_username TEXT DEFAULT NULL,
  p_provider_name TEXT DEFAULT NULL,
  p_is_primary BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  v_oauth_id UUID;
BEGIN
  -- Insert or update OAuth account
  INSERT INTO core.user_oauth_accounts (
    user_id,
    provider,
    provider_user_id,
    provider_email,
    provider_username,
    provider_name,
    is_primary,
    verified_at
  )
  VALUES (
    p_user_id,
    p_provider,
    p_provider_user_id,
    p_provider_email,
    p_provider_username,
    p_provider_name,
    p_is_primary,
    now()
  )
  ON CONFLICT (provider, provider_user_id)
  DO UPDATE SET
    user_id = p_user_id,
    provider_email = p_provider_email,
    provider_username = p_provider_username,
    provider_name = p_provider_name,
    is_primary = p_is_primary,
    verified_at = now(),
    updated_at = now()
  RETURNING id INTO v_oauth_id;

  -- Link email if provided
  IF p_provider_email IS NOT NULL THEN
    INSERT INTO core.user_emails (user_id, email, verified_at)
    VALUES (p_user_id, p_provider_email, now())
    ON CONFLICT (email) DO NOTHING;
  END IF;

  RETURN v_oauth_id;
END;
$$ LANGUAGE plpgsql;

-- Function to link email to user
CREATE OR REPLACE FUNCTION core.link_email_to_user(
  p_user_id UUID,
  p_email TEXT,
  p_is_primary BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  v_email_id UUID;
BEGIN
  INSERT INTO core.user_emails (
    user_id,
    email,
    is_primary,
    verified_at
  )
  VALUES (
    p_user_id,
    p_email,
    p_is_primary,
    now()
  )
  ON CONFLICT (email)
  DO UPDATE SET
    user_id = p_user_id,
    is_primary = p_is_primary,
    verified_at = now(),
    updated_at = now()
  RETURNING id INTO v_email_id;

  RETURN v_email_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE core.user_wallets IS 'Stores wallet addresses linked to users for Web3 authentication';
COMMENT ON TABLE core.user_oauth_accounts IS 'Stores OAuth provider accounts linked to users (Google, Twitter, etc.)';
COMMENT ON TABLE core.user_emails IS 'Stores email addresses linked to users, allows multiple emails per user';
COMMENT ON COLUMN core.users.privy_user_id IS 'Privy DID identifier (did:privy:...)';
COMMENT ON FUNCTION core.find_or_create_user_by_privy_id IS 'Find existing user or create new user by Privy ID';
COMMENT ON FUNCTION core.find_user_by_wallet IS 'Find user by wallet address and chain type';
COMMENT ON FUNCTION core.find_user_by_email IS 'Find user by email address';
COMMENT ON FUNCTION core.link_wallet_to_user IS 'Link a wallet address to a user account';
COMMENT ON FUNCTION core.link_oauth_to_user IS 'Link an OAuth provider account to a user';
COMMENT ON FUNCTION core.link_email_to_user IS 'Link an email address to a user account';
