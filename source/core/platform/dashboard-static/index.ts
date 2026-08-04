import { handleDashboardStatic } from "./handler.ts";
import type { Feature } from "../features.ts";

export { handleDashboardStatic } from "./handler.ts";

export const dashboardStaticFeature: Feature = {
  name: "dashboard-static",
  method: "GET",
  pattern: new URLPattern({ pathname: "/*" }),
  handle: handleDashboardStatic,
};
