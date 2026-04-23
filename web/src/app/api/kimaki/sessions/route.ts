import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';

export async function GET() {
  try {
    const dbPath = path.join(os.homedir(), '.kimaki', 'discord-sessions.db');
    const db = new Database(dbPath, { readonly: true });
    
    // Get latest active threads
    const sessions = db.prepare(`
      SELECT 
        ts.thread_id, 
        ts.session_id, 
        ts.channel_id, 
        ts.project_directory, 
        ts.created_at,
        cd.channel_type
      FROM thread_sessions ts
      LEFT JOIN channel_directories cd ON ts.channel_id = cd.channel_id
      ORDER BY ts.created_at DESC
      LIMIT 50
    `).all();
    
    db.close();
    
    return NextResponse.json({ success: true, sessions });
  } catch (error: any) {
    console.error('Kimaki DB Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
