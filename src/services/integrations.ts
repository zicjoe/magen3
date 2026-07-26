import type { HealthStatus } from "@yieldbot/shared";
import { apiFetch } from "./api";

export async function getIntegrationHealth(probe = true) {
  return apiFetch<HealthStatus>(`/v1/system/health${probe ? "?probe=1" : ""}`);
}
