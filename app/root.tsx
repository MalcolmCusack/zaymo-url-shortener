import './app.css';

import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  Link,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';

import { supabaseServer } from '~/utils/supabase.server';
import type { Route } from './+types/root';

// triggered when the page is loaded to get the user
export async function loader({ request }: LoaderFunctionArgs) {
  const supa = supabaseServer(request, new Headers());
  const {
    data: { user },
  } = await supa.auth.getUser();
  return {
    user: user ? { id: user.id, email: user.email } : null,
  } as const;
}

// head stuff (boilerplate)
export const links: Route.LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  },
];

// layout component (head, body, etc) (boilerplate)
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// app component (main component) whole app
export default function App() {
  const data = useLoaderData<{ user: { id: string; email: string | null } | null }>();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="container-narrow flex items-center justify-between py-3">
          <Link to="/" className="text-lg font-semibold">Email Link Shortener</Link>
          <nav className="flex items-center gap-4 text-sm">
            {data.user ? (
              <>
                <Link to="/links" className="text-gray-700 hover:text-gray-900">Links</Link>
                <span className="text-gray-500 hidden sm:inline">{data.user.email}</span>
                <Link to="/logout" className="text-gray-700 hover:text-gray-900">Logout</Link>
              </>
            ) : (
              <Link to="/login" className="text-gray-700 hover:text-gray-900">Login</Link>
            )}
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

// error boundary (boilerplate)
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details =
      error.status === 404 ? 'The requested page could not be found.' : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
