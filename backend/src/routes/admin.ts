import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { LedgerService } from '../services/ledger';

const router = Router();

// Middleware to check admin role
const requireAdmin = (req: AuthRequest, res: Response, next: any) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Requires admin privileges' });
  }
  next();
};

router.use(authenticateToken, requireAdmin);

// Get all users
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, kycStatus: true, role: true, createdAt: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Propose / Adjust balance with Maker-Checker (simplified for MVP)
router.post('/users/:id/adjust-balance', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { currency, delta, reason } = req.body;
    const adminId = req.user.id;

    if (!currency || !delta || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Record audit log BEFORE action
    const log = await prisma.adminAuditLog.create({
      data: {
        adminId,
        targetType: 'BALANCE_ADJUSTMENT',
        targetId: id,
        action: 'PROPOSE_ADJUSTMENT',
        before: { currency, delta },
        note: reason
      }
    });

    // In a full maker-checker system, this would just create a pending request.
    // For MVP, we apply it immediately but guarantee an immutable audit trail.
    await LedgerService.adjustBalance(
      id,
      currency,
      Number(delta),
      'ADMIN_ADJUSTMENT',
      log.id, // reference to audit log
      adminId
    );

    // Update log to applied
    await prisma.adminAuditLog.update({
      where: { id: log.id },
      data: { action: 'APPLY_ADJUSTMENT', after: { applied: true } }
    });

    res.json({ success: true, message: 'Balance adjusted successfully' });
  } catch (error: any) {
    console.error('Admin balance adjust error:', error);
    res.status(400).json({ error: error.message || 'Failed to adjust balance' });
  }
});

export default router;
