export interface CreateDashboardParams {
  name: string;
  suffix: string;
  tagCategories: string[];
  keywords: Record<string, string>[];
}

export interface GetDashboardParams {
  dashboardId: string;
}

export interface DashboardResponse {
  dashboards: Array<{
    id: string;
    [key: string]: any; // for the spread doc.data()
  }>;
}

export interface ErrorResponse {
  error: string;
}

export interface CreateDashboardResponse {
  id: string;
  message: string;
}