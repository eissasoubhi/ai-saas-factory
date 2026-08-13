import { NextResponse } from 'next/server';
import type { HealthResponse } from '@factory/contracts';

export function GET() {
  const body: HealthResponse = { status: 'ok', service: 'web', version: '0.1.0' };
  return NextResponse.json(body);
}
