import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { supabaseAdmin } from "~/utils/supabase.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id!;
  const supa = supabaseAdmin();
  const { data, error } = await supa.from("links").select("original").eq("id", id).single();
  if (error || !data) throw new Response("Not found", { status: 404 });

  // log click best-effort (do not await)
  const ua = request.headers.get("user-agent") || "";
  const referer = request.headers.get("referer") || "";
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipHash = ip
    ? Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip))).toString("hex").slice(0,32)
    : null;

  supa.from("click_events").insert({ link_id: id, ua, referer, ip_hash: ipHash ?? undefined }).then(() => {});

  return redirect(data.original, { status: 302 });
}