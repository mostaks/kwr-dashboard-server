import { db } from '..';
import {
  createDashboardService,
  deleteDashboardByIdService,
  getDashboardByIdService,
  getDashboardBySuffixService,
  updateDashboardService,
} from './dashboard.service';
import { cleanupKeywords } from './dashboard';

export const testHandler = async (req: any, res: any) => {
  try {
    return await res.status(200).send({ greeting: 'hello test' });
  } catch (error) {
    console.error('Error greeting:', error);
    return res.status(500).send({ error: 'Server failed to greet client' });
  }
};

export const createDashboardHandler = async (req: any, res: any) => {
  try {
    const dashboardRef = await createDashboardService(req.body);
    return res.status(200).json({
      id: dashboardRef.id,
      message: 'dashboard created successfully',
    });
  } catch (error) {
    console.error('Error creating dashboard:', error);
    return res.status(500).json({ error: 'Failed to create dashboard' });
  }
};

export const getDashboardsHandler = async (req: any, res: any) => {
  try {
    const { clientId } = req.query;
    let snapshot;

    if (clientId) {
      snapshot = await db
        .collection('dashboards')
        .where('clientId', '==', clientId)
        .get();
    } else {
      snapshot = await db.collection('dashboards').get();
    }

    if (snapshot.empty) {
      console.log('No matching documents found.');
      return res.status(200).json({ dashboards: [] });
    }
    const items: any[] = [];
    snapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() }); // Get document ID and data
    });

    const response = {
      dashboards: items,
    };
    return res.status(200).json(response);
  } catch (error) {
    console.error(error);
  }
};

export const getDashboardsForClientHandler = async (req: any, res: any) => {
  try {
    const clientId = req.params.client_id;

    // Add validation
    if (!clientId) {
      return res.status(400).json({ error: 'Client ID is required' });
    }
    console.log('clientId', clientId);
    const snapshot = await db
      .collection('dashboards')
      .where('clientId', '==', clientId)
      .get();

    if (snapshot.empty) {
      console.log('No matching documents found.');
      return res.status(200).json({ dashboards: [] });
    }
    const items: any[] = [];
    snapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() }); // Get document ID and data
    });

    const response = {
      dashboards: items,
    };
    return res.status(200).json(response);
  } catch (error) {
    console.error(error);
  }
};

export const getDashboardHandler = async (req: any, res: any) => {
  try {
    const { suffix, dashboard_id } = req.query;
    let dashboard;
    if (suffix) {
      dashboard = await getDashboardBySuffixService(suffix, res);
    } else if (dashboard_id) {
      dashboard = await getDashboardByIdService(dashboard_id, res);
    }

    return res.status(200).send(dashboard);
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return res.status(500).send({ error: 'Failed to fetch dashboard' });
  }
};

export const cleanDashboardHandler = async (req: any, res: any) => {
  try {
    const { suffix, dashboard_id } = req.query;
    let dashboardId = dashboard_id;

    if (suffix) {
      const dashboard = await getDashboardBySuffixService(suffix, res);
      dashboardId = dashboard.id;
    }

    if (!dashboardId) {
      return res.status(400).send({ error: 'Dashboard ID is required' });
    }

    await cleanupKeywords(db, dashboardId);
    return res
      .status(200)
      .send({ message: 'Dashboard keywords cleaned successfully' });
  } catch (error) {
    console.error('Error cleaning dashboard:', error);
    return res.status(500).send({ error: 'Failed to clean dashboard' });
  }
};

export const deleteDashboardByIdHandler = async (
  req: any,
  res: any,
): Promise<void> => {
  const dashboardId = req.params?.dashboard_id;

  if (!dashboardId) {
    res.status(400).json({ error: 'Dashboard ID is required' });
    return;
  }

  try {
    await deleteDashboardByIdService(dashboardId, db);

    res.status(200).json({
      message: `Dashboard ${dashboardId} successfully deleted`,
      dashboardId,
    });
  } catch (error: any) {
    console.error('Error in deleteDashboardByIdHandler:', error);

    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }

    res.status(500).json({
      error: 'Internal server error while deleting dashboard',
      details: error.message,
    });
  }
};

export const updateDashboardHandler = async (req: any, res: any) => {
  try {
    const dashboardId = req.params?.dashboard_id;

    if (!dashboardId) {
      return res.status(400).json({ error: 'Dashboard ID is required' });
    }

    const dashboardRef = await updateDashboardService(dashboardId, req.body);
    const dashboardDoc = await dashboardRef.get();
    const dashboardData = dashboardDoc.data();

    if (dashboardData) {
      return res.status(200).json({
        id: dashboardRef.id,
        name: dashboardData.name,
        suffix: dashboardData.suffix,
        password: dashboardData.password,
        logo: dashboardData.logo,
        visibleTagCategories: dashboardData.visibleTagCategories,
      });
    } else {
      return res.status(200).json({
        error: {
          code: '',
          message: 'Dashboard update failed',
        },
      });
    }
  } catch (error) {
    console.error('Error updating dashboard:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to update dashboard' });
  }
};
