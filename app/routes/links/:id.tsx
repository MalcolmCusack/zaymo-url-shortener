import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { supabaseAdmin, supabaseServer } from '~/utils/supabase.server';

type Click = { ts: string; referer: string | null; ua: string | null };
type LoaderData = {
  link: { id: string; original: string; created_at: string };
  clicks: Click[];
};

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
    .select('id, original, created_at')
    .eq('id', id)
    .single();
  if (linkErr || !link) throw new Response('Not found', { status: 404 });

  // Fetch last 100 clicks (use admin client to bypass RLS on click_events)
  const admin = supabaseAdmin();
  const { data: clicksRaw, error: clicksErr } = await admin
    .from('click_events')
    .select('ts, referer, ua')
    .eq('link_id', id)
    .order('ts', { ascending: false })
    .limit(100);
  if (clicksErr) throw new Response(clicksErr.message, { status: 500 });

  const body: LoaderData = {
    link: link as unknown as LoaderData['link'],
    clicks: (clicksRaw || []) as unknown as Click[],
  };

  return new Response(JSON.stringify(body), {
    headers: { ...Object.fromEntries(headers), 'content-type': 'application/json' },
  });
}

function Sparkline({ clicks }: { clicks: Click[] }) {
  const width = 240;
  const height = 40;
  const buckets = 30;

  if (!clicks.length) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-gray-300">
        <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="currentColor" strokeWidth="1" />
      </svg>
    );
  }

  const times = clicks.map((c) => new Date(c.ts).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const range = Math.max(1, maxTime - minTime);

  const counts = new Array<number>(buckets).fill(0);
  for (const t of times) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor(((t - minTime) / range) * (buckets - 1))));
    counts[idx] += 1;
  }
  const maxCount = Math.max(1, ...counts);
  const points = counts.map((c, i) => {
    const x = Math.round((i / (buckets - 1)) * width);
    const y = Math.round(height - (c / maxCount) * (height - 2) - 1);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-indigo-600">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LinkAnalytics() {
  const { link, clicks } = useLoaderData<LoaderData>();

  return (
    <div className="px-8 py-8">
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="card-title">Analytics</h1>
            <p className="text-sm text-gray-600 break-all">{link.original}</p>
            <p className="text-sm text-gray-500 mt-1">Last {clicks.length} clicks</p>
          </div>
          <Sparkline clicks={clicks} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Link to="/links" className="text-gray-700 hover:text-gray-900">Back</Link>
          <a href={`/links/${link.id}/export`} className="text-indigo-700 hover:text-indigo-900">Download CSV</a>
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <h2 className="card-title">Recent Clicks</h2>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 pr-4">Time</th>
              <th className="py-2 pr-4">Referrer</th>
              <th className="py-2">User-Agent</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {clicks.map((c, i) => (
              <tr key={i}>
                <td className="py-2 pr-4 whitespace-nowrap">{new Date(c.ts).toLocaleString()}</td>
                <td className="py-2 pr-4 break-all text-gray-700">{c.referer || ''}</td>
                <td className="py-2 break-all text-gray-600">{c.ua || ''}</td>
              </tr>
            ))}
            {clicks.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 text-gray-500">No clicks yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}


