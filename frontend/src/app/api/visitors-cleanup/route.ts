import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Delete visitors older than 24 hours from Neon Postgres
    try {
      await sql`
        DELETE FROM visitors
        WHERE timestamp < ${cutoff}
      `;
    } catch (neonErr) {
      console.warn("Neon visitor cleanup warning:", neonErr);
    }

    // Delete visitors older than 24 hours from Firestore
    try {
      const { db } = await import('@/lib/firebase');
      const { collection, getDocs, query, where, doc, deleteDoc } = await import('firebase/firestore');

      const visitorsRef = collection(db, 'visitors');
      const q = query(visitorsRef, where('timestamp', '<', cutoff));
      const snap = await getDocs(q);

      const deletePromises = snap.docs.map((d) => deleteDoc(doc(db, 'visitors', d.id)));
      await Promise.all(deletePromises);

      return NextResponse.json({
        success: true,
        deletedCount: snap.size,
        cutoff,
      });
    } catch (fbErr) {
      console.error("Firestore visitor cleanup error:", fbErr);
      return NextResponse.json({
        success: false,
        error: "Firestore cleanup failed",
      }, { status: 500 });
    }
  } catch (err: any) {
    console.error("Visitor cleanup error:", err);
    return NextResponse.json({
      success: false,
      error: err.message || "Cleanup failed",
    }, { status: 500 });
  }
}
