import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    const users = await sql`
      SELECT id, first_name, last_name, name, email, phone, role, balance, wallet_address, created_at
      FROM users
      ORDER BY created_at DESC;
    `;

    const formattedUsers = users.map((u: any) => ({
      id: u.id,
      name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
      email: u.email,
      phone: u.phone || '',
      balances: u.balance || { USDT: 0, ETH: 0 },
      walletAddress: u.wallet_address || '',
      createdAt: u.created_at
    }));

    return NextResponse.json({ users: formattedUsers });
  } catch (err: any) {
    console.error("Neon DB Fetch Users Error:", err);
    return NextResponse.json({ users: [] }, { status: 500 });
  }
}
