import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import * as cookie from 'cookie';

/**
 * Create a supabase admin client
 * @returns the admin client
 */
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Create a supabase server client
 * @param request the request
 * @param responseHeaders the response headers
 * @returns the server client
 */
export function supabaseServer(request: Request, responseHeaders: Headers) {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;

  const getCookie = (name: string): string | undefined => {
    const cookieHeader = request.headers.get('cookie') || '';
    const parsed = cookie.parse(cookieHeader);
    return parsed[name];
  };

  const setCookie = (name: string, value: string, options: CookieOptions) => {
    const serialized = cookie.serialize(name, value, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      ...options,
    });
    responseHeaders.append('set-cookie', serialized);
  };

  const removeCookie = (name: string, options: CookieOptions) => {
    const serialized = cookie.serialize(name, '', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      expires: new Date(0),
      maxAge: 0,
      ...options,
    });
    responseHeaders.append('set-cookie', serialized);
  };

  // create the server client (deprecated, but works)
  return createServerClient(url, anon, {
    cookies: {
      get: getCookie,
      set: setCookie,
      remove: removeCookie,
    },
  });
}
