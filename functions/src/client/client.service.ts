import { logger } from "firebase-functions/v2";
import { db } from "../index";
import { ICreateClientArgs } from "./client";

export const getAllClientsService = async () => {
  logger.info('client.service.getAllClientsService');
  try {
    const clientsSnapshot = await db.collection('clients').get();

    if (clientsSnapshot.empty) {
      throw ({ name: 'Error', message: 'No clients found', code: 404 });
    }

    // Get all dashboards
    const dashboardsSnapshot = await db.collection('dashboards').get();

    // Create a map to store dashboard counts per client
    const dashboardCountMap = new Map();

    // Count dashboards for each client
    dashboardsSnapshot.forEach(dashboard => {
      const clientId = dashboard.data().clientId;
      if (clientId) {
        const currentCount: number = dashboardCountMap.get(clientId) || 0;
        dashboardCountMap.set(clientId, currentCount + 1);
      }
    });

    // Add dashboard count to each client
    const clientsWithDashboardCount = clientsSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      dashboardCount: dashboardCountMap.get(doc.id) || 0
    }));

    return clientsWithDashboardCount;
  } catch (error: any) {
    // Rethrow the error if it's already formatted
    if (error.code) {
      throw error;
    }
    // Otherwise, format the error
    throw ({
      name: 'InternalError',
      message: error.message,
      code: 500
    });
  }
};

export const createClientService = async (body: ICreateClientArgs) => {
  logger.info('client.service.createClientService');
  try {
    const {
      name,
      suffix,
      logoUrl,
      password,
      description,
      websiteUrl
    } = body;

    // Create a new client document reference
    const clientRef = db.collection('clients')
      .doc();

    if (!name) {
      throw ({ name: 'Error', message: 'No name was provided when creating client', code: 400 });
    }

    // Create the client object
    await clientRef.set({
      name,
      suffix,
      logoUrl,
      websiteUrl,
      description,
      password,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return clientRef;
  } catch (error: any) {
    // Rethrow the error if it's already formatted
    if (error.code) {
      throw error;
    }
    // Otherwise, format the error
    throw ({
      name: 'InternalError',
      message: error.message,
      code: 500
    });
  }
};

export const getClientService = async (clientId: string) => {
  logger.info('client.service.getClientService');
  try {
    const clientRef = db.collection('clients').doc(clientId);
    const clientData = await clientRef.get();

    if (!clientData.exists) {
      throw ({ name: 'Error', message: 'Client not found', code: 404 });
    }

    // Get dashboards for this specific client
    const dashboardsSnapshot = await db.collection('dashboards')
      .where('clientId', '==', clientId)
      .get();

    // Return client data with dashboard count
    return {
      ...clientData.data(),
      id: clientData.id,
      dashboardCount: dashboardsSnapshot.size
    };
  } catch (error: any) {
    // Rethrow the error if it's already formatted
    if (error.code) {
      throw error;
    }
    // Otherwise, format the error
    throw ({
      name: 'InternalError',
      message: error.message,
      code: 500
    });
  }
};

export const updateClientService = async (clientId: string, body: Partial<ICreateClientArgs>) => {
  logger.info('client.service.updateClientService');
  try {
    const clientRef = db.collection('clients')
      .doc(clientId);

    if (!clientRef) {
      throw ({ name: 'Error', message: 'Client not found', code: 404 });
    }

    // Update the client object with new fields and updated timestamp
    await clientRef.update({
      ...body,
      updatedAt: new Date()
    });

    return clientRef;
  } catch (error: any) {
    // Rethrow the error if it's already formatted
    if (error.code) {
      throw error;
    }
    // Otherwise, format the error
    throw ({
      name: 'InternalError',
      message: error.message,
      code: 500
    });
  }
};

export const deleteClientService = async (clientId: string) => {
  logger.info('client.service.deleteClientService');
  try {
    const clientRef = db.collection('clients')
      .doc(clientId);

    if (!clientRef) {
      throw ({ name: 'Error', message: 'Client not found', code: 404 });
    }

    // Get all dashboards for this client
    const dashboardsSnapshot = await db.collection('dashboards')
      .where('clientId', '==', clientId)
      .get();

    // Delete all dashboards in a batch
    const batch = db.batch();
    dashboardsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    await clientRef.delete();
    return clientRef;
  } catch (error: any) {
    // Rethrow the error if it's already formatted
    if (error.code) {
      throw error;
    }
    // Otherwise, format the error
    throw ({
      name: 'InternalError',
      message: error.message,
      code: 500
    });
  }
};
