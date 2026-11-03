import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import authRoutes from './routes/auth';
import orderRoutes from './routes/orders';
import adminRoutes from './routes/admin';
import visitorRoutes from './routes/visitors';
import { setupWebSockets } from './websockets';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/visitors', visitorRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Setup WebSockets
setupWebSockets(server);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
