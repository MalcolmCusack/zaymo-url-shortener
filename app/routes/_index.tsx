// app/routes/_index.tsx
import * as cheerio from 'cheerio';
import { supabaseAdmin } from '~/utils/supabase.server';
import { randomId } from '~/utils/id';
import { Form, useActionData, useNavigation,  type ActionFunctionArgs } from 'react-router';
import { json } from '@remix-run/node'; // react router v7 doesn't have json??

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
    const file = form.get('html') as File | null;
  const pasted = form.get('pasted') as string | null;
  const filename = (file?.name ?? 'pasted.html').slice(0, 160);
  const html = file ? await file.text() : (pasted || '');

  if (!html.trim()) return json({ error: 'No HTML provided' }, { status: 400 });

  const $ = cheerio.load(html);

  // collect unique http(s) anchor hrefs
  const hrefs = new Set<string>();
  $('a[href]').each((_i, el) => {
    const href = String($(el).attr('href') || '');
    if (/^https?:\/\//i.test(href)) hrefs.add(href);
  });

  const supa = supabaseAdmin();

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
      created_by: null, // set from auth if you add user sessions
    })
    .select('*')
    .single();

  if (jobErr) return json({ error: jobErr.message }, { status: 500 });

  // create links + mapping
  const map = new Map<string, string>();
  for (const original of hrefs) {
    let id = randomId(8);
    for (let i = 0; i < 3; i++) {
      const { error } = await supa.from('links').insert({ id, original });
      if (!error) break;
      id = randomId(8);
    }
    const short = `${process.env.SHORT_DOMAIN}/r/${id}`;
    map.set(original, short);

    await supa.from('html_links').insert({
      job_id: job.id,
      link_id: id,
      original,
    });
  }

  // rewrite DOM
  $('a[href]').each((_i, el) => {
    const href = String($(el).attr('href') || '');
    const short = map.get(href);
    if (short) $(el).attr('href', short);
  });

  const outHtml = $.html();
  const bytesOut = enc.encode(outHtml).length;

  // update job stats
  await supa.from('html_jobs').update({
      bytes_out: bytesOut,
  }).eq('id', job.id);

  const links = Array.from(map.entries()).map(([original, short]) => ({ original, short }));
  const saved = bytesIn - bytesOut;

  return json({ filename, bytesIn, bytesOut, saved, links, outHtml });
}

type ActionData = Awaited<ReturnType<typeof action>>;

export default function Index() {
  const data = useActionData<ActionData>();
  const nav = useNavigation();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Email Link Shortener</h1>
        <p className="text-gray-600 mt-1">Shrink links to avoid Gmail clipping and improve deliverability.</p>

        <Form method="post" encType="multipart/form-data" className="mt-6 space-y-4">
          <div className="bg-white rounded-xl p-4 shadow">
            <label className="block text-sm font-medium text-gray-700">Upload HTML file</label>
            <input name="html" type="file" accept=".html,.htm" className="mt-2 block w-full file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700 hover:file:bg-indigo-100" />
            <div className="my-4 text-center text-gray-400">— or —</div>
            <label className="block text-sm font-medium text-gray-700">Paste HTML</label>
            <textarea name="pasted" rows={10} className="mt-2 w-full rounded-lg border p-3 font-mono text-sm" placeholder="Paste your HTML here..." />
          </div>

          <button disabled={nav.state !== 'idle'} className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
            {nav.state === 'submitting' ? 'Shortening…' : 'Shorten links'}
          </button>
        </Form>

        {data?.outHtml && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow">
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
              <a
                href={"data:text/html;charset=utf-8," + encodeURIComponent(data.outHtml)}
                download={data.filename?.replace(/\.html?$/i,"") + ".shortened.html"}
                className="rounded bg-gray-800 px-3 py-2 text-white"
              >
                Download HTML
              </a>
            </div>

            <div className="bg-white rounded-xl p-4 shadow">
              <h2 className="font-semibold mb-2">Mapping</h2>
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

            <div className="bg-white rounded-xl p-4 shadow">
              <h2 className="font-semibold mb-2">Preview</h2>
              <iframe className="w-full h-[600px] border rounded" srcDoc={data.outHtml} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}