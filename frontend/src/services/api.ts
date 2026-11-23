/**
 * AEGISSTOR Frontend API Service Client
 */
import {
  StorageSummary,
  DriveInfo,
  SystemInfo,
  PerformanceCurrent,
  ScanSummary,
  ForecastResponse,
  RiskSummary,
  OptimizationRecommendationItem,
  SimulationResult,
  AuditLogItem,
  BackendHealthStatus,
  AWSConnectionStatus
} from "../types";

const DEFAULT_BACKEND_ORIGIN = "http://127.0.0.1:8000";
export const BACKEND_BASE = (import.meta as any).env?.VITE_API_BASE_URL ||
  ((import.meta as any).env?.VITE_API_PORT ? `http://127.0.0.1:${(import.meta as any).env.VITE_API_PORT}` : DEFAULT_BACKEND_ORIGIN);
export const API_BASE = `${BACKEND_BASE}/api`;
export const API_V1 = `${BACKEND_BASE}/api/v1`;

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal
    });
    return res;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

export async function fetchHealth(): Promise<BackendHealthStatus> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_BASE}/health`, {}, 5000);
    if (!res.ok) {
      const fallback = await fetchWithTimeout(`${API_BASE}/health`, {}, 5000);
      if (!fallback.ok) throw new Error(`Health probe failed: ${fallback.status}`);
      return fallback.json();
    }
    return res.json();
  } catch {
    const fallback = await fetchWithTimeout(`${API_BASE}/health`, {}, 5000);
    if (!fallback.ok) throw new Error(`Health probe failed`);
    return fallback.json();
  }
}

export async function fetchSystemInfo(): Promise<SystemInfo> {
  const res = await fetchWithTimeout(`${API_BASE}/system/info`, {}, 8000);
  if (!res.ok) throw new Error("Failed to fetch system info");
  return res.json();
}

export async function fetchStorageSummary(): Promise<StorageSummary> {
  const res = await fetchWithTimeout(`${API_BASE}/storage/summary`, {}, 8000);
  if (!res.ok) throw new Error("Failed to fetch storage summary");
  return res.json();
}

export async function fetchDrives(): Promise<DriveInfo[]> {
  const res = await fetchWithTimeout(`${API_BASE}/storage/drives`, {}, 8000);
  if (!res.ok) throw new Error("Failed to fetch storage drives");
  return res.json();
}

export async function fetchDiskIO(): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE}/storage/io`, {}, 8000);
  if (!res.ok) throw new Error("Failed to fetch disk I/O metrics");
  return res.json();
}

export async function triggerScan(targetPath: string, maxFiles: number = 30000, maxDepth: number = 4): Promise<any> {
  const res = await fetch(`${API_BASE}/storage/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_path: targetPath, max_files: maxFiles, max_depth: maxDepth })
  });
  return res.json();
}

export async function fetchScanStatus(): Promise<any> {
  const res = await fetch(`${API_BASE}/storage/scan/status`);
  return res.json();
}

export async function fetchLatestScan(): Promise<ScanSummary> {
  const res = await fetch(`${API_BASE}/storage/scan/latest`);
  if (!res.ok) throw new Error("Failed to fetch scan results");
  return res.json();
}

export async function fetchPerformanceCurrent(): Promise<PerformanceCurrent> {
  const res = await fetch(`${API_BASE}/performance/current`);
  if (!res.ok) throw new Error("Failed to fetch performance telemetry");
  return res.json();
}

export async function fetchPerformanceHistory(limit: number = 40): Promise<any[]> {
  const res = await fetch(`${API_BASE}/performance/history?limit=${limit}`);
  return res.json();
}

export async function fetchForecast(drive?: string): Promise<ForecastResponse> {
  const url = drive ? `${API_BASE}/forecast?drive=${encodeURIComponent(drive)}` : `${API_BASE}/forecast`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch ML forecast");
  return res.json();
}

export async function triggerForecastCalibrationSeed(): Promise<any> {
  const res = await fetch(`${API_BASE}/forecast/calibrate-seed`, { method: "POST" });
  return res.json();
}

export async function fetchRisks(): Promise<RiskSummary> {
  const res = await fetch(`${API_BASE}/risks`);
  if (!res.ok) throw new Error("Failed to evaluate storage risks");
  return res.json();
}

export async function fetchRecommendations(): Promise<OptimizationRecommendationItem[]> {
  const res = await fetch(`${API_BASE}/recommendations`);
  if (!res.ok) throw new Error("Failed to fetch optimization recommendations");
  return res.json();
}

export async function applyOptimizationAction(recommendationId: number, confirmed: boolean, deleteFilePaths?: string[]): Promise<any> {
  const res = await fetch(`${API_BASE}/recommendations/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recommendation_id: recommendationId,
      confirmed: confirmed,
      delete_file_paths: deleteFilePaths
    })
  });
  return res.json();
}

export async function runSimulation(params: {
  drive_name: string;
  monthly_growth_rate_percent?: number;
  removed_unnecessary_files_gb?: number;
  capacity_expansion_gb?: number;
  continuation_days?: number;
}): Promise<SimulationResult> {
  const res = await fetch(`${API_BASE}/simulation/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error("Simulation execution failed");
  return res.json();
}

export async function fetchHistory(hours: number = 24): Promise<any[]> {
  const res = await fetch(`${API_BASE}/history?hours=${hours}`);
  return res.json();
}

export async function fetchSettings(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/settings`);
  return res.json();
}

export async function updateSettings(settings: Record<string, string>): Promise<any> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
  return res.json();
}

export async function fetchAuditLogs(limit: number = 50): Promise<AuditLogItem[]> {
  const res = await fetch(`${API_BASE}/audit-logs?limit=${limit}`);
  return res.json();
}

/* =========================================================================
   ENTERPRISE & SECURITY API EXTENSIONS (V1)
========================================================================= */

export function getAuthToken(): string | null {
  return localStorage.getItem("aegisstor_access_token");
}

export function setAuthToken(token: string): void {
  localStorage.setItem("aegisstor_access_token", token);
}

export function clearAuthToken(): void {
  localStorage.removeItem("aegisstor_access_token");
  localStorage.removeItem("aegisstor_refresh_token");
}

function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

// Authentication
export async function loginUser(credentials: { email: string; password: string; totp_code?: string }): Promise<any> {
  const res = await fetch(`${API_V1}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Authentication error");
  }
  const data = await res.json();
  if (data.access_token) {
    setAuthToken(data.access_token);
  }
  return data;
}

export async function fetchCurrentUser(): Promise<any> {
  const res = await fetch(`${API_V1}/auth/me`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch current user profile");
  return res.json();
}

export async function setupMFA(): Promise<{ secret: string; otpauth_uri: string }> {
  const res = await fetch(`${API_V1}/auth/mfa/setup`, {
    method: "POST",
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to generate MFA setup key");
  return res.json();
}

export async function verifyMFA(totp_code: string): Promise<any> {
  const res = await fetch(`${API_V1}/auth/mfa/verify`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ totp_code })
  });
  if (!res.ok) throw new Error("Invalid MFA verification code");
  return res.json();
}

// User Management (Admin)
export async function fetchUsers(): Promise<any[]> {
  const res = await fetch(`${API_V1}/users/`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export async function createUser(userData: { email: string; password: string; full_name: string; role: string }): Promise<any> {
  const res = await fetch(`${API_V1}/users/`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(userData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to create user" }));
    throw new Error(err.detail || "Failed to create user");
  }
  return res.json();
}

// Enterprise Database Connectors
export async function fetchDatabases(): Promise<any[]> {
  const res = await fetch(`${API_V1}/databases/`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch databases");
  return res.json();
}

export async function createDatabaseConnection(dbData: {
  name: string;
  db_type: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  password?: string;
}): Promise<any> {
  const res = await fetch(`${API_V1}/databases/`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(dbData)
  });
  if (!res.ok) throw new Error("Failed to register enterprise database");
  return res.json();
}

export async function testDatabaseConnection(connId: number): Promise<any> {
  const res = await fetch(`${API_V1}/databases/${connId}/test`, {
    method: "POST",
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function syncDatabaseTelemetry(connId: number): Promise<any> {
  const res = await fetch(`${API_V1}/databases/${connId}/sync`, {
    method: "POST",
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function fetchDatabaseTelemetryLatest(connId: number): Promise<any> {
  const res = await fetch(`${API_V1}/databases/${connId}/telemetry`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch database telemetry");
  return res.json();
}

// Machine Learning Benchmarks & Multi-Horizon Predictions
export async function fetchMLBenchmarks(drive: string = "C:"): Promise<any> {
  const res = await fetch(`${API_V1}/predictions/benchmarks?drive=${encodeURIComponent(drive)}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to evaluate ML benchmarks");
  return res.json();
}

export async function fetchMultiHorizonForecast(drive: string = "C:"): Promise<any> {
  const res = await fetch(`${API_V1}/predictions/multi-horizon?drive=${encodeURIComponent(drive)}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to generate multi-horizon forecasts");
  return res.json();
}

// Anomaly Detection
export async function fetchAnomalies(): Promise<any[]> {
  const res = await fetch(`${API_V1}/anomalies/`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch storage anomalies");
  return res.json();
}

export async function acknowledgeAnomaly(anomalyId: number): Promise<any> {
  const res = await fetch(`${API_V1}/anomalies/${anomalyId}/acknowledge`, {
    method: "POST",
    headers: getAuthHeaders()
  });
  return res.json();
}

// Privacy Guard
export async function fetchPrivacyPolicy(): Promise<any> {
  const res = await fetch(`${API_V1}/privacy/policy`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to load privacy policy");
  return res.json();
}

export async function updatePrivacyPolicy(policy: {
  data_minimization_mode: boolean;
  mask_identifiers: boolean;
  retention_days: number;
  enforce_tenant_isolation: boolean;
}): Promise<any> {
  const res = await fetch(`${API_V1}/privacy/policy`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(policy)
  });
  return res.json();
}

export async function triggerRetentionPurge(): Promise<any> {
  const res = await fetch(`${API_V1}/privacy/purge`, {
    method: "POST",
    headers: getAuthHeaders()
  });
  return res.json();
}

// AWS Cloud Storage
export async function fetchAWSStatus(): Promise<AWSConnectionStatus> {
  const res = await fetchWithTimeout(`${API_V1}/aws/status?_t=${Date.now()}`, {
    headers: getAuthHeaders()
  }, 15000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `AWS status probe failed (${res.status})`);
  }
  return res.json();
}

export async function fetchAWSBucket(bucketName?: string): Promise<any> {
  const url = bucketName
    ? `${API_V1}/aws/s3/bucket?bucket_name=${encodeURIComponent(bucketName)}&_t=${Date.now()}`
    : `${API_V1}/aws/s3/bucket?_t=${Date.now()}`;
  const res = await fetchWithTimeout(url, {
    headers: getAuthHeaders()
  }, 18000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch AWS bucket details (${res.status})`);
  }
  return res.json();
}

export async function fetchAWSMetrics(bucketName?: string, days: number = 7): Promise<any> {
  const query = new URLSearchParams();
  if (bucketName) query.append("bucket_name", bucketName);
  query.append("days", days.toString());
  query.append("_t", Date.now().toString());
  const res = await fetchWithTimeout(`${API_V1}/aws/s3/metrics?${query.toString()}`, {
    headers: getAuthHeaders()
  }, 15000);
  if (!res.ok) throw new Error("Failed to fetch AWS CloudWatch metrics");
  return res.json();
}

export async function fetchAWSBucketsList(): Promise<any> {
  const res = await fetchWithTimeout(`${API_V1}/aws/s3/buckets?_t=${Date.now()}`, {
    headers: getAuthHeaders()
  }, 15000);
  if (!res.ok) throw new Error("Failed to list AWS buckets");
  return res.json();
}

export async function fetchAWSObject(key: string = "test-storage.txt", bucketName?: string): Promise<any> {
  const query = new URLSearchParams({ key, _t: Date.now().toString() });
  if (bucketName) query.append("bucket_name", bucketName);
  const res = await fetchWithTimeout(`${API_V1}/aws/s3/object?${query.toString()}`, {
    headers: getAuthHeaders()
  }, 15000);
  if (!res.ok) throw new Error("Failed to fetch AWS object details");
  return res.json();
}

export async function uploadAWSObject(file: File, bucketName?: string): Promise<any> {
  const formData = new FormData();
  formData.append("file", file);
  if (bucketName) formData.append("bucket_name", bucketName);

  const res = await fetch(`${API_V1}/aws/s3/upload`, {
    method: "POST",
    headers: {
      ...getAuthHeaders()
    },
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.message || "Failed to upload file to S3");
  }
  return res.json();
}

export async function downloadAWSObject(key: string, bucketName?: string): Promise<Blob> {
  const query = new URLSearchParams({ key });
  if (bucketName) query.append("bucket_name", bucketName);

  const res = await fetch(`${API_V1}/aws/s3/download?${query.toString()}`, {
    method: "GET",
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.message || "Failed to download object from S3");
  }
  return res.blob();
}

export async function deleteAWSObject(key: string, versionId?: string, bucketName?: string): Promise<any> {
  const query = new URLSearchParams({ key });
  if (versionId) query.append("version_id", versionId);
  if (bucketName) query.append("bucket_name", bucketName);

  const res = await fetch(`${API_V1}/aws/s3/object?${query.toString()}`, {
    method: "DELETE",
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.message || "Failed to delete object from S3");
  }
  return res.json();
}

export async function fetchAWSVersions(bucketName?: string, prefix?: string): Promise<any> {
  const query = new URLSearchParams();
  if (bucketName) query.append("bucket_name", bucketName);
  if (prefix) query.append("prefix", prefix);

  const res = await fetch(`${API_V1}/aws/s3/versions?${query.toString()}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.message || "Failed to fetch object versions");
  }
  return res.json();
}

// Advanced Predictive Intelligence & Historical Telemetry
export async function fetchAdvancedForecast(resourceId: string = "C:"): Promise<any> {
  const res = await fetch(`${API_V1}/forecasting/predictive?resource_id=${encodeURIComponent(resourceId)}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch advanced forecast");
  return res.json();
}

export async function fetchResourceHistory(resourceId: string = "C:", hours: number = 72): Promise<any> {
  const res = await fetch(`${API_V1}/telemetry/history?resource_id=${encodeURIComponent(resourceId)}&hours=${hours}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch resource history");
  return res.json();
}

export async function triggerSampleCollection(): Promise<any> {
  const res = await fetch(`${API_V1}/telemetry/collect-sample`, {
    method: "POST",
    headers: getAuthHeaders()
  });
  return res.json();
}

// =========================================================================
// Enterprise Notifications, Alert Rules & Incident Management
// =========================================================================

export async function fetchNotifications(params?: {
  category?: string;
  severity?: string;
  is_read?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; items: any[] }> {
  const query = new URLSearchParams();
  if (params?.category) query.append("category", params.category);
  if (params?.severity) query.append("severity", params.severity);
  if (params?.is_read !== undefined) query.append("is_read", params.is_read.toString());
  if (params?.search) query.append("search", params.search);
  if (params?.limit) query.append("limit", params.limit.toString());
  if (params?.offset) query.append("offset", params.offset.toString());

  const res = await fetch(`${API_V1}/notifications?${query.toString()}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  return res.json();
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const res = await fetch(`${API_V1}/notifications/unread-count`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unread_count || 0;
}

export async function markNotificationRead(id: number): Promise<any> {
  const res = await fetch(`${API_V1}/notifications/${id}/read`, {
    method: "PATCH",
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function markAllNotificationsRead(): Promise<any> {
  const res = await fetch(`${API_V1}/notifications/read-all`, {
    method: "POST",
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function archiveNotification(id: number): Promise<any> {
  const res = await fetch(`${API_V1}/notifications/${id}/archive`, {
    method: "PATCH",
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function fetchIncidents(params?: {
  status?: string;
  severity?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; items: any[] }> {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.severity) query.append("severity", params.severity);
  if (params?.category) query.append("category", params.category);
  if (params?.search) query.append("search", params.search);
  if (params?.limit) query.append("limit", params.limit.toString());
  if (params?.offset) query.append("offset", params.offset.toString());

  const res = await fetch(`${API_V1}/incidents?${query.toString()}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch incidents");
  return res.json();
}

export async function fetchIncidentStats(): Promise<any> {
  const res = await fetch(`${API_V1}/incidents/stats`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch incident statistics");
  return res.json();
}

export async function fetchIncidentDetails(id: number): Promise<any> {
  const res = await fetch(`${API_V1}/incidents/${id}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch incident details");
  return res.json();
}

export async function acknowledgeIncident(id: number, comment?: string): Promise<any> {
  const res = await fetch(`${API_V1}/incidents/${id}/acknowledge`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ comment })
  });
  if (!res.ok) throw new Error("Failed to acknowledge incident");
  return res.json();
}

export async function resolveIncident(id: number, comment?: string): Promise<any> {
  const res = await fetch(`${API_V1}/incidents/${id}/resolve`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ comment })
  });
  if (!res.ok) throw new Error("Failed to resolve incident");
  return res.json();
}

export async function fetchAlertRules(category?: string): Promise<any[]> {
  const url = category ? `${API_V1}/alert-rules?category=${encodeURIComponent(category)}` : `${API_V1}/alert-rules`;
  const res = await fetch(url, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch alert rules");
  return res.json();
}

export async function createAlertRule(ruleData: any): Promise<any> {
  const res = await fetch(`${API_V1}/alert-rules`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(ruleData)
  });
  if (!res.ok) throw new Error("Failed to create alert rule");
  return res.json();
}

export async function updateAlertRule(ruleId: number, ruleData: any): Promise<any> {
  const res = await fetch(`${API_V1}/alert-rules/${ruleId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(ruleData)
  });
  if (!res.ok) throw new Error("Failed to update alert rule");
  return res.json();
}

export async function deleteAlertRule(ruleId: number): Promise<any> {
  const res = await fetch(`${API_V1}/alert-rules/${ruleId}`, {
    method: "DELETE",
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function fetchNotificationPreferences(): Promise<any> {
  const res = await fetch(`${API_V1}/notification-preferences`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch notification preferences");
  return res.json();
}

export async function updateNotificationPreferences(prefs: any): Promise<any> {
  const res = await fetch(`${API_V1}/notification-preferences`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(prefs)
  });
  if (!res.ok) throw new Error("Failed to update notification preferences");
  return res.json();
}

export async function sendTestNotification(channel: string, recipient?: string, severity: string = "INFO"): Promise<any> {
  const res = await fetch(`${API_V1}/notifications/test`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ channel, recipient, severity })
  });
  return res.json();
}

export async function fetchSystemAnnouncements(): Promise<any[]> {
  const res = await fetch(`${API_V1}/system-updates`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch system announcements");
  return res.json();
}

export async function createSystemAnnouncement(data: {
  version: string;
  title: string;
  description: string;
  category: string;
  impact: string;
}): Promise<any> {
  const res = await fetch(`${API_V1}/system-updates`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}




