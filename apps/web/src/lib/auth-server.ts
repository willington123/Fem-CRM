import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    const user = await prisma.crmUser.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive) return null;
    return { id: user.id, email: user.email, role: user.role, name: user.name };
  } catch {
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
}
