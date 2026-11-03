import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { ExecutionService } from '../services/execution';
import { prisma } from '../db';

const router = Router();

// Get user orders
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;
    
    const whereClause: any = { userId };
    if (status) {
      whereClause.status = status;
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    res.json(orders);
  } catch (error) {
    console.error('Fetch orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Place a new order
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { symbol, side, type, price, quantity } = req.body;

    if (!symbol || !side || !type || !quantity) {
      return res.status(400).json({ error: 'Missing required order fields' });
    }

    const order = await ExecutionService.placeOrder(
      userId,
      symbol,
      side,
      type,
      Number(quantity),
      price ? Number(price) : undefined
    );

    res.status(201).json(order);
  } catch (error: any) {
    console.error('Place order error:', error);
    res.status(400).json({ error: error.message || 'Failed to place order' });
  }
});

export default router;
