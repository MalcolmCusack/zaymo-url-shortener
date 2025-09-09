import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { supabaseServer } from '~/utils/supabase.server';

type LoaderData =
  | { requireLogin: true }
  | {
      links: { id: string; original: string; created_at: string }[];
      page: number;
      pageSize: number;
      hasMore: boolean;
    };

export async function loader({ request }: LoaderFunctionArgs) {
  const supa = supabaseServer(request, new Headers());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { requireLogin: true } satisfies LoaderData;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // get the user's job ids
  const { data: jobs, error: jobsErr } = await supa
    .from('html_jobs')
    .select('id')
    .eq('created_by', user.id);
  if (jobsErr) throw new Response(jobsErr.message, { status: 500 });
  const jobIds = (jobs || []).map((j) => j.id);
  if (jobIds.length === 0) {
    return { links: [], page, pageSize, hasMore: false } satisfies LoaderData;
  }

  const { data, error, count } = await supa
    .from('html_links')
    .select('link_id, original, job_id, created_at', { count: 'exact' })
    .in('job_id', jobIds)
    .order('created_at', { ascending: false })
    .range(from, to);

    if (error) throw new Response(error.message, { status: 500 });

  const links = (data || []).map((r) => ({ id: r.link_id as unknown as string, original: r.original as string, created_at: r.created_at as string }));
  const hasMore = typeof count === 'number' ? to + 1 < count : links.length === pageSize;

  return { links, page, pageSize, hasMore } satisfies LoaderData;
}

export default function LinksPage() {
  const data = useLoaderData<LoaderData>();
  if ('requireLogin' in data) {
    return (
      <div className="container-narrow py-8">
        <div className="card">
          <p className="text-gray-700">Please <Link to="/login" className="text-indigo-700">login</Link> to view your links.</p>
        </div>
      </div>
    );
  }

  return (
    <div className=" px-8 py-8">
      <div className="card">
        <h1 className="card-title">Links</h1>
        <ul className="text-sm space-y-2">
          {data.links.map((l) => (
            <li key={l.id} className="break-all">
              <span className="text-gray-500">{new Date(l.created_at).toLocaleString()}</span>
              <span className="mx-2">—</span>
              <span className="text-gray-800">{l.original}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between mt-4">
          {data.page > 1 ? (
            <Link to={`?page=${data.page - 1}`} className="text-gray-700 hover:text-gray-900">Previous</Link>
          ) : <span />}
          {data.hasMore ? (
            <Link to={`?page=${data.page + 1}`} className="text-gray-700 hover:text-gray-900">Next</Link>
          ) : <span />}
        </div>
      </div>
    </div>
  );
}


