import { Form, Link, redirect, useActionData, useNavigation } from 'react-router';
import type { ActionFunctionArgs } from 'react-router';
import { supabaseServer } from '~/utils/supabase.server';

type ActionData = { error: string } | null;

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent') || 'signin');
  const email = String(form.get('email') || '');
  const password = String(form.get('password') || '');
  if (!email || !password) return { error: 'Email and password are required' } satisfies ActionData;

  const headers = new Headers();
  const supa = supabaseServer(request, headers);

  if (intent === 'signup') {
    const { error } = await supa.auth.signUp({ email, password });
    if (error) return { error: error.message } satisfies ActionData;
    return redirect('/', { headers });
  }

  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message } satisfies ActionData;
  return redirect('/', { headers });
}

export default function Login() {
  const data = useActionData<ActionData>();
  const nav = useNavigation();
  const isSubmitting = nav.state !== 'idle';
  const error = data && 'error' in data ? data.error : null;

  return (
    <div className="container-narrow py-8">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-gray-600 mt-1">Use your email and password.</p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <Form method="post" className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              name="email"
              required
              className="mt-1 w-full rounded-md border p-2"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              name="password"
              required
              className="mt-1 w-full rounded-md border p-2"
              placeholder="••••••••"
            />
          </div>
          <div className="flex gap-2">
            <button
              name="intent"
              value="signin"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 cursor-pointer"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              name="intent"
              value="signup"
              disabled={isSubmitting}
              className="flex-1 rounded-lg border px-4 py-2 hover:bg-gray-50 cursor-pointer"
            >
              {isSubmitting ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </Form>

        <div className="mt-4 text-sm">
          <Link to="/" className="text-gray-700 hover:text-gray-900">Back home</Link>
        </div>
      </div>
    </div>
  );
}


