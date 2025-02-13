import {
  createClientService,
  deleteClientService, getClientService,
  updateClientService
} from "./client.service";

export const createClientHandler = async (req: any, res: any) => {
  try {
    const clientRef = await createClientService(req.body);
    const clientData = await clientRef.get();

    return res.status(200).json({
      id: clientRef.id,
      ...clientData.data(),
      message: 'client created successfully',
    });
  } catch (error: any) {
    console.error('Error creating client:', error);
    return res.status(error.code || 500)
      .json({ error: `Failed to create client: ${error.message}` });
  }
};

export const getClientHandler = async (req: any, res: any) => {
  try {
    const clientRef = await getClientService(req.params.client_id);
    const clientData = await clientRef.get();

    return res.status(200).json({
      id: clientRef.id,
      ...clientData.data(),
    });
  } catch (error: any) {
    console.error('Error getting client', error);
    return res.status(error.code || 500)
      .json({ error: `Failed to get client: ${error.message}` });
  }
};

export const updateClientHandler = async (req: any, res: any) => {
  try {
    const clientRef = await updateClientService(req.params.client_id, req.body);
    const clientData = await clientRef.get();
    return res.status(200).json({
      id: clientRef.id,
      ...clientData.data(),
      message: 'client updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating client:', error);
    return res.status(error.code || 500)
      .json({ error: `Failed to update client: ${error.message}` });
  }
};

export const deleteClientHandler = async (req: any, res: any) => {
  try {
    const clientRef = await deleteClientService(req.params.client_id);
    return res.status(200).json({
      id: clientRef.id,
      message: 'client deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting client:', error);
    return res.status(error.code || 500)
      .json({ error: `Failed to delete client: ${error.message}` });
  }
};
