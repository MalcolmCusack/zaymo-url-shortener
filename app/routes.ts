import { index, route, type RouteConfig } from '@react-router/dev/routes';

// routes 
// TODO: protect the routes (auth)
export default [
    index('routes/index.tsx'), 
    route('/r/:id', 'routes/r/:id.tsx'), 
    route('/links', 'routes/links.tsx'),
    route('/links/:id', 'routes/links/:id.tsx'),
    route('/links/:id/export', 'routes/links/:id/export.tsx'),
    route('/logout', 'routes/logout.tsx'), 
    route('/login', 'routes/login.tsx'),
] satisfies RouteConfig;
