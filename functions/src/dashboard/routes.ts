import { Router } from 'express';
import {
    createDashboardHandler,
    getDashboardByIdHandler,
    getDashboardsHandler,
    testHandler,
} from './dashboard.resolver';

// Create a new Router instance
const router = Router();
// Define your route here
router.get('/api/test', testHandler);
// Add keyword dashboard from json input
router.post('/api/dashboard/create', createDashboardHandler);
// Read item
router.get('/api/dashboards', getDashboardsHandler);
router.get('/api/dashboard/:dashboard_id', getDashboardByIdHandler);

// Export the router
export default router;
