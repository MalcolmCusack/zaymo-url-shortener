import * as cheerio from 'cheerio';
import { supabaseServer } from '~/utils/supabase.server';
import { randomId } from '~/utils/id';
import { Form, useActionData, useLoaderData, useNavigation,  type ActionFunctionArgs } from 'react-router';
import HtmlUploader from '~/components/HtmlUploader';
import CopyButton from '~/components/CopyButton';

const MAX_HTML_BYTES = Number(process.env.MAX_HTML_BYTES || String(5 * 1024 * 1024)); // default 5 MiB

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
  const retryOriginal = form.get('retryOriginal') as string | null;
  const currentHtml = form.get('currentHtml') as string | null;
  const incomingFilename = form.get('filename') as string | null;
  const existingJobId = form.get('jobId') as string | null;

  // retry mode uses currentHtml and a single original to attempt again
  const isRetry = !!retryOriginal;
  const hasFile = file && file.size > 0;
  const filename = (
    (isRetry ? (incomingFilename || 'pasted.html') : (hasFile ? file!.name : 'pasted.html')) || 'pasted.html'
  ).slice(0, 160);
  // early guard: uploaded file byte limit (avoid reading huge file into memory)
  if (!isRetry && hasFile && file!.size > MAX_HTML_BYTES) {
    return { error: `Upload too large. Max ${Math.floor(MAX_HTML_BYTES / (1024 * 1024))} MiB.` };
  }
  const html = isRetry ? (currentHtml || '') : (hasFile ? await file!.text() : (pasted || ''));

  if (!html.trim()) return { error: 'No HTML provided' };

  // prepare helpers
  const headers = new Headers();
  const supa = supabaseServer(request, headers);
  const { data: userData } = await supa.auth.getUser();
  const enc = new TextEncoder();

  // upload size guardrail (use file size if present, else encoded bytes)
  const uploadBytes = (file && file.size > 0) ? file.size : enc.encode(html).length;
  if (uploadBytes > MAX_HTML_BYTES) {
    return { error: `Upload too large. Max ${Math.floor(MAX_HTML_BYTES / (1024 * 1024))} MiB.` };
  }

  // determine the absolute short domain. Prefer env, fallback to current request origin.
  const reqOrigin = new URL(request.url).origin;
  let shortDomain = (process.env.SHORT_DOMAIN || reqOrigin).trim();
  if (!/^https?:\/\//i.test(shortDomain)) shortDomain = `https://${shortDomain}`;
  shortDomain = shortDomain.replace(/\/+$/, '');

  const isAlreadyShort = (href: string) => href.toLowerCase().startsWith(`${shortDomain}/r/`.toLowerCase());
  const hasTemplateToken = (href: string) => /\{\{[\s\S]*?\}\}/.test(href) || /\{%\s*unsubscribe_link\s*%\}/i.test(href);
  const shouldProcess = (href: string) => {
    if (!/^https?:\/\//i.test(href)) return false; // only http(s)
    if (isAlreadyShort(href)) return false;
    if (hasTemplateToken(href)) return false;
    return true;
  };

  // parse HTML
  const $ = cheerio.load(html);

  // collect unique candidates
  const allHrefs = new Set<string>();
  // visible links (anchors)
  $('a[href]').each((_i, el) => {
    const href = String($(el).attr('href') || '');
    if (shouldProcess(href)) allHrefs.add(href);
  });
  // hidden links in data attributes
  const dataUrlAttrs = ['data-href', 'data-url', 'data-link'];
  for (const attr of dataUrlAttrs) {
    $(`[${attr}]`).each((_i, el) => {
      const href = String($(el).attr(attr) || '');
      if (shouldProcess(href)) allHrefs.add(href);
    });
  }

  // in retry mode, restrict to the one we are retrying
  const targets = new Set<string>();
  if (isRetry && retryOriginal) {
    if (allHrefs.has(retryOriginal)) targets.add(retryOriginal);
    else targets.add(retryOriginal); // even if not found, attempt insert so we can show error/success
  } else {
    for (const h of allHrefs) targets.add(h);
  }

  // create or reuse job
  const bytesIn = enc.encode(html).length;
  let jobId = existingJobId || '';
  if (!jobId) {
    const { data: job, error: jobErr } = await supa
      .from('html_jobs')
      .insert({
        filename,
        bytes_in: bytesIn,
        bytes_out: 0,
        link_count: targets.size,
        created_by: userData?.user?.id ?? null,
      })
      .select('*')
      .single();

    if (jobErr) return { error: jobErr.message };
    jobId = job!.id as unknown as string;
  }

  // create links + mapping for each link, record per-link errors
  const map = new Map<string, string>();
  const results: { original: string; short?: string; error?: string }[] = [];
  for (const original of targets) {
    let id = randomId(8);
    let insertError: string | null = null;
    for (let i = 0; i < 3; i++) {
      const { error } = await supa
        .from('links')
        .insert({ id, original, created_by: userData.user?.id ?? null });
      if (!error) {
        insertError = null;
        break;
      }
      insertError = error.message;
      id = randomId(8);
    }

    if (insertError) {
      results.push({ original, error: insertError });
      continue;
    }

    const short = `${shortDomain}/r/${id}`;
    map.set(original, short);
    results.push({ original, short });
    // best-effort job→link mapping
    try {
      await supa.from('html_links').insert({ job_id: jobId, link_id: id, original });
    } catch {
      // ignore mapping errors in response; they won't block rewriting
    }
  }

  // rewrite DOM (replace the hrefs with the short links)
  $('a[href]').each((_i, el) => {
    const href = String($(el).attr('href') || '');
    const replacement = map.get(href);
    if (replacement) $(el).attr('href', replacement);
  });
  for (const attr of ['data-href', 'data-url', 'data-link']) {
    $(`[${attr}]`).each((_i, el) => {
      const href = String($(el).attr(attr) || '');
      const replacement = map.get(href);
      if (replacement) $(el).attr(attr, replacement);
    });
  }

  const outHtml = $.html();
  const bytesOut = enc.encode(outHtml).length;

  // update job stats (bytes_out)
  await supa
    .from('html_jobs')
    .update({ bytes_out: bytesOut, created_by: userData?.user?.id ?? null })
    .eq('id', jobId);

  const saved = bytesIn - bytesOut;
  return { filename, jobId, bytesIn, bytesOut, saved, links: results, outHtml };
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

        {data && typeof (data as { error?: unknown }).error === 'string' ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 text-red-800 p-3">
            {(data as { error?: string }).error}
          </div>
        ) : null}

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
                {data.links.map((l: { original: string; short?: string; error?: string }, i: number) => (
                  <li key={i} className="break-all flex flex-col gap-1">
                    <div>
                      <span className="text-gray-500">{l.original}</span>
                      <span className="mx-2">→</span>
                      {l.short ? (
                        <span className="text-indigo-700">{l.short}</span>
                      ) : (
                        <span className="text-red-600">{l.error || 'Failed to create short link'}</span>
                      )}
                    </div>
                    {!l.short ? (
                      <Form method="post" replace={false} className="flex items-center gap-2">
                        <input type="hidden" name="retryOriginal" value={l.original} />
                        <input type="hidden" name="currentHtml" value={data.outHtml} />
                        <input type="hidden" name="jobId" value={data.jobId} />
                        <input type="hidden" name="filename" value={data.filename} />
                        <button
                          disabled={nav.state !== 'idle'}
                          className="inline-flex items-center rounded bg-red-600/10 px-2 py-1 text-red-700 hover:bg-red-600/20"
                        >
                          {nav.state === 'submitting' ? 'Retrying…' : 'Retry'}
                        </button>
                      </Form>
                    ) : null}
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