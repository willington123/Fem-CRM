# Fem-CRM

CRM omnicanal de Fem: bandeja de WhatsApp / Instagram / Facebook, seguimiento de
pedidos tomados por WhatsApp, flujos automáticos de mensajes y analítica.

Next.js 14 (App Router) · Prisma · PostgreSQL en Supabase · Tailwind · desplegado en Vercel.

La aplicación vive en [`apps/web`](apps/web). Ahí está el
[README completo](apps/web/README.md) con la puesta en marcha, el detalle de las
credenciales y los webhooks que hay que registrar.

```bash
cd apps/web
npm install
cp .env.example .env.local   # y rellena los valores
npm run dev
```

Para verlo funcionando sin credenciales: `npm run preview`.

## Despliegue en Vercel

Proyecto de Vercel con **Root Directory** en `apps/web`. Las variables de
`apps/web/.env.example` van en Settings → Environment Variables. El cron
`/api/cron/flows` está declarado en `apps/web/vercel.json` una vez al día, porque
el plan gratuito de Vercel no permite más. Para que el recordatorio de
confirmación salga a los 90 minutos, programa un servicio externo (por ejemplo
cron-job.org) que llame cada 10 minutos a `https://TU-DOMINIO/api/cron/flows`
con la cabecera `Authorization: Bearer <CRON_SECRET>`, o pasa a Vercel Pro y
vuelve a poner `*/10 * * * *`.
