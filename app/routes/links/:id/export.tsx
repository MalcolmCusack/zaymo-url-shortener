import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { supabaseAdmin, supabaseServer } from '~/utils/supabase.server';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id!;
  const headers = new Headers();
  const supa = supabaseServer(request, headers);
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return redirect('/login');

  // Verify ownership via RLS-enabled client
  const { data: link, error: linkErr } = await supa
    .from('links')
    .select('id')
    .eq('id', id)
    .single();
  if (linkErr || !link) throw new Response('Not found', { status: 404 });

  const admin = supabaseAdmin();
  const { data: rows, error } = await admin
    .from('click_events')
    .select('ts, referer, ua')
    .eq('link_id', id)
    .order('ts', { ascending: true });
  if (error) throw new Response(error.message, { status: 500 });

  const header = ['ts', 'referer', 'ua'];
  const escape = (v: unknown) => {
    const s = (v ?? '') as string;
    const needsQuote = /[",\n]/.test(s);
    const out = String(s).replace(/"/g, '""');
    return needsQuote ? `"${out}"` : out;
  };
  const lines = [header.join(',')];
  for (const r of rows || []) {
    lines.push([escape(r.ts), escape(r.referer), escape(r.ua)].join(','));
  }
  const csv = lines.join('\n');

  const respHeaders = new Headers({
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="link_${id}_clicks.csv"`,
    'cache-control': 'no-store',
    ...Object.fromEntries(headers),
  });
  return new Response(csv, { headers: respHeaders });
}


