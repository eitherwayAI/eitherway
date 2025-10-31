import { DatabaseClient } from '../client.js';
import type { User } from '../types.js';

export class UsersRepository {
  constructor(private db: DatabaseClient) {}

  async create(email: string, displayName?: string): Promise<User> {
    const result = await this.db.query<User>(
      `INSERT INTO core.users (email, display_name)
       VALUES ($1, $2)
       RETURNING *`,
      [email, displayName ?? null],
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query<User>(`SELECT * FROM core.users WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query<User>(
      `SELECT u.* FROM core.users u
       JOIN core.user_emails e ON u.id = e.user_id
       WHERE e.email = $1
       LIMIT 1`,
      [email],
    );
    return result.rows[0] ?? null;
  }

  async findOrCreate(email: string, displayName?: string): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) return existing;
    return this.create(email, displayName);
  }

  async update(id: string, data: { displayName?: string }): Promise<User> {
    const result = await this.db.query<User>(
      `UPDATE core.users
       SET display_name = COALESCE($2, display_name)
       WHERE id = $1
       RETURNING *`,
      [id, data.displayName ?? null],
    );
    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    await this.db.query(`DELETE FROM core.users WHERE id = $1`, [id]);
  }

  // ============================================================================
  // PRIVY AUTHENTICATION METHODS
  // ============================================================================

  /**
   * Find or create user by Privy user ID
   */
  async findOrCreateByPrivyId(privyUserId: string, displayName?: string): Promise<User> {
    const result = await this.db.query<User>(
      `SELECT * FROM core.find_or_create_user_by_privy_id($1, $2)`,
      [privyUserId, displayName ?? null],
    );

    const userId = result.rows[0]?.find_or_create_user_by_privy_id;
    if (!userId) {
      throw new Error('Failed to find or create user by Privy ID');
    }

    return this.findById(userId) as Promise<User>;
  }

  /**
   * Find user by Privy user ID
   */
  async findByPrivyId(privyUserId: string): Promise<User | null> {
    const result = await this.db.query<User>(
      `SELECT * FROM core.users WHERE privy_user_id = $1`,
      [privyUserId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Find user by wallet address
   */
  async findByWalletAddress(
    walletAddress: string,
    chainType: string = 'ethereum',
  ): Promise<User | null> {
    const result = await this.db.query<User>(
      `SELECT u.* FROM core.users u
       JOIN core.user_wallets w ON u.id = w.user_id
       WHERE w.wallet_address = $1 AND w.chain_type = $2
       LIMIT 1`,
      [walletAddress, chainType],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Link wallet address to user
   */
  async linkWallet(
    userId: string,
    walletAddress: string,
    walletType: string,
    chainType: string = 'ethereum',
    isEmbedded: boolean = false,
    isPrimary: boolean = false,
  ): Promise<void> {
    await this.db.query(
      `SELECT core.link_wallet_to_user($1, $2, $3, $4, $5, $6)`,
      [userId, walletAddress, walletType, chainType, isEmbedded, isPrimary],
    );
  }

  /**
   * Link OAuth account to user
   */
  async linkOAuthAccount(
    userId: string,
    provider: string,
    providerUserId: string,
    providerEmail?: string,
    providerUsername?: string,
    providerName?: string,
    isPrimary: boolean = false,
  ): Promise<void> {
    await this.db.query(
      `SELECT core.link_oauth_to_user($1, $2, $3, $4, $5, $6, $7)`,
      [userId, provider, providerUserId, providerEmail, providerUsername, providerName, isPrimary],
    );
  }

  /**
   * Link email to user
   */
  async linkEmail(userId: string, email: string, isPrimary: boolean = false): Promise<void> {
    await this.db.query(`SELECT core.link_email_to_user($1, $2, $3)`, [userId, email, isPrimary]);
  }

  /**
   * Get user's wallets
   */
  async getUserWallets(userId: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM core.user_wallets WHERE user_id = $1 ORDER BY is_primary DESC, created_at`,
      [userId],
    );
    return result.rows;
  }

  /**
   * Get user's OAuth accounts
   */
  async getUserOAuthAccounts(userId: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM core.user_oauth_accounts WHERE user_id = $1 ORDER BY is_primary DESC, created_at`,
      [userId],
    );
    return result.rows;
  }

  /**
   * Get user's emails
   */
  async getUserEmails(userId: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM core.user_emails WHERE user_id = $1 ORDER BY is_primary DESC, created_at`,
      [userId],
    );
    return result.rows;
  }

  /**
   * Find user by any identifier (Privy ID, wallet, or email)
   * This is useful for unified user lookup
   */
  async findByAnyIdentifier(identifier: string, chainType: string = 'ethereum'): Promise<User | null> {
    // Try Privy ID first
    if (identifier.startsWith('did:privy:')) {
      return this.findByPrivyId(identifier);
    }

    // Try wallet address (starts with 0x for Ethereum)
    if (identifier.startsWith('0x')) {
      return this.findByWalletAddress(identifier, chainType);
    }

    // Try email (contains @)
    if (identifier.includes('@')) {
      return this.findByEmail(identifier);
    }

    // Try as UUID (user ID)
    return this.findById(identifier);
  }
}
