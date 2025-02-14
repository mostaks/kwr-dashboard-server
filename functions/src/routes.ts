import { Router } from 'express';
import { signInHandler } from './auth/auth.resolver';
import {
  cleanDashboardHandler,
  createDashboardHandler,
  deleteDashboardByIdHandler,
  getDashboardHandler,
  getDashboardsHandler,
  testHandler,
  updateDashboardHandler,
  verifyDashboardAccessHandler,
} from './dashboard/dashboard.resolver';
import {
  createClientHandler,
  deleteClientHandler,
  getClientHandler,
  getClientsHandler,
  updateClientHandler
} from "./client/client.resolver";

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
// Verify dashboard access
router.post('/api/dashboard/verify', verifyDashboardAccessHandler);
// Cleanup dashboard keywords
router.post('/api/dashboard/cleanup', cleanDashboardHandler);
// Dashboards END

// Clients START
router.get('/api/clients', getClientsHandler);
router.post('/api/client/', createClientHandler);
router.get('/api/client/:client_id', getClientHandler);
router.put('/api/client/:client_id', updateClientHandler);
router.delete('/api/client/:client_id', deleteClientHandler);

// Export the router
export default router;
