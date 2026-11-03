import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

export function setupWebSockets(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: '*', // Adjust for production
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Subscribe to symbol
    socket.on('subscribe', (symbol: string) => {
      socket.join(symbol);
      console.log(`Socket ${socket.id} subscribed to ${symbol}`);
      
      // Mock initial orderbook data
      socket.emit('orderbook_snapshot', {
        symbol,
        bids: [[3000.5, 1.2], [3000.0, 4.5], [2998.5, 10.1]],
        asks: [[3001.0, 2.3], [3002.5, 0.8], [3005.0, 5.0]],
      });
    });

    socket.on('unsubscribe', (symbol: string) => {
      socket.leave(symbol);
      console.log(`Socket ${socket.id} unsubscribed from ${symbol}`);
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  // Mock real-time ticker and orderbook updates
  setInterval(() => {
    const symbols = ['ETH/USDT', 'BTC/USDT'];
    symbols.forEach((symbol) => {
      const basePrice = symbol === 'ETH/USDT' ? 3000 : 60000;
      const variation = (Math.random() - 0.5) * 10;
      const price = basePrice + variation;

      io.to(symbol).emit('ticker', {
        symbol,
        price: price.toFixed(2),
        change24h: (Math.random() * 5 - 2.5).toFixed(2),
        volume24h: (Math.random() * 1000).toFixed(2),
        timestamp: Date.now(),
      });

      // Random trade
      io.to(symbol).emit('trade', {
        symbol,
        price: price.toFixed(2),
        quantity: (Math.random() * 2).toFixed(4),
        side: Math.random() > 0.5 ? 'BUY' : 'SELL',
        timestamp: Date.now(),
      });
    });
  }, 2000);

  return io;
}
