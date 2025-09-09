import { redirect, type LoaderFunctionArgs } from 'react-router';
import { supabaseServer } from '~/utils/supabase.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const headers = new Headers();
  const supa = supabaseServer(request, headers);
  await supa.auth.signOut();
  return redirect('/', { headers });
}


