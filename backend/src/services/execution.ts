import { PrismaClient, OrderSide, OrderType, OrderStatus } from '@prisma/client';
import { LedgerService } from './ledger';

const prisma = new PrismaClient();

export class ExecutionService {
  /**
   * Validates and places a new order.
   * In a real system, this would push the order to a matching engine queue
   * or a liquidity provider via API.
   */
  static async placeOrder(userId: string, symbol: string, side: OrderSide, type: OrderType, quantity: number, price?: number) {
    if (quantity <= 0) {
      throw new Error("Quantity must be greater than 0");
    }

    if (type === 'LIMIT' && (!price || price <= 0)) {
      throw new Error("Limit orders require a valid price");
    }

    // Split symbol to get base and quote currency
    const [baseCurrency, quoteCurrency] = symbol.split('/');

    // Validate balances and lock funds
    if (side === 'BUY') {
      // For BUY, we need to lock the quote currency (e.g., USDT)
      // If MARKET, we'd need to estimate the price. For simplicity here, we assume a mock market price of 3000 for ETH/USDT.
      const estimatedPrice = type === 'LIMIT' ? price! : 3000;
      const requiredAmount = quantity * estimatedPrice;
      await LedgerService.lockFunds(userId, quoteCurrency, requiredAmount);
    } else {
      // For SELL, we need to lock the base currency (e.g., ETH)
      await LedgerService.lockFunds(userId, baseCurrency, quantity);
    }

    // Create the order
    const order = await prisma.order.create({
      data: {
        userId,
        symbol,
        side,
        type,
        price,
        quantity,
        status: 'OPEN',
      }
    });

    // Mock asynchronous execution (Routing to liquidity provider)
    this.mockExecuteOrder(order.id);

    return order;
  }

  /**
   * Simulates filling an order asynchronously.
   */
  private static async mockExecuteOrder(orderId: string) {
    setTimeout(async () => {
      try {
        await prisma.$transaction(async (tx) => {
          const order = await tx.order.findUnique({ where: { id: orderId } });
          if (!order || order.status !== 'OPEN') return;

          // Mock fill price (either limit price or market approximation)
          const fillPrice = order.type === 'LIMIT' ? Number(order.price) : 3000;
          const fillQuantity = Number(order.quantity);
          const fee = fillQuantity * fillPrice * 0.001; // 0.1% fee

          const [baseCurrency, quoteCurrency] = order.symbol.split('/');

          // Update order status
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'FILLED',
              filledQuantity: fillQuantity,
            }
          });

          // Create trade record
          await tx.trade.create({
            data: {
              buyOrderId: order.side === 'BUY' ? order.id : 'MOCK_LP_SELL', // MOCK_LP_SELL simulates the liquidity provider
              sellOrderId: order.side === 'SELL' ? order.id : 'MOCK_LP_BUY',
              price: fillPrice,
              quantity: fillQuantity,
              fee,
            }
          });

          // Settle balances (Unlock funds and adjust final balances)
          if (order.side === 'BUY') {
            // Unlocked the quote currency that was locked earlier
            const totalCost = fillQuantity * fillPrice;
            await tx.ledgerAccount.update({
              where: { userId_currency: { userId: order.userId, currency: quoteCurrency } },
              data: { locked: { decrement: totalCost } }
            });
            // Credit the base currency minus fees
            // In a real system, fees might be taken from base or quote currency based on rules
            await LedgerService.adjustBalance(order.userId, baseCurrency, fillQuantity, 'TRADE_FILL', order.id);
            await LedgerService.adjustBalance(order.userId, quoteCurrency, -totalCost, 'TRADE_FILL', order.id);
          } else {
            // Unlock base currency
            await tx.ledgerAccount.update({
              where: { userId_currency: { userId: order.userId, currency: baseCurrency } },
              data: { locked: { decrement: fillQuantity } }
            });
            // Credit quote currency minus fees
            const grossProceeds = fillQuantity * fillPrice;
            await LedgerService.adjustBalance(order.userId, baseCurrency, -fillQuantity, 'TRADE_FILL', order.id);
            await LedgerService.adjustBalance(order.userId, quoteCurrency, grossProceeds - fee, 'TRADE_FILL', order.id);
          }
          
          console.log(`Order ${order.id} executed successfully.`);
        });
      } catch (err) {
        console.error(`Failed to execute mock order ${orderId}:`, err);
      }
    }, 2000); // 2-second simulated execution delay
  }
}
