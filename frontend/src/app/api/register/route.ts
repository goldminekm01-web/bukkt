import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, firstName, lastName, name, email, phone } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const userId = id || "usr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const fullName = name || `${firstName || ''} ${lastName || ''}`.trim() || email;

    // Check if user already exists by email
    const existing = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${email})`;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'This email is already registered.' }, { status: 400 });
    }

    // Record each account once; repeated registration must not rewrite its details.
    const insertedUsers = await sql`
      INSERT INTO users (id, first_name, last_name, name, email, phone, role, balance, created_at)
      VALUES (${userId}, ${firstName || ''}, ${lastName || ''}, ${fullName}, ${email}, ${phone || ''}, 'USER', '{"USDT": 0, "ETH": 0}'::jsonb, NOW())
      ON CONFLICT (email) DO NOTHING
      RETURNING id, first_name, last_name, name, email, phone, created_at;
    `;

    if (insertedUsers.length === 0) {
      return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 });
    }

    const user = insertedUsers[0];
    return NextResponse.json({ success: true, user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      name: user.name,
      email: user.email,
      phone: user.phone,
      createdAt: user.created_at
    } });
  } catch (err: any) {
    console.error("Neon DB Registration Error:", err);
    return NextResponse.json({ error: err.message || 'Database registration failed' }, { status: 500 });
  }
}
