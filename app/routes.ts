import { index, route, type RouteConfig } from '@react-router/dev/routes';

// routes 
// TODO: protect the routes (auth)
export default [
    index('routes/index.tsx'), 
    route('/r/:id', 'routes/r/:id.tsx'), 
    route('/links', 'routes/links.tsx'), 
    route('/logout', 'routes/logout.tsx'), 
    route('/login', 'routes/login.tsx'),
] satisfies RouteConfig;
