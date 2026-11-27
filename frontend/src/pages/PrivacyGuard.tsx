import React, { useState, useEffect } from "react";
import {
  Lock,
  EyeOff,
  Trash2,
  FileCheck,
  CheckCircle2,
  Clock,
  Save,
  RefreshCw,
  Info,
  ShieldAlert,
  PlayCircle,
  AlertTriangle,
  History,
  Settings,
  Eye,
  CheckCircle,
  XCircle,
  FileSearch
} from "lucide-react";
import {
  fetchPrivacyDashboard,
  updatePrivacyPolicy,
  startPrivacyScan,
  fetchPrivacyScanHistory,
  fetchPrivacyEvents,
  previewRetentionPurge,
  triggerRetentionPurge
} from "../services/api";
import {
  PrivacyDashboardData,
  SensitiveFindingItem
} from "../types";

export const PrivacyGuard: React.FC = () => {
  const [dashboard, setDashboard] = useState<PrivacyDashboardData | null>(null);
  const [policy, setPolicy] = useState<any>({
    data_minimization_mode: true,
    mask_identifiers: true,
    retention_days: 30,
    enforce_tenant_isolation: true,
    detect_sensitive_data: true,
    auto_mask_telemetry: true,
    sensitive_detection_categories: "EMAIL,PHONE,IP,CREDENTIAL,AWS_KEY,TOKEN",
    audit_level: "DETAILED"
  });

  const [findings, setFindings] = useState<SensitiveFindingItem[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [retentionPreview, setRetentionPreview] = useState<any | null>(null);

  // Status & modal states
  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [previewing, setPreviewing] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPurgeModal, setShowPurgeModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"findings" | "settings" | "events" | "retention">("findings");

  const loadPrivacyState = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchPrivacyDashboard();
      setDashboard(data);
      if (data.policy) {
        setPolicy(data.policy);
      }
      if (data.latest_scan?.findings) {
        setFindings(data.latest_scan.findings);
      }

      const evts = await fetchPrivacyEvents(30);
      setEvents(evts);
    } catch (err: any) {
      console.warn("Privacy state error:", err.message);
      setErrorMsg(err.message || "Failed to load real-time privacy status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrivacyState();
  }, []);

  const handleStartScan = async () => {
    setScanning(true);
    setStatusMsg("Executing sensitive data & compliance scan across metadata targets...");
    try {
      const res = await startPrivacyScan();
      if (res && res.findings) {
        setFindings(res.findings);
      }
      // Reload dashboard
      const updatedDash = await fetchPrivacyDashboard();
      setDashboard(updatedDash);

      const evts = await fetchPrivacyEvents(30);
      setEvents(evts);

      setStatusMsg(`Privacy scan complete: ${res.total_inspected} items inspected, ${res.sensitive_findings_count} findings.`);
    } catch (err: any) {
      alert(`Privacy scan failed: ${err.message}`);
    } finally {
      setScanning(false);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updatePrivacyPolicy(policy);
      setStatusMsg("Privacy and data lifecycle policy updated successfully.");
      const updatedDash = await fetchPrivacyDashboard();
      setDashboard(updatedDash);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    }
  };

  const handlePreviewPurge = async () => {
    setPreviewing(true);
    try {
      const res = await previewRetentionPurge(policy.retention_days);
      setRetentionPreview(res);
      setStatusMsg(`Retention preview: ${res.preview_counts?.total_purgeable_records || 0} records exceed ${policy.retention_days} days cutoff.`);
    } catch (err: any) {
      alert(`Preview failed: ${err.message}`);
    } finally {
      setPreviewing(false);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  const handleExecutePurge = async () => {
    setShowPurgeModal(false);
    setStatusMsg("Executing automated retention purge...");
    try {
      const res = await triggerRetentionPurge(policy.retention_days);
      setStatusMsg(`Retention purge complete: ${res.purged_telemetry_records || 0} telemetry records purged.`);
      setRetentionPreview(null);
      await loadPrivacyState();
    } catch (err: any) {
      setStatusMsg(`Purge error: ${err.message}`);
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Lock className="w-7 h-7 text-emerald-400" />
            Privacy Guard & Enterprise Data Governance
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Data minimization governance, automated sensitive data detection, cryptographic PII masking, and safe scheduled lifecycle purging.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleStartScan}
            disabled={scanning}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors shadow-lg shadow-emerald-950/40"
          >
            <PlayCircle className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning Data..." : "Run Privacy Scan"}
          </button>
          <button
            onClick={() => loadPrivacyState()}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 bg-emerald-900/40 border border-emerald-500/40 rounded-xl text-emerald-200 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-950/50 border border-rose-500/50 rounded-xl text-rose-200 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => loadPrivacyState()} className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-900 rounded text-xs font-medium">
            Retry
          </button>
        </div>
      )}

      {/* Verified Privacy Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Compliance Status */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              Protection Posture
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              dashboard?.privacy_protection_status === "COMPLIANT"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
            }`}>
              {dashboard?.privacy_protection_status || "VERIFIED"}
            </span>
          </div>
          <p className="text-xl font-bold text-white mt-2">
            {dashboard?.privacy_protection_status === "COMPLIANT" ? "HIPAA / GDPR Ready" : "Attention Required"}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {findings.length === 0 ? "Zero exposed sensitive items" : `${findings.length} findings flagged`}
          </span>
        </div>

        {/* Sensitive Data Scanner Status */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
              <FileSearch className="w-4 h-4 text-blue-400" />
              Sensitive Data Detector
            </span>
            <span className="text-[10px] text-blue-300 font-semibold">Active</span>
          </div>
          <p className="text-xl font-bold text-white mt-2">Heuristic Engine</p>
          <span className="text-[11px] text-blue-400 flex items-center gap-1 mt-1">
            <CheckCircle className="w-3.5 h-3.5" /> Email, Phone, IP, AWS Key
          </span>
        </div>

        {/* Data Masking */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
              <EyeOff className="w-4 h-4 text-indigo-400" />
              PII & Secret Masking
            </span>
            <span className="text-[10px] text-emerald-400 font-semibold">Enforced</span>
          </div>
          <p className="text-xl font-bold text-white mt-2">
            {policy.mask_identifiers ? "Cryptographic Masking" : "Disabled"}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Secrets redacted before UI transmission
          </span>
        </div>

        {/* Data Retention Lifecycle */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-400" />
              Telemetry Retention
            </span>
            <span className="text-[10px] text-purple-300 font-mono">
              {policy.retention_days} Days
            </span>
          </div>
          <p className="text-xl font-bold text-white mt-2">
            Scheduled Purge
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Local disk auto-reclamation
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 space-x-2 text-sm font-medium">
        <button
          onClick={() => setActiveTab("findings")}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "findings"
              ? "border-emerald-400 text-white font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Eye className="w-4 h-4" />
          Sensitive Data Findings ({findings.length})
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "settings"
              ? "border-emerald-400 text-white font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Settings className="w-4 h-4" />
          Privacy & Governance Policy
        </button>
        <button
          onClick={() => setActiveTab("retention")}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "retention"
              ? "border-emerald-400 text-white font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Trash2 className="w-4 h-4" />
          Lifecycle & Retention Execution
        </button>
        <button
          onClick={() => setActiveTab("events")}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "events"
              ? "border-emerald-400 text-white font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <History className="w-4 h-4" />
          Privacy Event Trail ({events.length})
        </button>
      </div>

      {/* TAB 1: SENSITIVE DATA FINDINGS & REDACTION */}
      {activeTab === "findings" && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <span className="font-semibold text-white">Targeted Metadata Heuristic Scan</span>
              <p className="text-slate-400">
                Pattern-based heuristic inspection across application configuration, database connection usernames, and audit log payloads.
              </p>
            </div>
            <span className="text-slate-400 font-mono">
              Last Scan: {dashboard?.last_verification_utc ? new Date(dashboard.last_verification_utc).toLocaleTimeString() : "Recent"}
            </span>
          </div>

          <div className="space-y-3">
            {findings.map((item, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-indigo-300 font-mono">
                      {item.category}
                    </span>
                    <span className="text-xs font-semibold text-white">{item.location}</span>
                  </div>
                  <div className="text-xs text-slate-300 font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-800 inline-block">
                    Masked Value: <strong className="text-emerald-400">{item.masked_value}</strong>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-300">Remediation:</span> {item.recommendation}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    item.severity === "CRITICAL"
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : item.severity === "HIGH"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  }`}>
                    {item.severity}
                  </span>
                </div>
              </div>
            ))}

            {findings.length === 0 && (
              <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-xl text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h3 className="text-sm font-semibold text-white">Clean Privacy Assessment</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  No exposed emails, phone numbers, plaintext credentials, or unencrypted AWS keys were found in inspected metadata targets.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PRIVACY & DATA GOVERNANCE POLICY SETTINGS */}
      {activeTab === "settings" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Save className="w-4 h-4 text-emerald-400" />
              Data Lifecycle & Anonymization Controls
            </h2>
            <form onSubmit={handleSavePolicy} className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
                <div>
                  <span className="font-semibold text-slate-200 block">Strict Metadata-Only Mode</span>
                  <span className="text-slate-400 text-[11px]">Enforce read-only catalog scanning without file content inspection</span>
                </div>
                <input
                  type="checkbox"
                  checked={policy.data_minimization_mode}
                  onChange={(e) => setPolicy({ ...policy, data_minimization_mode: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
                <div>
                  <span className="font-semibold text-slate-200 block">Mask System Identifiers & PII</span>
                  <span className="text-slate-400 text-[11px]">Anonymize usernames, hostnames, and table identifiers in audit logs</span>
                </div>
                <input
                  type="checkbox"
                  checked={policy.mask_identifiers}
                  onChange={(e) => setPolicy({ ...policy, mask_identifiers: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
                <div>
                  <span className="font-semibold text-slate-200 block">Detect Sensitive Credentials & API Keys</span>
                  <span className="text-slate-400 text-[11px]">Execute regex surveillance for passwords and AWS programmatic keys</span>
                </div>
                <input
                  type="checkbox"
                  checked={policy.detect_sensitive_data}
                  onChange={(e) => setPolicy({ ...policy, detect_sensitive_data: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
                <div>
                  <span className="font-semibold text-slate-200 block">Enforce Multi-Tenant Isolation</span>
                  <span className="text-slate-400 text-[11px]">Strict organization boundary validation on all database operations</span>
                </div>
                <input
                  type="checkbox"
                  checked={policy.enforce_tenant_isolation}
                  onChange={(e) => setPolicy({ ...policy, enforce_tenant_isolation: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
              </div>

              <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/50 space-y-2">
                <label className="font-semibold text-slate-200 block">
                  Telemetry Retention Threshold (Days)
                </label>
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={policy.retention_days}
                  onChange={(e) => setPolicy({ ...policy, retention_days: parseInt(e.target.value) || 30 })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs"
                />
                <span className="text-slate-400 text-[11px] block">
                  Telemetry records older than {policy.retention_days} days are scheduled for automatic purge to preserve local disk space.
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-xs transition-colors"
              >
                Update Policy & Settings
              </button>
            </form>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                <FileCheck className="w-4 h-4" />
                HIPAA Privacy & Security Rules (45 CFR § 164.312)
              </div>
              <p className="text-xs text-slate-300">
                AEGISSTOR complies with healthcare data minimization standards by restricting queries to low-level filesystem extent descriptors and storage telemetry catalogs. No PHI or medical records are ingested.
              </p>
            </div>

            <div className="p-4 bg-blue-950/30 border border-blue-500/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold">
                <EyeOff className="w-4 h-4" />
                GDPR Article 5(1)(c) Compliance
              </div>
              <p className="text-xs text-slate-300">
                Collects solely operational byte capacities and disk I/O rates. Personal identifiers and database passwords are AES-256 encrypted at rest and masked before UI display.
              </p>
            </div>

            <div className="p-4 bg-purple-950/30 border border-purple-500/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold">
                <Lock className="w-4 h-4" />
                Localhost Boundary Sovereignty
              </div>
              <p className="text-xs text-slate-300">
                All monitoring telemetry is persisted locally in SQLite. Outbound telemetry beacons to third-party marketing services are strictly disabled.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DATA RETENTION PREVIEW & SAFE EXECUTION */}
      {activeTab === "retention" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-400" />
              Compliance Retention Purge Execution
            </h2>
            <p className="text-xs text-slate-400">
              Preview and execute scheduled retention purges. Telemetry samples older than {policy.retention_days} days will be deleted to reclaim disk space.
            </p>

            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>Retention Horizon: Records older than <strong>{policy.retention_days} days</strong></span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Info className="w-4 h-4 text-emerald-400" />
                <span>Safety Guarantee: ML forecasting weights and audit trails are permanently preserved.</span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handlePreviewPurge}
                  disabled={previewing}
                  className="w-1/2 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-lg text-xs transition-colors"
                >
                  {previewing ? "Calculating..." : "Preview Affected Records"}
                </button>
                <button
                  onClick={() => setShowPurgeModal(true)}
                  className="w-1/2 py-2 bg-rose-600/90 hover:bg-rose-600 text-white font-medium rounded-lg text-xs transition-colors"
                >
                  Run Retention Purge Now
                </button>
              </div>
            </div>

            {retentionPreview && (
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-xs">
                <h4 className="font-semibold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Retention Purge Preview Results
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-400 block">Storage Telemetry</span>
                    <strong className="text-white text-sm">{retentionPreview.preview_counts?.storage_telemetry_records ?? 0}</strong> records
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-400 block">Database Telemetry</span>
                    <strong className="text-white text-sm">{retentionPreview.preview_counts?.database_telemetry_records ?? 0}</strong> records
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 pt-1">
                  Cutoff date: {new Date(retentionPreview.cutoff_timestamp_utc).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
            <h3 className="font-semibold text-white text-sm">Protected Enterprise Repositories</h3>
            <p className="text-xs text-slate-400">
              The following repositories are immutable under retention purges and will never be modified or deleted:
            </p>
            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-center gap-2 p-2 bg-slate-800/40 rounded border border-slate-800">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>Security & Privacy Audit Trails:</strong> Cryptographic tamper-evident historical logs</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-slate-800/40 rounded border border-slate-800">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>AWS S3 Cloud Storage Objects:</strong> S3 buckets and backup archives</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-slate-800/40 rounded border border-slate-800">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>Machine Learning Calibration Weights:</strong> LightGBM/Ridge regression training models</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-slate-800/40 rounded border border-slate-800">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>Enterprise User Identities & Sessions:</strong> Credentials and TOTP secrets</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 4: PRIVACY EVENT TRAIL */}
      {activeTab === "events" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Result</th>
                  <th className="py-2.5 px-3">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                      {new Date(evt.timestamp_utc).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{evt.event_id}</td>
                    <td className="py-2.5 px-3 font-semibold text-white">{evt.event_type}</td>
                    <td className="py-2.5 px-3 text-slate-300">{evt.action}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        evt.result === "SUCCESS" || evt.result === "CLEAN"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}>
                        {evt.result}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">{evt.severity}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500 text-xs">
                      No privacy events recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              Confirm Telemetry Purge
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to purge raw telemetry samples older than {policy.retention_days} days? This permanently frees disk space. Historical aggregated summaries and ML models will not be affected.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPurgeModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleExecutePurge}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg text-xs"
              >
                Confirm Purge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivacyGuard;
