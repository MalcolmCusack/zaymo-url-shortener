import * as cheerio from 'cheerio';
import { supabaseServer } from '~/utils/supabase.server';
import { randomId } from '~/utils/id';
import { Form, useActionData, useLoaderData, useNavigation,  type ActionFunctionArgs } from 'react-router';
import HtmlUploader from '~/components/HtmlUploader';
import CopyButton from '~/components/CopyButton';

type LoaderData = { 
  recent: { 
    id: number; 
    filename: string; 
    created_at: string; 
    link_count: number; 
    bytes_in: number; 
    bytes_out: number 
  }[] 
};

// triggered when the Form is submitted via de button
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const file = form.get('html') as File | null;
  const pasted = form.get('pasted') as string | null;

  // check if there is a file or pasted html
  const hasFile = file && file.size > 0;
  // get the filename from the file or pasted html, max 160 characters
  const filename = ((hasFile ? file!.name : 'pasted.html') || 'pasted.html').slice(0, 160);
  const html = hasFile ? await file!.text() : (pasted || '');

  if (!html.trim()) return { error: 'No HTML provided' };

  // load the html into cheerio (parse/manipulate the html)
  const $ = cheerio.load(html);

  // collect unique http(s) anchor hrefs (links)
  const hrefs = new Set<string>();
  $('a[href]').each((_i, el) => {
    const href = String($(el).attr('href') || '');
    if (/^https?:\/\//i.test(href)) hrefs.add(href);
  });

  const headers = new Headers();
  // get supabase user if signed in
  const supa = supabaseServer(request, headers);
  const { data: userData } = await supa.auth.getUser();
  // create job
  const enc = new TextEncoder();
  const bytesIn = enc.encode(html).length;

  const { data: job, error: jobErr } = await supa
    .from('html_jobs')
    .insert({
      filename,
      bytes_in: bytesIn,
      bytes_out: 0,
      link_count: hrefs.size,
      created_by: userData?.user?.id ?? null,
    })
    .select('*')
    .single();

  if (jobErr) return { error: jobErr.message };

  // determine the absolute short domain. Prefer env, fallback to current request origin.
  // TODO: this is a hack to get the short domain. It's not ideal because it's not a static domain.
  const reqOrigin = new URL(request.url).origin;
  let shortDomain = (process.env.SHORT_DOMAIN || reqOrigin).trim();

  // if the short domain doesn't start with https://, add it
  if (!/^https?:\/\//i.test(shortDomain)) shortDomain = `https://${shortDomain}`; 
  shortDomain = shortDomain.replace(/\/+$/, '');

  // create links + mapping for each link
  const map = new Map<string, string>();
  for (const original of hrefs) {
    let id = randomId(8);
    // try to insert the link 3 times if it fails
    for (let i = 0; i < 3; i++) {
      const { error } = await supa.from('links').insert({ id, original, created_by: userData.user?.id ?? null });
      if (!error) break;
      id = randomId(8);
    }

    // create the short link
    const short = `${shortDomain}/r/${id}`;
    map.set(original, short);

    // create the mapping from the job to the link
    await supa.from('html_links').insert({
      job_id: job.id,
      link_id: id,
      original,
    });
  }

  // rewrite DOM (replace the hrefs with the short links)
  $('a[href]').each((_i, el) => {
    const href = String($(el).attr('href') || '');
    const short = map.get(href);
    if (short) $(el).attr('href', short);
  });

  // get the html of the document
  const outHtml = $.html();
  // get the bytes of the html
  const bytesOut = enc.encode(outHtml).length;

  // update job stats (bytes_out)
  await supa.from('html_jobs').update({
      bytes_out: bytesOut,
      created_by: userData?.user?.id ?? null,
  }).eq('id', job.id);

  // create the links array
  const links = Array.from(map.entries()).map(([original, short]) => ({ original, short }));
  // calculate the saved bytes
  const saved = bytesIn - bytesOut;

  // return the data
  return { filename, bytesIn, bytesOut, saved, links, outHtml };
}

type ActionData = Awaited<ReturnType<typeof action>>;

// triggered when the page is loaded
export async function loader({ request }: { request: Request }) {
  const headers = new Headers();
  const supa = supabaseServer(request, headers);
  const { data: userData } = await supa.auth.getUser();

  let recent: { id: number; filename: string; created_at: string; link_count: number; bytes_in: number; bytes_out: number }[] = [];

  // get the recent jobs if the user is signed in
  if (userData.user) {
    const { data, error } = await supa
      .from('html_jobs')
      .select('id, filename, created_at, link_count, bytes_in, bytes_out')
      .eq('created_by', userData.user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!error && data) recent = data as unknown as typeof recent;
  }

  return new Response(JSON.stringify({ recent }), { headers: { ...Object.fromEntries(headers), 'content-type': 'application/json' } });
}

export default function Index() {
  const data = useActionData<ActionData>();
  const nav = useNavigation();
  const { recent } = useLoaderData<LoaderData>();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-narrow">
        <h1 className="text-2xl font-semibold">Email Link Shortener</h1>
        <p className="text-gray-600 mt-1">Shrink links to avoid Gmail clipping and improve deliverability.</p>

        <Form method="post" encType="multipart/form-data" replace={false} className="mt-6 space-y-4">
          <HtmlUploader nameFile="html" nameTextarea="pasted" />

          <div className="flex justify-end pt-1">
            <button disabled={nav.state !== 'idle'} className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 cursor-pointer">
              {nav.state === 'submitting' ? 'Shortening…' : 'Shorten links'}
            </button>
          </div>
        </Form>

        {data?.outHtml && (
          <div className="section-gap">
            <div className="flex items-center justify-between card">
              <div>
                <p className="text-sm text-gray-500">Size</p>
                <p className="text-lg font-medium">
                  {(data.bytesIn/1024).toFixed(1)} KB → {(data.bytesOut/1024).toFixed(1)} KB
                  <span className="ml-2 text-gray-500">({(data.saved/1024).toFixed(1)} KB saved)</span>
                </p>
                <p className={"text-sm mt-1 " + (data.bytesOut >= 200*1024 ? "text-red-600" : data.bytesOut >= 102*1024 ? "text-amber-600":"text-gray-500")}>
                  {data.bytesOut >= 200*1024 ? "⚠ Gmail will clip (≥200 KB)" :
                   data.bytesOut >= 102*1024 ? "Heads up: email is getting large (≥102 KB)" :
                   "Looks good"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CopyButton html={data.outHtml} />
                <a
                  href={"data:text/html;charset=utf-8," + encodeURIComponent(data.outHtml)}
                  download={data.filename?.replace(/\.html?$/i,"") + ".shortened.html"}
                  className="rounded bg-gray-800 px-3 py-2 text-white"
                >
                  Download HTML
                </a>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title">Mapping</h2>
              <ul className="text-sm space-y-2">
                {data.links.map((l, i) => (
                  <li key={i} className="break-all">
                    <span className="text-gray-500">{l.original}</span>
                    <span className="mx-2">→</span>
                    <span className="text-indigo-700">{l.short}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h2 className="card-title">Preview</h2>
              <iframe className="w-full h-[600px] border rounded" srcDoc={data.outHtml} />
            </div>
          </div>
        )}

        {recent?.length ? (
          <div className="card mt-6">
            <h2 className="card-title">Recent Jobs</h2>
            <ul className="text-sm divide-y">
              {recent.map((j) => {
                const saved = j.bytes_in - j.bytes_out;
                return (
                  <li key={j.id} className="py-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{j.filename}</p>
                      <p className="text-gray-500">{new Date(j.created_at).toLocaleString()}</p>
                    </div>
                    <div className="text-right whitespace-nowrap ml-4">
                      <p className="text-gray-700">{j.link_count} links</p>
                      <p className="text-gray-500">{(saved/1024).toFixed(1)} KB saved</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}