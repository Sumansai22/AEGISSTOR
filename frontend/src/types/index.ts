export interface DriveInfo {
  device: string;
  mountpoint: string;
  fstype: string;
  opts: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  usage_percent: number;
  drive_type?: string;
  hardware_name?: string;
  read_bytes_sec: number;
  write_bytes_sec: number;
  read_ops_sec: number;
  write_ops_sec: number;
  disk_health: string;
}

export interface StorageSummary {
  total_drives: number;
  total_storage_bytes: number;
  total_used_bytes: number;
  total_free_bytes: number;
  overall_usage_percent: number;
  total_storage_gb?: number;
  total_used_gb?: number;
  total_free_gb?: number;
  last_collection_timestamp?: string;
  data_quality_status?: string;
  drives: DriveInfo[];
}

export interface AWSConnectionStatus {
  success: boolean;
  connected: boolean;
  status: string;
  account_id?: string;
  region?: string;
  profile?: string;
  arn?: string;
  user_id?: string;
  verified_at?: string;
  data_source?: string;
  is_expired?: boolean;
  remedy?: string;
  message?: string;
}

export interface BackendHealthStatus {
  status: string;
  app: string;
  version: string;
  database?: string;
  uptime_seconds?: number;
  started_at?: string;
}

export interface SystemInfo {
  hostname: string;
  os_name: string;
  os_release: string;
  os_version: string;
  machine_architecture: string;
  processor: string;
  cpu_physical_cores: number;
  cpu_logical_cores: number;
  total_ram_gb: number;
  system_boot_time: string;
  python_version: string;
}

export interface ProcessItem {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_percent: number;
  memory_mb: number;
  username: string;
  status: string;
}

export interface PerformanceCurrent {
  timestamp: string;
  cpu_percent: number;
  cpu_count_logical: number;
  cpu_count_physical: number;
  memory_total_bytes: number;
  memory_used_bytes: number;
  memory_free_bytes: number;
  memory_percent: number;
  io_read_mb_s: number;
  io_write_mb_s: number;
  network_sent_mb_s: number;
  network_recv_mb_s: number;
  top_processes: ProcessItem[];
}

export interface FileItem {
  path: string;
  name: string;
  size_bytes: number;
  size_formatted: string;
  category: string;
  extension: string;
  modified_time: string;
  is_safe_to_delete: boolean;
}

export interface FolderItem {
  path: string;
  name: string;
  size_bytes: number;
  size_formatted: string;
  file_count: number;
  subfolder_count: number;
}

export interface DuplicateGroup {
  file_hash: string;
  size_bytes: number;
  size_formatted: string;
  count: number;
  wasted_bytes: number;
  files: {
    path: string;
    name: string;
    size_bytes: number;
    modified_time: string;
  }[];
}

export interface CategoryStat {
  category: string;
  extension_list: string[];
  total_bytes: number;
  size_formatted: string;
  file_count: number;
  percent_of_scanned: number;
}

export interface ScanSummary {
  id?: number;
  target_path: string;
  status: string;
  timestamp: string;
  duration_sec: number;
  total_files: number;
  total_dirs: number;
  total_bytes: number;
  size_formatted: string;
  largest_files: FileItem[];
  largest_folders: FolderItem[];
  duplicates: DuplicateGroup[];
  categories: CategoryStat[];
  temp_files_bytes: number;
  temp_files_count: number;
  temp_files_list: FileItem[];
}

export interface ForecastPoint {
  timestamp: string;
  label: string;
  predicted_used_bytes: number;
  predicted_usage_percent: number;
  confidence_lower_bytes: number;
  confidence_upper_bytes: number;
  confidence_lower_percent: number;
  confidence_upper_percent: number;
}

export interface ForecastMetric {
  mae_gb: number;
  rmse_gb: number;
  mape_percent: number;
  sample_count: number;
  model_name: string;
  r2_score: number;
}

export interface StorageRunway {
  hours_to_80_percent: number | null;
  hours_to_90_percent: number | null;
  hours_to_95_percent: number | null;
  estimated_exhaustion_days: number | null;
  daily_growth_gb: number;
  growth_trend_description: string;
}

export interface ForecastResponse {
  drive_name: string;
  current_used_bytes: number;
  total_capacity_bytes: number;
  current_usage_percent: number;
  sufficient_data: boolean;
  data_points_collected: number;
  min_required_points: number;
  model_type: string;
  status_message: string;
  metrics: ForecastMetric | null;
  runway: StorageRunway;
  forecast_points: ForecastPoint[];
  historical_points: {
    timestamp: string;
    used_gb: number;
    usage_percent: number;
  }[];
}

export interface RiskAlertItem {
  id?: number;
  timestamp: string;
  drive_name: string;
  risk_level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  title: string;
  reason: string;
  recommended_action: string;
  is_resolved: boolean;
}

export interface RiskSummary {
  overall_system_risk: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  active_alerts_count: number;
  critical_count: number;
  high_count: number;
  moderate_count: number;
  low_count: number;
  alerts: RiskAlertItem[];
}

export interface OptimizationRecommendationItem {
  id: number;
  timestamp: string;
  drive_name: string;
  category: string;
  issue: string;
  expected_benefit: string;
  estimated_recovery_bytes: number;
  estimated_recovery_formatted: string;
  risk_level: "LOW" | "MODERATE" | "HIGH";
  recommended_action: string;
  target_paths: string[];
  status: "PENDING" | "APPLIED" | "DISMISSED";
}

export interface SimulationResult {
  scenario_name: string;
  drive_name: string;
  current_total_bytes: number;
  current_used_bytes: number;
  current_free_bytes: number;
  current_usage_percent: number;
  current_risk: string;

  projected_total_bytes: number;
  projected_used_bytes: number;
  projected_free_bytes: number;
  projected_usage_percent: number;
  projected_risk: string;

  days_to_exhaustion: number | null;
  estimated_exhaustion_date: string;
  risk_change_summary: string;
  simulation_notes: string[];
  timeline_projection: {
    day: number;
    date: string;
    projected_used_gb: number;
    projected_free_gb: number;
    projected_usage_percent: number;
  }[];
}

export interface AuditLogItem {
  id: number;
  timestamp: string;
  action_type: string;
  description: string;
  status: string;
  user_email?: string;
  org_id?: number;
  ip_address?: string;
}

export interface Organization {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  is_active: boolean;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "SUPER_ADMIN" | "DATABASE_ADMIN" | "ANALYST" | "VIEWER";
  org_id: number;
  is_active: boolean;
  mfa_enabled: boolean;
  created_at: string;
  last_login?: string;
}

export interface DatabaseConnection {
  id: number;
  org_id: number;
  name: string;
  db_type: "POSTGRESQL" | "MYSQL" | "SQL_SERVER" | "ORACLE";
  host: string;
  port: number;
  database_name: string;
  username: string;
  is_active: boolean;
  created_at: string;
  last_tested?: string;
  status: string;
}

export interface TableStorageInfo {
  table_name: string;
  schema?: string;
  total_bytes: number;
  data_bytes: number;
  index_bytes: number;
  row_count: number;
  bloat_ratio?: number;
}

export interface IndexStorageInfo {
  index_name: string;
  table_name: string;
  size_bytes: number;
  is_bloated?: boolean;
}

export interface TablespaceStorageInfo {
  tablespace_name: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  usage_percent: number;
}

export interface DatabaseTelemetry {
  id?: number;
  db_conn_id: number;
  timestamp: string;
  total_storage_bytes: number;
  data_bytes: number;
  index_bytes: number;
  active_connections: number;
  tablespaces: TablespaceStorageInfo[];
  largest_tables: TableStorageInfo[];
  largest_indexes: IndexStorageInfo[];
}

export interface StorageAnomaly {
  id: number;
  org_id: number;
  resource_type: "LOCAL_DRIVE" | "ENTERPRISE_DB";
  resource_identifier: string;
  anomaly_type: "UNUSUAL_GROWTH" | "SUDDEN_DROP" | "INDEX_BLOAT" | "IO_SATURATION" | "OUTLIER";
  severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  detected_at: string;
  anomaly_score: number;
  details: string;
  is_acknowledged: boolean;
}

export interface PrivacyPolicy {
  id: number;
  org_id: number;
  telemetry_retention_days: number;
  audit_retention_days: number;
  anonymize_identifiers: boolean;
  metadata_only_mode: boolean;
  updated_at: string;
}

export interface ModelBenchmark {
  model_name: string;
  mae_gb: number;
  rmse_gb: number;
  mape_percent: number;
  r2_score: number;
  selected_for_forecast: boolean;
}

export interface RunwayMilestone {
  percent: number;
  predicted_date: string;
  days_remaining: number;
}

// Notification & Incident Subsystem Types

export interface NotificationItem {
  id: number;
  event_id: string;
  incident_id?: number | null;
  title: string;
  message: string;
  category: "STORAGE" | "DATABASE" | "PERFORMANCE" | "AWS" | "AI_FORECAST" | "SECURITY" | "ANNOUNCEMENT" | string;
  severity: "INFO" | "WARNING" | "CRITICAL" | "EMERGENCY";
  source: string;
  resource?: string;
  details_json: string;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface IncidentItem {
  id: number;
  incident_number: string;
  title: string;
  category: string;
  severity: "INFO" | "WARNING" | "CRITICAL" | "EMERGENCY";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "ESCALATED";
  resource: string;
  root_cause_evidence?: string;
  recommended_action?: string;
  related_telemetry_json?: string;
  escalation_level: number;
  escalated_at?: string | null;
  created_at: string;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  resolution_notes?: string | null;
}

export interface DeliveryLogItem {
  channel: string;
  recipient: string;
  status: string;
  attempt_count: number;
  provider_response?: string;
  error_message?: string;
  delivered_at?: string;
}

export interface AcknowledgementItem {
  user_email: string;
  action_type: string;
  comment?: string;
  timestamp: string;
}

export interface IncidentDetails extends IncidentItem {
  delivery_logs: DeliveryLogItem[];
  acknowledgement_history: AcknowledgementItem[];
}

export interface IncidentStats {
  total_incidents: number;
  open_incidents: number;
  critical_incidents: number;
  emergency_incidents: number;
  acknowledged_incidents: number;
  resolved_incidents: number;
  mtta_minutes: number;
  mttr_minutes: number;
  trends: Array<{
    date: string;
    warning: number;
    critical: number;
    emergency: number;
  }>;
}

export interface AlertRuleItem {
  id: number;
  name: string;
  category: string;
  metric_key: string;
  operator: string;
  warning_threshold?: number | null;
  critical_threshold?: number | null;
  emergency_threshold?: number | null;
  is_enabled: boolean;
  cooldown_minutes: number;
  auto_resolve: boolean;
  description?: string;
}

export interface NotificationPreferences {
  email_enabled: boolean;
  in_app_enabled: boolean;
  web_push_enabled: boolean;
  sms_enabled: boolean;
  aws_sns_enabled: boolean;
  notification_email?: string;
  notification_phone?: string;
  aws_sns_topic_arn?: string;
  min_severity_email: string;
  min_severity_in_app: string;
  min_severity_web_push: string;
  min_severity_sms: string;
  min_severity_aws_sns: string;
  storage_warning_percent: number;
  storage_critical_percent: number;
  cpu_critical_percent: number;
  ram_critical_percent: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  retention_days: number;
}

export interface SystemAnnouncementItem {
  id: number;
  version: string;
  title: string;
  description: string;
  category: string;
  impact: "LOW" | "MEDIUM" | "HIGH";
  created_at: string;
}


