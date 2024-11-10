import { Router } from 'express';
import {
  createDashboardHandler,
  deleteDashboardByIdHandler,
  getDashboardHandler,
  getDashboardsHandler,
  testHandler,
  updateDashboardHandler,
  verifyDashboardAccessHandler,
} from './dashboard.resolver';
import { signInHandler } from '../auth/auth.resolver';

// Create a new Router instance
const router = Router();

// User Auth
router.post('/api/sign-in', signInHandler);

// Define your route here
router.get('/api/test', testHandler);
// Add keyword dashboard from json input
router.post('/api/dashboard/create', createDashboardHandler);
// Read item
router.get('/api/dashboards', getDashboardsHandler);
// router.get('/api/dashboard/:dashboard_id', getDashboardByIdHandler);
router.get('/api/dashboard/', getDashboardHandler);
// Update item
router.put('/api/dashboard/:dashboard_id', updateDashboardHandler);
// Delete item
router.delete('/api/dashboard/:dashboard_id', deleteDashboardByIdHandler);
// Verify dashboard access
router.post('/api/dashboard/verify', verifyDashboardAccessHandler);

// Export the router
export default router;
