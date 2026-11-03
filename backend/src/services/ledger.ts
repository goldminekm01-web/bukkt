import { PrismaClient, Prisma, EntryType } from '@prisma/client';

const prisma = new PrismaClient();

export class LedgerService {
  /**
   * Adjusts the balance of an account and creates a corresponding ledger entry
   * using a database transaction to ensure atomicity.
   */
  static async adjustBalance(
    userId: string,
    currency: string,
    delta: number,
    type: EntryType,
    referenceId?: string,
    adminId?: string
  ) {
    return await prisma.$transaction(async (tx) => {
      // 1. Get or create the user's ledger account
      let account = await tx.ledgerAccount.findUnique({
        where: { userId_currency: { userId, currency } },
      });

      if (!account) {
        account = await tx.ledgerAccount.create({
          data: {
            userId,
            currency,
            available: 0,
            locked: 0,
          },
        });
      }

      const currentAvailable = Number(account.available);
      const newAvailable = currentAvailable + delta;

      if (newAvailable < 0) {
        throw new Error(`Insufficient funds: Cannot adjust ${currency} by ${delta}`);
      }

      // 2. Update account balance
      const updatedAccount = await tx.ledgerAccount.update({
        where: { id: account.id },
        data: {
          available: newAvailable,
        },
      });

      // 3. Create immutable ledger entry
      const entry = await tx.ledgerEntry.create({
        data: {
          accountId: account.id,
          delta: delta,
          balanceAfter: newAvailable,
          type,
          referenceId,
          createdBy: adminId,
        },
      });

      return { account: updatedAccount, entry };
    });
  }

  /**
   * Lock funds (e.g., when placing an order)
   */
  static async lockFunds(userId: string, currency: string, amount: number) {
    if (amount <= 0) throw new Error("Amount must be positive");

    return await prisma.$transaction(async (tx) => {
      const account = await tx.ledgerAccount.findUnique({
        where: { userId_currency: { userId, currency } },
      });

      if (!account || Number(account.available) < amount) {
        throw new Error("Insufficient available funds to lock");
      }

      return await tx.ledgerAccount.update({
        where: { id: account.id },
        data: {
          available: { decrement: amount },
          locked: { increment: amount },
        },
      });
    });
  }

  /**
   * Unlock funds (e.g., when an order is cancelled)
   */
  static async unlockFunds(userId: string, currency: string, amount: number) {
    if (amount <= 0) throw new Error("Amount must be positive");

    return await prisma.$transaction(async (tx) => {
      const account = await tx.ledgerAccount.findUnique({
        where: { userId_currency: { userId, currency } },
      });

      if (!account || Number(account.locked) < amount) {
        throw new Error("Insufficient locked funds to unlock");
      }

      return await tx.ledgerAccount.update({
        where: { id: account.id },
        data: {
          available: { increment: amount },
          locked: { decrement: amount },
        },
      });
    });
  }
}
