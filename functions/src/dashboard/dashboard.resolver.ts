import { db } from "..";
import {
  createDashboardService,
  deleteDashboardByIdService,
  getDashboardByClientSuffixandDashboardSuffixService,
  getDashboardByIdService,
  getDashboardBySuffixService,
  updateDashboardService,
} from "./dashboard.service";
import { cleanupKeywords } from "./dashboard";

// Add interface at the top of the file after imports
interface TagCategory {
  id: string;
  name: string;
  [key: string]: any; // For any additional fields that might be in the tag category document
}

export const testHandler = async (req: any, res: any) => {
  try {
    const greeting = await new Promise((resolve) => {
      setTimeout(() => {
        resolve("hello test");
      }, 1000);
    });
    return res.status(200).json({ greeting });
  } catch (error) {
    console.error("Error greeting:", error);
    return res.status(500).json({ error: "Server failed to greet client" });
  }
};

export const createDashboardHandler = async (req: any, res: any) => {
  try {
    const dashboardRef = await createDashboardService(req.body);
    return res.status(200).json({
      id: dashboardRef.id,
      message: "dashboard created successfully",
    });
  } catch (error: any) {
    console.error("Error creating dashboard:", {
      name: error.name,
      message: error.message,
      code: error.code,
    });
    return res.status(error.code || 500).json({
      name: error.name || "Error",
      message: error.message || "Failed to create dashboard",
      code: error.code || 500,
    });
  }
};

export const getDashboardsHandler = async (req: any, res: any) => {
  try {
    const { clientId } = req.query;
    let snapshot;

    if (clientId) {
      snapshot = await db
        .collection("dashboards")
        .where("clientId", "==", clientId)
        .get();
    } else {
      snapshot = await db.collection("dashboards").get();
    }

    if (snapshot.empty) {
      console.log("No matching documents found.");
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
      return res.status(400).json({ error: "Client ID is required" });
    }
    const snapshot = await db
      .collection("dashboards")
      .where("clientId", "==", clientId)
      .get();

    if (snapshot.empty) {
      console.log("No matching documents found.");
      return res.status(200).json({ dashboards: [] });
    }

    const items: any[] = [];

    // Process each dashboard document
    for (const doc of snapshot.docs) {
      const dashboardData = doc.data();

      // Fetch tag categories if they exist
      let resolvedTagCategories: TagCategory[] = [];
      if (
        dashboardData.tagCategories &&
        dashboardData.tagCategories.length > 0
      ) {
        const tagCategoryDocs = await db.getAll(...dashboardData.tagCategories);
        resolvedTagCategories = tagCategoryDocs.map((categoryDoc) => {
          const data = categoryDoc.data();
          return {
            id: categoryDoc.id,
            name: data?.name || "Unnamed Category", // Provide a default name if missing
            ...data,
          };
        });
      }

      items.push({
        id: doc.id,
        ...dashboardData,
        tagCategories: resolvedTagCategories,
      });
    }

    const response = {
      dashboards: items,
    };
    return res.status(200).json(response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch dashboards" });
  }
};

export const getDashboardHandler = async (req: any, res: any) => {
  try {
    const { dashboardSuffix, dashboard_id, clientSuffix, timeRange } =
      req.query;
    console.log("get dashboard handler param:", {
      dashboardSuffix,
      dashboard_id,
      clientSuffix,
      timeRange,
    });

    const timeRangeInt =
      timeRange === "undefined" ? null : parseInt(timeRange, 10);

    let dashboard;
    if (dashboardSuffix) {
      // Get the dashboard data without sending response
      dashboard = await getDashboardByClientSuffixandDashboardSuffixService(
        clientSuffix,
        dashboardSuffix,
        null, // Don't pass res to avoid response handling in service
        timeRangeInt
      );
    } else if (dashboard_id) {
      // Get the dashboard data without sending response
      dashboard = await getDashboardByIdService(
        dashboard_id,
        null, // Don't pass res to avoid response handling in service
        timeRangeInt
      );
    }

    if (!dashboard) {
      return res.status(404).json({ error: "Dashboard not found" });
    }

    // Send response only once, here in the handler
    return res.status(200).json(dashboard);
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard" });
  }
};

export const cleanDashboardHandler = async (req: any, res: any) => {
  try {
    const { suffix, dashboard_id } = req.query;
    let dashboardId = dashboard_id;

    if (suffix) {
      const dashboard = await getDashboardBySuffixService(suffix, null, null);
      dashboardId = dashboard.id;
    }

    if (!dashboardId) {
      return res.status(400).json({ error: "Dashboard ID is required" });
    }

    await cleanupKeywords(db, dashboardId);
    return res
      .status(200)
      .json({ message: "Dashboard keywords cleaned successfully" });
  } catch (error) {
    console.error("Error cleaning dashboard:", error);
    return res.status(500).json({ error: "Failed to clean dashboard" });
  }
};

export const deleteDashboardByIdHandler = async (
  req: any,
  res: any
): Promise<void> => {
  const dashboardId = req.params?.dashboard_id;

  if (!dashboardId) {
    res.status(400).json({ error: "Dashboard ID is required" });
    return;
  }

  try {
    await deleteDashboardByIdService(dashboardId, db);

    res.status(200).json({
      message: `Dashboard ${dashboardId} successfully deleted`,
      dashboardId,
    });
  } catch (error: any) {
    console.error("Error in deleteDashboardByIdHandler:", error);

    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
      return;
    }

    res.status(500).json({
      error: "Internal server error while deleting dashboard",
      details: error.message,
    });
  }
};

export const updateDashboardHandler = async (req: any, res: any) => {
  try {
    const dashboardId = req.params?.dashboard_id;

    if (!dashboardId) {
      return res.status(400).json({ error: "Dashboard ID is required" });
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
        description: dashboardData.description,
      });
    } else {
      return res.status(200).json({
        error: {
          code: "",
          message: "Dashboard update failed",
        },
      });
    }
  } catch (error) {
    console.error("Error updating dashboard:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(500).json({ error: "Failed to update dashboard" });
  }
};
