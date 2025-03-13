import { Router } from 'express';
import { signInHandler } from './auth/auth.resolver';
import {
  cleanDashboardHandler,
  createDashboardHandler,
  deleteDashboardByIdHandler,
  getDashboardHandler,
  getDashboardsForClientHandler,
  getDashboardsHandler,
  testHandler,
  updateDashboardHandler,
} from './dashboard/dashboard.resolver';
import {
  createClientHandler,
  deleteClientHandler,
  getClientHandler,
  getClientsHandler,
  updateClientHandler,
  verifyClientAccessHandler,
} from './client/client.resolver';

// Create a new Router instance
const router = Router();

// User Auth
router.post('/api/sign-in', signInHandler);

router.get('/api/test', testHandler);

// Dashboards START
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
// // Verify dashboard access
// router.post('/api/dashboard/verify', verifyDashboardAccessHandler);
// Cleanup dashboard keywords
router.post('/api/dashboard/cleanup', cleanDashboardHandler);
// Dashboards END

// Clients START
router.get('/api/clients', getClientsHandler);
router.get('/api/clients/dashboards/:client_id', getDashboardsForClientHandler);
router.post('/api/client/', createClientHandler);
router.get('/api/client/:client_id', getClientHandler);
router.put('/api/client/:client_id', updateClientHandler);
router.delete('/api/client/:client_id', deleteClientHandler);
// Verify client access
router.post('/api/client/verify', verifyClientAccessHandler);

// Export the router
export default router;
