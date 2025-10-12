/**
 * Netlify Integration Repositories
 *
 * Manages user integrations and Netlify sites.
 */

import type { DatabaseClient } from '../client.js';

// TYPES

export interface UserIntegration {
  id: string;
  user_id: string;
  service: 'netlify' | 'vercel' | 'github' | 'gitlab';
  encrypted_token: Buffer;
  token_last_4: string | null;
  service_user_id: string | null;
  service_email: string | null;
  service_username: string | null;
  is_verified: boolean;
  verified_at: Date | null;
  last_used_at: Date | null;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface NetlifySite {
  id: string;
  user_id: string;
  app_id: string | null;
  session_id: string | null;
  netlify_site_id: string;
  site_name: string | null;
  url: string;
  admin_url: string | null;
  ssl_url: string | null;
  created_via: string;
  custom_domain: string | null;
  is_active: boolean;
  last_deploy_id: string | null;
  last_deploy_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateIntegrationData {
  user_id: string;
  service: 'netlify' | 'vercel' | 'github' | 'gitlab';
  token: string; // Plain text token (will be encrypted)
  service_user_id?: string;
  service_email?: string;
  service_username?: string;
  metadata?: Record<string, any>;
}

export interface CreateNetlifySiteData {
  user_id: string;
  app_id?: string;
  session_id?: string;
  netlify_site_id: string;
  site_name?: string;
  url: string;
  admin_url?: string;
  ssl_url?: string;
  created_via?: string;
}

// USER INTEGRATIONS REPOSITORY

export class UserIntegrationsRepository {
  constructor(private db: DatabaseClient, private encryptionKey: string) {
    if (!encryptionKey) {
      throw new Error('Encryption key is required for UserIntegrationsRepository');
    }
  }

  async upsert(data: CreateIntegrationData): Promise<UserIntegration> {
    const tokenLast4 = data.token.length >= 4 ? data.token.slice(-4) : '****';

    const result = await this.db.query<UserIntegration>(
      `INSERT INTO core.user_integrations (
        user_id, service, encrypted_token, token_last_4,
        service_user_id, service_email, service_username, metadata
      )
      VALUES (
        $1, $2,
        encrypt_token($3, $4),
        $5, $6, $7, $8, $9
      )
      ON CONFLICT (user_id, service)
      DO UPDATE SET
        encrypted_token = encrypt_token($3, $4),
        token_last_4 = $5,
        service_user_id = COALESCE($6, user_integrations.service_user_id),
        service_email = COALESCE($7, user_integrations.service_email),
        service_username = COALESCE($8, user_integrations.service_username),
        metadata = COALESCE($9, user_integrations.metadata),
        updated_at = now()
      RETURNING *`,
      [
        data.user_id,
        data.service,
        data.token,
        this.encryptionKey,
        tokenLast4,
        data.service_user_id || null,
        data.service_email || null,
        data.service_username || null,
        data.metadata || {}
      ]
    );

    return result.rows[0];
  }

  async get(userId: string, service: string): Promise<UserIntegration | null> {
    const result = await this.db.query<UserIntegration>(
      `SELECT * FROM core.user_integrations
       WHERE user_id = $1 AND service = $2`,
      [userId, service]
    );

    return result.rows[0] || null;
  }

  async getDecryptedToken(userId: string, service: string): Promise<string | null> {
    const result = await this.db.query<{ token: string }>(
      `SELECT decrypt_token(encrypted_token, $1) as token
       FROM core.user_integrations
       WHERE user_id = $2 AND service = $3`,
      [this.encryptionKey, userId, service]
    );

    return result.rows[0]?.token || null;
  }

  /**
   * Mark integration as verified
   */
  async markVerified(userId: string, service: string): Promise<void> {
    await this.db.query(
      `UPDATE core.user_integrations
       SET is_verified = true, verified_at = now()
       WHERE user_id = $1 AND service = $2`,
      [userId, service]
    );
  }

  async updateLastUsed(userId: string, service: string): Promise<void> {
    await this.db.query(
      `UPDATE core.user_integrations
       SET last_used_at = now()
       WHERE user_id = $1 AND service = $2`,
      [userId, service]
    );
  }

  async delete(userId: string, service: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM core.user_integrations
       WHERE user_id = $1 AND service = $2`,
      [userId, service]
    );

    return (result.rowCount || 0) > 0;
  }

  async getAllForUser(userId: string): Promise<UserIntegration[]> {
    const result = await this.db.query<UserIntegration>(
      `SELECT * FROM core.user_integrations_safe
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  }
}

// NETLIFY SITES REPOSITORY

export class NetlifySitesRepository {
  constructor(private db: DatabaseClient) {}

  async create(data: CreateNetlifySiteData): Promise<NetlifySite> {
    const result = await this.db.query<NetlifySite>(
      `INSERT INTO core.netlify_sites (
        user_id, app_id, session_id, netlify_site_id,
        site_name, url, admin_url, ssl_url, created_via
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id, netlify_site_id)
      DO UPDATE SET
        app_id = COALESCE($2, netlify_sites.app_id),
        session_id = COALESCE($3, netlify_sites.session_id),
        site_name = COALESCE($5, netlify_sites.site_name),
        url = $6,
        admin_url = COALESCE($7, netlify_sites.admin_url),
        ssl_url = COALESCE($8, netlify_sites.ssl_url),
        updated_at = now()
      RETURNING *`,
      [
        data.user_id,
        data.app_id || null,
        data.session_id || null,
        data.netlify_site_id,
        data.site_name || null,
        data.url,
        data.admin_url || null,
        data.ssl_url || null,
        data.created_via || 'eitherway'
      ]
    );

    return result.rows[0];
  }

  async getById(id: string): Promise<NetlifySite | null> {
    const result = await this.db.query<NetlifySite>(
      'SELECT * FROM core.netlify_sites WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  }

  async getByNetlifySiteId(userId: string, netlifySiteId: string): Promise<NetlifySite | null> {
    const result = await this.db.query<NetlifySite>(
      `SELECT * FROM core.netlify_sites
       WHERE user_id = $1 AND netlify_site_id = $2`,
      [userId, netlifySiteId]
    );

    return result.rows[0] || null;
  }

  async getByAppId(appId: string): Promise<NetlifySite | null> {
    const result = await this.db.query<NetlifySite>(
      `SELECT * FROM core.netlify_sites
       WHERE app_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [appId]
    );

    return result.rows[0] || null;
  }

  async getAllForUser(userId: string, limit: number = 50): Promise<NetlifySite[]> {
    const result = await this.db.query<NetlifySite>(
      `SELECT * FROM core.netlify_sites
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }

  async updateLastDeploy(id: string, deployId: string): Promise<void> {
    await this.db.query(
      `UPDATE core.netlify_sites
       SET last_deploy_id = $1, last_deploy_at = now()
       WHERE id = $2`,
      [deployId, id]
    );
  }

  /**
   * Mark site as inactive
   */
  async markInactive(id: string): Promise<void> {
    await this.db.query(
      'UPDATE core.netlify_sites SET is_active = false WHERE id = $1',
      [id]
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM core.netlify_sites WHERE id = $1',
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  async getWithStats(id: string): Promise<any> {
    const result = await this.db.query(
      `SELECT * FROM core.netlify_sites_with_stats WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }
}
