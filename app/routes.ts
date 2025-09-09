import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [index('routes/_index.tsx'), route('/r/:id', 'routes/r.$id.tsx')] satisfies RouteConfig;
