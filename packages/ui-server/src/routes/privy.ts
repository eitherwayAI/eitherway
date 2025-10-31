import { FastifyInstance } from 'fastify';
import { UsersRepository, DatabaseClient } from '@eitherway/database';

/**
 * Privy Authentication Routes
 *
 * These endpoints handle syncing Privy user data with our database.
 * The frontend calls these after successful Privy authentication.
 */
export async function registerPrivyRoutes(fastify: FastifyInstance, db: DatabaseClient) {
  const usersRepo = new UsersRepository(db);

  /**
   * POST /api/privy/sync-user
   *
   * Sync Privy user data with our database
   * Creates or updates user record and links wallets, emails, and OAuth accounts
   */
  fastify.post<{
    Body: {
      privyUserId: string;
      displayName?: string;
      wallets?: Array<{
        address: string;
        type: string;
        chainType?: string;
        isEmbedded?: boolean;
        isPrimary?: boolean;
      }>;
      emails?: Array<{
        address: string;
        isPrimary?: boolean;
      }>;
      oauthAccounts?: Array<{
        provider: string;
        providerUserId: string;
        email?: string;
        username?: string;
        name?: string;
        isPrimary?: boolean;
      }>;
    };
  }>('/api/privy/sync-user', async (request, reply) => {
    const { privyUserId, displayName, wallets, emails, oauthAccounts } = request.body;

    try {
      // Find or create user by Privy ID
      const user = await usersRepo.findOrCreateByPrivyId(privyUserId, displayName);

      // Link wallets
      if (wallets && wallets.length > 0) {
        for (const wallet of wallets) {
          await usersRepo.linkWallet(
            user.id,
            wallet.address,
            wallet.type,
            wallet.chainType || 'ethereum',
            wallet.isEmbedded || false,
            wallet.isPrimary || false,
          );
        }
      }

      // Link emails
      if (emails && emails.length > 0) {
        for (const email of emails) {
          await usersRepo.linkEmail(user.id, email.address, email.isPrimary || false);
        }
      }

      // Link OAuth accounts
      if (oauthAccounts && oauthAccounts.length > 0) {
        for (const oauth of oauthAccounts) {
          await usersRepo.linkOAuthAccount(
            user.id,
            oauth.provider,
            oauth.providerUserId,
            oauth.email,
            oauth.username,
            oauth.name,
            oauth.isPrimary || false,
          );
        }
      }

      return {
        success: true,
        user: {
          id: user.id,
          privyUserId: user.privy_user_id,
          displayName: user.display_name,
          createdAt: user.created_at,
        },
      };
    } catch (error) {
      fastify.log.error('Error syncing Privy user:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to sync user data',
      });
    }
  });

  /**
   * GET /api/privy/user/:identifier
   *
   * Get user by any identifier (Privy ID, wallet, email, or user ID)
   */
  fastify.get<{
    Params: { identifier: string };
    Querystring: { chainType?: string };
  }>('/api/privy/user/:identifier', async (request, reply) => {
    const { identifier } = request.params;
    const { chainType } = request.query;

    try {
      const user = await usersRepo.findByAnyIdentifier(identifier, chainType || 'ethereum');

      if (!user) {
        return reply.code(404).send({
          success: false,
          error: 'User not found',
        });
      }

      // Get associated wallets, emails, and OAuth accounts
      const [wallets, emails, oauthAccounts] = await Promise.all([
        usersRepo.getUserWallets(user.id),
        usersRepo.getUserEmails(user.id),
        usersRepo.getUserOAuthAccounts(user.id),
      ]);

      return {
        success: true,
        user: {
          id: user.id,
          privyUserId: user.privy_user_id,
          displayName: user.display_name,
          createdAt: user.created_at,
          wallets,
          emails,
          oauthAccounts,
        },
      };
    } catch (error) {
      fastify.log.error('Error fetching user:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch user data',
      });
    }
  });

  /**
   * GET /api/privy/user/:userId/wallets
   *
   * Get all wallet addresses for a user
   */
  fastify.get<{
    Params: { userId: string };
  }>('/api/privy/user/:userId/wallets', async (request, reply) => {
    const { userId } = request.params;

    try {
      const wallets = await usersRepo.getUserWallets(userId);
      return {
        success: true,
        wallets,
      };
    } catch (error) {
      fastify.log.error('Error fetching user wallets:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch user wallets',
      });
    }
  });

  /**
   * GET /api/privy/user/:userId/emails
   *
   * Get all email addresses for a user
   */
  fastify.get<{
    Params: { userId: string };
  }>('/api/privy/user/:userId/emails', async (request, reply) => {
    const { userId } = request.params;

    try {
      const emails = await usersRepo.getUserEmails(userId);
      return {
        success: true,
        emails,
      };
    } catch (error) {
      fastify.log.error('Error fetching user emails:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch user emails',
      });
    }
  });

  /**
   * GET /api/privy/user/:userId/oauth
   *
   * Get all OAuth accounts for a user
   */
  fastify.get<{
    Params: { userId: string };
  }>('/api/privy/user/:userId/oauth', async (request, reply) => {
    const { userId } = request.params;

    try {
      const oauthAccounts = await usersRepo.getUserOAuthAccounts(userId);
      return {
        success: true,
        oauthAccounts,
      };
    } catch (error) {
      fastify.log.error('Error fetching user OAuth accounts:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch user OAuth accounts',
      });
    }
  });
}
