import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyMediaToken } from '@/services/media';

export const dynamic = 'force-dynamic';

/**
 * Sirve el archivo de un mensaje. Las etiquetas <img>/<audio> no pueden mandar
 * cabecera Authorization, así que la autorización va en un token firmado y de
 * vida corta que emite el detalle de la conversación.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = new URL(req.url).searchParams.get('t');
  if (!verifyMediaToken(params.id, token)) {
    return new NextResponse('No autorizado', { status: 401 });
  }

  const media = await prisma.messageMedia.findUnique({ where: { messageId: params.id } });
  if (!media) return new NextResponse('No encontrado', { status: 404 });

  const body = new Uint8Array(media.data);
  const disposition = media.filename
    ? `inline; filename="${encodeURIComponent(media.filename)}"`
    : 'inline';

  return new NextResponse(body, {
    headers: {
      'Content-Type': media.mimeType,
      'Content-Length': String(media.size),
      'Content-Disposition': disposition,
      // El token ya limita el acceso; el binario nunca cambia.
      'Cache-Control': 'private, max-age=21600',
    },
  });
}
