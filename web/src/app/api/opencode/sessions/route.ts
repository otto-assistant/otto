import { NextResponse } from 'next/server';
import { createOpencodeClient } from '@opencode-ai/sdk';

export async function GET() {
  try {
    const client = createOpencodeClient({ baseUrl: 'http://127.0.0.1:4096' });
    const { data: sessions, error } = await client.session.list() as any;
    
    if (error) {
      throw new Error(error.message || 'Failed to fetch sessions from OpenCode');
    }
    
    return NextResponse.json({ success: true, sessions: sessions || [] });
  } catch (error: any) {
    console.error('OpenCode API Error:', error);
    // If opencode server is not running, we return empty instead of 500
    // so the dashboard doesn't crash, just shows no local sessions
    if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
      return NextResponse.json({ success: true, sessions: [], warning: 'OpenCode server offline' });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
