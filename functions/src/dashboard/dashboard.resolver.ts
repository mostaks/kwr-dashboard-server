import { db } from '..';
import {
  createDashboardService,
  getDashboardByIdService,
} from './dashboard.service';

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
    return res
      .status(200)
      .json({ id: dashboardRef.id, message: 'dashboard created successfully' });
  } catch (error) {
    console.error('Error creating dashboard:', error);
    return res.status(500).json({ error: 'Failed to create dashboard' });
  }
};

export const getDashboardsHandler = async (req: any, res: any) => {
  try {
    const snapshot = await db.collection('dashboards')
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

export const getDashboardByIdHandler = async (req: any, res: any) => {
  try {
    const dashboardId = req.params?.dashboard_id;
    const dashboard = await getDashboardByIdService(dashboardId, res);

    return res.status(200).send(dashboard);
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return res.status(500).send({ error: 'Failed to fetch dashboard' });
  }
};
