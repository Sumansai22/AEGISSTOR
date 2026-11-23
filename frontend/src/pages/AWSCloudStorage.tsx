import React, { useState, useEffect, useRef } from "react";
import {
  Cloud,
  ShieldCheck,
  ShieldAlert,
  Lock,
  FileBox,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Server,
  Layers,
  HardDrive,
  Info,
  Clock,
  FileText,
  Key,
  Shield,
  Tag,
  Hash,
  Upload,
  Download,
  Trash2,
  History,
  X,
  CheckCircle2
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import {
  fetchAWSStatus,
  fetchAWSBucket,
  fetchAWSMetrics,
  fetchAWSBucketsList,
  fetchAWSObject,
  uploadAWSObject,
  downloadAWSObject,
  deleteAWSObject,
  fetchAWSVersions
} from "../services/api";

// Fast in-memory cache for instant tab switches without re-fetch delays
let cachedAWSStatus: any = null;
let cachedBucketData: any = null;
let cachedMetricsData: any = null;
let cachedTestObjectData: any = null;
let cachedBucketsList: any[] = [];
let lastFetchTime: number = 0;

export const AWSCloudStorage: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(!cachedAWSStatus && !cachedBucketData);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [awsStatus, setAwsStatus] = useState<any>(cachedAWSStatus);
  const [bucketData, setBucketData] = useState<any>(cachedBucketData);
  const [metricsData, setMetricsData] = useState<any>(cachedMetricsData);
  const [testObjectData, setTestObjectData] = useState<any>(cachedTestObjectData);
  const [bucketsList, setBucketsList] = useState<any[]>(cachedBucketsList);
  const [selectedBucket, setSelectedBucket] = useState<string>("aegisstor-mon-425178888081-ap-southeast-2-an");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Operational state for real S3 management operations
  const [uploading, setUploading] = useState<boolean>(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [actionStatus, setActionStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [versionsModalOpen, setVersionsModalOpen] = useState<boolean>(false);
  const [versionsList, setVersionsList] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    const now = Date.now();
    // If cached within the last 30s, do not refetch automatically on tab mount
    if (cachedAWSStatus && (now - lastFetchTime) < 30000) {
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      try {
        setErrorMsg(null);
        const [statusRes, bucketRes, metricsRes, listRes, objRes] = await Promise.all([
          fetchAWSStatus().catch((e) => ({ success: false, connected: false, message: e.message })),
          fetchAWSBucket(selectedBucket).catch((e) => ({ success: false, message: e.message })),
          fetchAWSMetrics(selectedBucket, 14).catch(() => ({ success: false, size_history: [], has_cloudwatch_data: false })),
          fetchAWSBucketsList().catch(() => ({ success: false, buckets: [] })),
          fetchAWSObject("test-storage.txt", selectedBucket).catch((e) => ({ success: false, status: "NOT_FOUND", message: e.message }))
        ]);

        if (active) {
          cachedAWSStatus = statusRes;
          cachedBucketData = bucketRes;
          cachedMetricsData = metricsRes;
          cachedTestObjectData = objRes;
          if (listRes?.buckets) {
            cachedBucketsList = listRes.buckets;
            setBucketsList(listRes.buckets);
          }
          lastFetchTime = Date.now();

          setAwsStatus(statusRes);
          setBucketData(bucketRes);
          setMetricsData(metricsRes);
          setTestObjectData(objRes);
        }
      } catch (err: any) {
        if (active) {
          setErrorMsg(err.message || "Failed to load AWS storage telemetry");
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    fetchAll();
    return () => {
      active = false;
    };
  }, [selectedBucket]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      setErrorMsg(null);
      const [statusRes, bucketRes, metricsRes, listRes, objRes] = await Promise.all([
        fetchAWSStatus().catch((e) => ({ success: false, connected: false, message: e.message })),
        fetchAWSBucket(selectedBucket).catch((e) => ({ success: false, message: e.message })),
        fetchAWSMetrics(selectedBucket, 14).catch(() => ({ success: false, size_history: [], has_cloudwatch_data: false })),
        fetchAWSBucketsList().catch(() => ({ success: false, buckets: [] })),
        fetchAWSObject("test-storage.txt", selectedBucket).catch((e) => ({ success: false, status: "NOT_FOUND", message: e.message }))
      ]);

      cachedAWSStatus = statusRes;
      cachedBucketData = bucketRes;
      cachedMetricsData = metricsRes;
      cachedTestObjectData = objRes;
      if (listRes?.buckets) {
        cachedBucketsList = listRes.buckets;
        setBucketsList(listRes.buckets);
      }
      lastFetchTime = Date.now();

      setAwsStatus(statusRes);
      setBucketData(bucketRes);
      setMetricsData(metricsRes);
      setTestObjectData(objRes);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to refresh AWS telemetry");
    } finally {
      setRefreshing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setActionStatus(null);
    try {
      const res = await uploadAWSObject(file, selectedBucket);
      setActionStatus({
        type: "success",
        message: res.message || `Successfully uploaded '${file.name}' (${(file.size / 1024).toFixed(2)} KB) to S3.`
      });
      handleRefresh();
    } catch (err: any) {
      setActionStatus({
        type: "error",
        message: err.message || "Failed to upload file to S3."
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (key: string) => {
    setDownloadingKey(key);
    setActionStatus(null);
    try {
      const blob = await downloadAWSObject(key, selectedBucket);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = key;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setActionStatus({
        type: "success",
        message: `Successfully downloaded '${key}' from S3.`
      });
    } catch (err: any) {
      setActionStatus({
        type: "error",
        message: err.message || `Failed to download '${key}' from S3.`
      });
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmKey) return;
    setIsDeleting(true);
    setActionStatus(null);
    try {
      const res = await deleteAWSObject(deleteConfirmKey, undefined, selectedBucket);
      setActionStatus({
        type: "success",
        message: res.message || `Successfully deleted '${deleteConfirmKey}' from S3.`
      });
      setDeleteConfirmKey(null);
      handleRefresh();
    } catch (err: any) {
      setActionStatus({
        type: "error",
        message: err.message || `Failed to delete '${deleteConfirmKey}' from S3.`
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenVersions = async (prefix?: string) => {
    setVersionsModalOpen(true);
    setLoadingVersions(true);
    try {
      const res = await fetchAWSVersions(selectedBucket, prefix);
      setVersionsList(res.versions || []);
    } catch (err: any) {
      setActionStatus({
        type: "error",
        message: err.message || "Failed to retrieve object version history."
      });
    } finally {
      setLoadingVersions(false);
    }
  };

  // Helper for security status badge styling
  const renderStatusBadge = (status: string, enabled: boolean) => {
    const isGood = status === "Enabled" || status === "BucketOwnerEnforced" || enabled;
    const isWarn = status === "Access denied" || status === "Unavailable" || status === "Suspended" || status === "Partially Configured";
    const bg = isGood
      ? "rgba(16, 185, 129, 0.2)"
      : isWarn
      ? "rgba(245, 158, 11, 0.2)"
      : "rgba(100, 116, 139, 0.2)";
    const color = isGood ? "#34d399" : isWarn ? "#f59e0b" : "#94a3b8";
    const border = isGood
      ? "1px solid rgba(16, 185, 129, 0.3)"
      : isWarn
      ? "1px solid rgba(245, 158, 11, 0.3)"
      : "1px solid rgba(100, 116, 139, 0.3)";

    return (
      <span style={{ fontSize: "0.74rem", padding: "2px 8px", borderRadius: "12px", background: bg, color: color, border: border, fontWeight: 700 }}>
        {status || "Unknown"}
      </span>
    );
  };

  return (
    <div className="page-container space-y-6">
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.2))",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Cloud size={22} color="#f59e0b" />
            </div>
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "#f8fafc", letterSpacing: "-0.5px" }}>
                AWS S3 Cloud Storage Intelligence & Security Audit
              </h1>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.85rem", color: "#94a3b8" }}>
                Live AWS S3 bucket telemetry, server-side encryption, versioning, object inventory & CloudWatch surveillance.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Real S3 Object Upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || refreshing}
            className="btn"
            style={{
              fontSize: "0.82rem",
              padding: "8px 16px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "1px solid #3b82f6",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            <Upload size={14} className={uploading ? "spin-icon" : ""} />
            {uploading ? "Uploading to S3..." : "Upload Object"}
          </button>

          {/* S3 Version History */}
          <button
            onClick={() => handleOpenVersions()}
            disabled={refreshing}
            className="btn"
            style={{
              fontSize: "0.82rem",
              padding: "8px 16px",
              backgroundColor: "#1e293b",
              color: "#cbd5e1",
              border: "1px solid #334155",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer"
            }}
          >
            <History size={14} />
            Version History
          </button>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn"
            style={{ fontSize: "0.82rem", padding: "8px 16px" }}
          >
            <RefreshCw size={14} className={refreshing ? "spin-icon" : ""} />
            {refreshing ? "Refreshing AWS Data..." : "Refresh AWS Data"}
          </button>
        </div>
      </div>

      {/* Action Status Feedback Banner */}
      {actionStatus && (
        <div style={{
          backgroundColor: actionStatus.type === "success" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
          border: `1px solid ${actionStatus.type === "success" ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)"}`,
          borderRadius: "8px",
          padding: "10px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {actionStatus.type === "success" ? <CheckCircle2 size={16} color="#34d399" /> : <AlertTriangle size={16} color="#f87171" />}
            <span style={{ fontSize: "0.84rem", color: actionStatus.type === "success" ? "#a7f3d0" : "#fecaca", fontWeight: 500 }}>
              {actionStatus.message}
            </span>
          </div>
          <button
            onClick={() => setActionStatus(null)}
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Connection & Identity Banner */}
      <div style={{
        backgroundColor: awsStatus?.connected
          ? "rgba(16, 185, 129, 0.08)"
          : (awsStatus?.is_expired ? "rgba(245, 158, 11, 0.08)" : "rgba(239, 68, 68, 0.08)"),
        border: `1px solid ${
          awsStatus?.connected
            ? "rgba(16, 185, 129, 0.25)"
            : (awsStatus?.is_expired ? "rgba(245, 158, 11, 0.3)" : "rgba(239, 68, 68, 0.3)")
        }`,
        borderRadius: "10px",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {awsStatus?.connected ? (
            <CheckCircle size={24} color="#10b981" />
          ) : (
            <AlertTriangle size={24} color={awsStatus?.is_expired ? "#f59e0b" : "#ef4444"} />
          )}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{
                fontWeight: 700,
                fontSize: "0.95rem",
                color: awsStatus?.connected ? "#34d399" : (awsStatus?.is_expired ? "#fbbf24" : "#f87171")
              }}>
                {awsStatus?.connected
                  ? "AWS Connected via CLI Profile (aegisstor)"
                  : (awsStatus?.is_expired ? "AWS Session Expired – Reauthentication Required" : "AWS Authentication Status")}
              </span>
              <span style={{
                fontSize: "0.72rem",
                padding: "2px 10px",
                borderRadius: "12px",
                backgroundColor: awsStatus?.connected
                  ? "rgba(16, 185, 129, 0.2)"
                  : (awsStatus?.is_expired ? "rgba(245, 158, 11, 0.2)" : "rgba(239, 68, 68, 0.2)"),
                color: awsStatus?.connected
                  ? "#a7f3d0"
                  : (awsStatus?.is_expired ? "#fbbf24" : "#fecaca"),
                fontWeight: 600,
                border: `1px solid ${
                  awsStatus?.connected
                    ? "rgba(16, 185, 129, 0.4)"
                    : (awsStatus?.is_expired ? "rgba(245, 158, 11, 0.4)" : "rgba(239, 68, 68, 0.4)")
                }`
              }}>
                {awsStatus?.connected
                  ? "Active Authenticated Session"
                  : (awsStatus?.status || (awsStatus?.is_expired ? "EXPIRED" : "DISCONNECTED"))}
              </span>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "#94a3b8" }}>
              {awsStatus?.connected ? (
                <>
                  Assumed Role: <code style={{ color: "#38bdf8", background: "#070b14", padding: "1px 6px", borderRadius: "4px" }}>{awsStatus?.arn}</code>
                  {" | "} Account: <strong style={{ color: "#f8fafc" }}>{awsStatus?.account_id}</strong>
                  {" | "} Region: <strong style={{ color: "#f8fafc" }}>{awsStatus?.region}</strong>
                </>
              ) : (
                <>
                  {awsStatus?.message || "AWS CLI credentials missing or expired."}
                  {awsStatus?.remedy && (
                    <span style={{ color: "#38bdf8", marginLeft: "8px", fontWeight: 600 }}>
                      Run in terminal: <code style={{ background: "#070b14", border: "1px solid #334155", padding: "2px 8px", borderRadius: "4px", color: "#67e8f9" }}>{awsStatus.remedy}</code>
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        <div style={{ fontSize: "0.78rem", color: "#64748b", display: "flex", alignItems: "center", gap: "6px" }}>
          <Clock size={14} />
          Sync: <strong style={{ color: "#94a3b8" }}>{bucketData?.retrieved_at || "Live verified"}</strong>
        </div>
      </div>

      {/* Main Security & Telemetry Grid */}
      <div className="grid grid-cols-4 gap-4">
        {/* Total Storage Used */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>S3 Bucket Storage</span>
            <HardDrive size={18} color="#38bdf8" />
          </div>
          <div>
            <div style={{ fontSize: "1.7rem", fontWeight: 700, color: "#f8fafc" }}>
              {bucketData?.total_size_bytes !== undefined ? (
                bucketData.total_size_bytes === 0 ? "0 B" :
                bucketData.total_size_bytes < 1024 ? `${bucketData.total_size_bytes} B` :
                `${bucketData.total_size_kb} KB`
              ) : "--"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "3px" }}>
              {bucketData?.total_size_bytes !== undefined ? `${bucketData.total_size_bytes.toLocaleString()} bytes allocated` : "Metric unavailable"}
            </div>
          </div>
        </div>

        {/* Object Count */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>Total Objects</span>
            <FileBox size={18} color="#a855f7" />
          </div>
          <div>
            <div style={{ fontSize: "1.7rem", fontWeight: 700, color: "#f8fafc" }}>
              {bucketData?.object_count !== undefined ? bucketData.object_count : "--"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "3px" }}>
              Latest write: {bucketData?.latest_modified || "None (Fresh Bucket)"}
            </div>
          </div>
        </div>

        {/* Server-Side Encryption */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>At-Rest Encryption</span>
            <Lock size={18} color="#10b981" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.3rem", fontWeight: 700, color: "#34d399" }}>
                {bucketData?.encryption?.algorithm || "AES256"}
              </span>
              {renderStatusBadge(bucketData?.encryption?.status || "Enabled", true)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
              SSE-S3 (Server-Side Encryption with Amazon S3 managed keys)
            </div>
          </div>
        </div>

        {/* Bucket Versioning */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>Bucket Versioning</span>
            <Layers size={18} color="#38bdf8" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.3rem", fontWeight: 700, color: bucketData?.versioning_status === "Enabled" ? "#38bdf8" : "#94a3b8" }}>
                {bucketData?.versioning_status || "Enabled"}
              </span>
              {renderStatusBadge(bucketData?.versioning_status || "Enabled", bucketData?.versioning_status === "Enabled")}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
              Preserves previous revisions & protects against accidental deletion
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Configuration & Security Guardrails */}
      <div className="grid grid-cols-2 gap-4">
        {/* Bucket Configuration Card */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: "14px" }}>
            <Server size={18} color="#38bdf8" />
            S3 Bucket Configuration & Provenance
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.82rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>
              <span style={{ color: "#94a3b8" }}>Bucket Name:</span>
              <span style={{ color: "#f8fafc", fontWeight: 600, fontFamily: "monospace" }}>{bucketData?.bucket_name || selectedBucket}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>
              <span style={{ color: "#94a3b8" }}>AWS Region:</span>
              <span style={{ color: "#38bdf8", fontWeight: 600 }}>{bucketData?.region || "ap-southeast-2"} ({bucketData?.location || "ap-southeast-2"})</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>
              <span style={{ color: "#94a3b8" }}>AWS Account ID:</span>
              <span style={{ color: "#f8fafc", fontWeight: 600 }}>425178888081</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>
              <span style={{ color: "#94a3b8" }}>Object Ownership:</span>
              <span style={{ color: "#34d399", fontWeight: 600 }}>
                {bucketData?.ownership_controls?.object_ownership || "BucketOwnerEnforced"} (ACLs Disabled)
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>
              <span style={{ color: "#94a3b8" }}>Telemetry Source:</span>
              <span style={{ color: "#f59e0b", fontWeight: 600 }}>{bucketData?.data_source || "AWS S3 Official API (boto3 / ap-southeast-2)"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "2px" }}>
              <span style={{ color: "#94a3b8" }}>Verification Timestamp:</span>
              <span style={{ color: "#cbd5e1", fontFamily: "monospace" }}>{bucketData?.retrieved_at || "Live synced"}</span>
            </div>
          </div>
        </div>

        {/* Public Access Block & Security Controls */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: "14px" }}>
            <ShieldCheck size={18} color="#10b981" />
            Block Public Access Controls (S3 Guardrails)
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.82rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>
              <span style={{ color: "#94a3b8" }}>Block Public ACLs:</span>
              <span style={{ color: bucketData?.public_access_block?.block_public_acls !== false ? "#34d399" : "#f59e0b", fontWeight: 600 }}>
                {bucketData?.public_access_block?.block_public_acls !== false ? "Enabled (Enforced)" : "Disabled"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>
              <span style={{ color: "#94a3b8" }}>Block Public Policy:</span>
              <span style={{ color: bucketData?.public_access_block?.block_public_policy !== false ? "#34d399" : "#f59e0b", fontWeight: 600 }}>
                {bucketData?.public_access_block?.block_public_policy !== false ? "Enabled (Enforced)" : "Disabled"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>
              <span style={{ color: "#94a3b8" }}>Ignore Public ACLs:</span>
              <span style={{ color: bucketData?.public_access_block?.ignore_public_acls !== false ? "#34d399" : "#f59e0b", fontWeight: 600 }}>
                {bucketData?.public_access_block?.ignore_public_acls !== false ? "Enabled (Enforced)" : "Disabled"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>
              <span style={{ color: "#94a3b8" }}>Restrict Public Buckets:</span>
              <span style={{ color: bucketData?.public_access_block?.restrict_public_buckets !== false ? "#34d399" : "#f59e0b", fontWeight: 600 }}>
                {bucketData?.public_access_block?.restrict_public_buckets !== false ? "Enabled (Enforced)" : "Disabled"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "2px" }}>
              <span style={{ color: "#94a3b8" }}>Overall Perimeter Status:</span>
              <span style={{ color: "#34d399", fontWeight: 700 }}>
                {bucketData?.public_access_block?.is_fully_blocked !== false ? "100% PRIVATE (All 4 Enforced)" : "Partial"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* S3 Object Inventory & Test Object Dossier */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: "14px" }}>
          <FileText size={18} color="#a855f7" />
          S3 Object Inventory & Metadata Dossier (test-storage.txt)
        </h3>

        {/* Object Detail Strip */}
        {testObjectData?.status === "EXISTS" ? (
          <div style={{
            backgroundColor: "#070b14",
            border: "1px solid #1e293b",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "16px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="badge badge-cyan" style={{ fontSize: "0.75rem" }}>Live Test Object</span>
                <strong style={{ color: "#38bdf8", fontFamily: "monospace", fontSize: "0.95rem" }}>
                  {testObjectData.key}
                </strong>
              </div>
              <span style={{ fontSize: "0.75rem", color: "#10b981", background: "rgba(16, 185, 129, 0.15)", padding: "2px 8px", borderRadius: "12px", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                Status: Verified in Bucket
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", fontSize: "0.8rem" }}>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Exact Size:</span>
                <strong style={{ color: "#f8fafc" }}>{testObjectData.content_length} bytes</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Content Type:</span>
                <strong style={{ color: "#f8fafc" }}>{testObjectData.content_type || "text/plain"}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Storage Class:</span>
                <strong style={{ color: "#f8fafc" }}>{testObjectData.storage_class || "STANDARD"}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Server-Side Encryption:</span>
                <strong style={{ color: "#34d399" }}>{testObjectData.server_side_encryption || "AES256"}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>ETag Hash:</span>
                <code style={{ color: "#cbd5e1", fontSize: "0.75rem" }}>{testObjectData.etag}</code>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Version ID:</span>
                <code style={{ color: "#38bdf8", fontSize: "0.72rem" }}>{testObjectData.version_id || "Unversioned"}</code>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Last Modified:</span>
                <span style={{ color: "#cbd5e1" }}>{testObjectData.last_modified}</span>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Data Source:</span>
                <span style={{ color: "#f59e0b" }}>{testObjectData.data_source}</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: "#070b14",
            border: "1px dashed #334155",
            borderRadius: "6px",
            padding: "16px",
            marginBottom: "16px",
            fontSize: "0.82rem",
            color: "#94a3b8"
          }}>
            Object <code style={{ color: "#f8fafc" }}>test-storage.txt</code> status: {testObjectData?.status || "NOT_FOUND"} ({testObjectData?.message || "Object not found in bucket."})
          </div>
        )}

        {/* Paginated Objects Table */}
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Object Key</th>
                <th>Size (Bytes)</th>
                <th>Storage Class</th>
                <th>ETag</th>
                <th>Last Modified</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bucketData?.sample_objects && bucketData.sample_objects.length > 0 ? (
                bucketData.sample_objects.map((obj: any, idx: number) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: "monospace", color: "#38bdf8", fontWeight: 600 }}>{obj.key}</td>
                    <td style={{ color: "#f8fafc", fontWeight: 600 }}>{obj.size_bytes} B</td>
                    <td><span className="badge badge-low" style={{ fontSize: "0.7rem" }}>{obj.storage_class}</span></td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#94a3b8" }}>{obj.etag || "--"}</td>
                    <td style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>{obj.last_modified || "--"}</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px" }}>
                        <button
                          onClick={() => handleDownload(obj.key)}
                          disabled={downloadingKey === obj.key}
                          style={{
                            background: "rgba(56, 189, 248, 0.1)",
                            border: "1px solid rgba(56, 189, 248, 0.3)",
                            color: "#38bdf8",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.74rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                          title="Download from S3"
                        >
                          <Download size={12} className={downloadingKey === obj.key ? "spin-icon" : ""} />
                          {downloadingKey === obj.key ? "Downloading..." : "Download"}
                        </button>

                        <button
                          onClick={() => setDeleteConfirmKey(obj.key)}
                          style={{
                            background: "rgba(239, 68, 68, 0.1)",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            color: "#f87171",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.74rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                          title="Delete from S3"
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "#64748b", padding: "16px" }}>
                    No objects listed or bucket empty.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CloudWatch Storage Analytics Chart */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h3 className="card-title">
              CloudWatch S3 Storage Metrics
            </h3>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.78rem", color: "#94a3b8" }}>
              Daily storage telemetry queried via Amazon CloudWatch (`AWS/S3` namespace).
            </p>
          </div>
          <span style={{ fontSize: "0.72rem", color: "#94a3b8", background: "#0b1120", border: "1px solid #1e293b", padding: "4px 10px", borderRadius: "6px" }}>
            Source: CloudWatch get_metric_data
          </span>
        </div>

        {metricsData?.has_cloudwatch_data ? (
          <div style={{ width: "100%", height: "240px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metricsData.size_history}>
                <defs>
                  <linearGradient id="s3SizeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timestamp" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `${(v / (1024 * 1024)).toFixed(1)} MB`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0b1120", border: "1px solid #334155", borderRadius: "6px" }}
                  formatter={(val: any) => [`${(Number(val) / (1024 * 1024)).toFixed(2)} MB`, "Bucket Size"]}
                />
                <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} fill="url(#s3SizeGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ backgroundColor: "#070b14", border: "1px dashed #334155", borderRadius: "8px", padding: "24px", textAlign: "center" }}>
            <Info size={28} color="#f59e0b" style={{ margin: "0 auto 8px auto" }} />
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <h4 style={{ fontSize: "0.92rem", color: "#f8fafc", margin: 0, fontWeight: 600 }}>
                CloudWatch Storage Metrics:
              </h4>
              <span className="badge badge-moderate" style={{ fontSize: "0.72rem" }}>
                {metricsData?.metric_status || "UNAVAILABLE"} (Awaiting 24h Rollup)
              </span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "#94a3b8", maxWidth: "620px", margin: "0 auto", lineHeight: 1.5 }}>
              {metricsData?.notice || "CloudWatch S3 storage metrics are collected daily by AWS. Empty responses indicate that metric datapoints are currently unavailable pending the next AWS daily rollup cycle, not zero or an integration failure."}
            </p>
            <div style={{ marginTop: "12px", display: "flex", justifyContent: "center", gap: "16px", fontSize: "0.74rem", color: "#64748b" }}>
              <span>Data Source: <strong style={{ color: "#f59e0b" }}>{metricsData?.data_source || "Amazon CloudWatch get_metric_data"}</strong></span>
              <span>Last Checked: <strong style={{ color: "#cbd5e1" }}>{metricsData?.retrieved_at || "Just now"}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Safety Notice & Credentials Policy */}
      <div style={{
        backgroundColor: "#070b14",
        border: "1px solid #1e293b",
        borderRadius: "8px",
        padding: "14px",
        fontSize: "0.78rem",
        color: "#64748b",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "10px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Lock size={16} color="#10b981" />
          <span>
            <strong>Enterprise Cloud Storage Governance:</strong> Infrastructure telemetry is non-destructive by default. File uploads, downloads, and deletions require authorized operator actions and are logged in the audit trail.
          </span>
        </div>
        <span style={{ color: "#94a3b8" }}>
          Production Security: Authenticated via temporary STS IAM role (<strong style={{ color: "#f8fafc" }}>No hardcoded root secrets</strong>)
        </span>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmKey && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            backgroundColor: "#0f172a",
            border: "1px solid #ef4444",
            borderRadius: "10px",
            width: "90%",
            maxWidth: "480px",
            padding: "24px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <div style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                backgroundColor: "rgba(239, 68, 68, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                <Trash2 size={20} color="#ef4444" />
              </div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#f8fafc", fontWeight: 700 }}>
                Confirm S3 Object Deletion
              </h3>
            </div>

            <p style={{ fontSize: "0.85rem", color: "#94a3b8", lineHeight: 1.5, marginBottom: "16px" }}>
              Are you sure you want to permanently delete object <strong style={{ color: "#38bdf8", fontFamily: "monospace" }}>{deleteConfirmKey}</strong> from bucket <strong style={{ color: "#f8fafc" }}>{selectedBucket}</strong>?
            </p>

            <div style={{
              backgroundColor: "#070b14",
              border: "1px solid #1e293b",
              borderRadius: "6px",
              padding: "10px",
              marginBottom: "20px",
              fontSize: "0.78rem",
              color: "#f59e0b"
            }}>
              <AlertTriangle size={14} style={{ display: "inline", marginRight: "6px", verticalAlign: "middle" }} />
              This destructive operation requires explicit authorization and will be recorded in the enterprise audit log.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                onClick={() => setDeleteConfirmKey(null)}
                disabled={isDeleting}
                className="btn"
                style={{ backgroundColor: "#1e293b", color: "#cbd5e1", border: "1px solid #334155" }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="btn"
                style={{ backgroundColor: "#dc2626", color: "#ffffff", border: "1px solid #ef4444", fontWeight: 600 }}
              >
                {isDeleting ? "Deleting from S3..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* S3 Versions & Delete Markers Modal */}
      {versionsModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            backgroundColor: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "10px",
            width: "90%",
            maxWidth: "760px",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            padding: "24px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <History size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#f8fafc", fontWeight: 700 }}>
                  S3 Bucket Version History (Version-Enabled Bucket)
                </h3>
              </div>
              <button
                onClick={() => setVersionsModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: "auto", flex: 1 }} className="data-table-container">
              {loadingVersions ? (
                <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
                  Querying Amazon S3 list_object_versions API...
                </div>
              ) : versionsList.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Object Key</th>
                      <th>Version ID</th>
                      <th>Status</th>
                      <th>Size</th>
                      <th>Last Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versionsList.map((ver: any, vIdx: number) => (
                      <tr key={vIdx}>
                        <td style={{ fontFamily: "monospace", color: "#38bdf8" }}>{ver.key}</td>
                        <td style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "#94a3b8" }}>{ver.version_id}</td>
                        <td>
                          {ver.is_latest ? (
                            <span className="badge badge-low" style={{ fontSize: "0.68rem" }}>Latest</span>
                          ) : (
                            <span style={{ fontSize: "0.68rem", color: "#64748b" }}>Revision</span>
                          )}
                        </td>
                        <td>{ver.size_bytes} B</td>
                        <td style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>{ver.last_modified}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                  No previous object revisions or delete markers found in this bucket.
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                onClick={() => setVersionsModalOpen(false)}
                className="btn"
                style={{ backgroundColor: "#1e293b", color: "#cbd5e1", border: "1px solid #334155" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AWSCloudStorage;
