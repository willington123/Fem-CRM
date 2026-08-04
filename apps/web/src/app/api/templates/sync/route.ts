import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { fetchMetaTemplates } from '@/services/whatsapp';

// Meta usa MARKETING/UTILITY/AUTHENTICATION; el CRM tiene categorías propias.
// La categoría solo se asigna al crear — si luego la cambian a mano, se respeta.
const CATEGORY_MAP: Record<string, 'PROMOTIONAL' | 'SUPPORT'> = {
  MARKETING: 'PROMOTIONAL',
  UTILITY: 'SUPPORT',
  AUTHENTICATION: 'SUPPORT',
};

const STATUS_MAP: Record<string, 'APPROVED' | 'PENDING' | 'REJECTED'> = {
  APPROVED: 'APPROVED',
  PENDING: 'PENDING',
  IN_APPEAL: 'PENDING',
  REJECTED: 'REJECTED',
  PAUSED: 'REJECTED',
  DISABLED: 'REJECTED',
};

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  let metaTemplates;
  try {
    metaTemplates = await fetchMetaTemplates();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error de la API de Meta' }, { status: 502 });
  }
  if (!metaTemplates) {
    return NextResponse.json({ error: 'WhatsApp no está configurado' }, { status: 503 });
  }

  let synced = 0;
  for (const t of metaTemplates) {
    const body = t.components?.find(c => c.type === 'BODY')?.text || '';
    const variables = Array.from(new Set(
      Array.from(body.matchAll(/{{\s*(\w+)\s*}}/g)).map(m => m[1])
    ));
    const data = {
      name: t.name,
      language: t.language,
      content: body,
      variables,
      status: STATUS_MAP[t.status] || ('PENDING' as const),
      metaTemplateId: t.id,
    };

    const existing = await prisma.messageTemplate.findFirst({
      where: { OR: [{ metaTemplateId: t.id }, { name: t.name, language: t.language }] },
    });

    if (existing) {
      await prisma.messageTemplate.update({ where: { id: existing.id }, data });
    } else {
      await prisma.messageTemplate.create({
        data: { ...data, category: CATEGORY_MAP[t.category] || 'SUPPORT', channels: ['WHATSAPP'] },
      });
    }
    synced++;
  }

  return NextResponse.json({ synced });
}
