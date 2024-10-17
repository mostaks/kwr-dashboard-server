import {app, db} from "../index";
import {
  createDashboardService,
  getDashboardByIdService,
} from "./dashboard.service";

// test server
app.get("/api/test", async (req: any, res: any) => {
  try {
    return res.status(200).send({greeting: "hello"});
  } catch (error) {
    console.error("Error greeting:", error);
    return res.status(500).send({error: "Server failed to greet client"});
  }
});

// Add keyword dashboard from json input
app.post("/api/dashboard/create", async (req: any, res: any) => {
  try {
    const dashboardRef = await createDashboardService(req.body);

    return res.status(200)
      .json({id: dashboardRef.id, message: "dashboard created successfully"});
  } catch (error) {
    console.error("Error creating dashboard:", error);
    return res.status(500).json({error: "Failed to create dashboard"});
  }
});

// read item
app.get("/api/dashboard/:dashboard_id", async (req: any, res: any) => {
  try {
    const dashboardId = req.params?.dashboard_id;
    const dashboard = await getDashboardByIdService(dashboardId, res);

    return res.status(200).send(dashboard);
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    return res.status(500).send({error: "Failed to fetch dashboard"});
  }
});

// read item
app.get("/api/dashboards", async (req: any, res: any) => {
  try {
    const dashboardRefs = db.collection("dashboards")
      .get();

    const response = {
      dashboards: dashboardRefs,
    };

    return res.status(200).send(response);
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    return res.status(500).send({error: "Failed to fetch dashboard"});
  }
});
