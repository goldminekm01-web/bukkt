# LedgerTrader

A production-grade cryptocurrency trading web application featuring real-time charting, order book, smart contract wallet connection, and a maker-checker admin portal.

## Architecture
- **Frontend**: Next.js, Tailwind CSS, lightweight-charts, ethers.js
- **Backend**: Node.js, Express, Socket.io, Prisma, PostgreSQL
- **Infrastructure**: Docker, Docker Compose, GitHub Actions, Vercel (Frontend)

## Local Setup

1. **Clone and Install**
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **Run Infrastructure**
   Requires Docker. Starts PostgreSQL.
   ```bash
   docker-compose up db -d
   ```

3. **Database Migration**
   ```bash
   cd backend
   npx prisma db push
   ```

4. **Start Servers**
   In terminal 1 (Backend):
   ```bash
   cd backend
   npm run dev
   ```
   
   In terminal 2 (Frontend):
   ```bash
   cd frontend
   npm run dev
   ```

## Deployment

### Frontend (Vercel)
The frontend is configured for deployment to Vercel under the project name `ledger`.
1. Link the project: `npx vercel link`
2. Deploy: `npx vercel deploy --prod`

### Backend (Persistent Server)
The backend requires a persistent server environment (e.g., Render, AWS ECS, DigitalOcean App Platform) due to the stateful Socket.io connections. Deploy using the provided `backend/Dockerfile`.

## Important Security Notes
- Private keys and JWT secrets must be rotated in production.
- Admin balance adjustments are subject to strict audit logging.
