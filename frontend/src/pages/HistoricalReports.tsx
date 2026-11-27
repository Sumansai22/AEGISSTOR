import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Download,
  Calendar,
  HardDrive,
  Activity,
  Cpu,
  Layers,
  AlertCircle,
  RefreshCw,
  Clock,
  Filter,
  CheckCircle2,
  Database
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from "recharts";

import {
  DriveInfo,
  HistoricalReportResponse,
  HistoricalStoragePoint,
  HistoricalPerformancePoint,
  HistoricalDiskIOPoint
} from "../types";
import { fetchHistoricalReport, getHistoricalCsvExportUrl } from "../services/api";

interface HistoricalReportsProps {
  historyData?: any[];
  onTimeRangeChange?: (hours: number) => void;
  drives?: DriveInfo[];
}

export const HistoricalReports: React.FC<HistoricalReportsProps> = ({
  drives = []
}) => {
  const [selectedRange, setSelectedRange] = useState<string>("24h");
  const [selectedDrive, setSelectedDrive] = useState<string>("ALL");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [appliedCustomDates, setAppliedCustomDates] = useState<{ start: string; end: string } | null>(null);

  const [report, setReport] = useState<HistoricalReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const activeAbortRef = useRef<AbortController | null>(null);

  // UTC to Local formatted string for recharts and tables
  const formatTimestamp = useCallback((utcString: string, range: string): string => {
    try {
      const date = new Date(utcString);
      if (isNaN(date.getTime())) return utcString;

      if (range === "24h" || range === "1h") {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else if (range === "7d" || range === "custom") {
        return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      } else {
        return date.toLocaleDateString([], { month: "short", day: "numeric" });
      }
    } catch {
      return utcString;
    }
  }, []);

  const formatFullTimestamp = useCallback((utcString: string): string => {
    try {
      const date = new Date(utcString);
      if (isNaN(date.getTime())) return utcString;
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    } catch {
      return utcString;
    }
  }, []);

  // Fetch report data
  const loadHistoricalData = useCallback(async () => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortRef.current = controller;

    setIsLoading(true);
    setIsError(false);
    setErrorMessage("");

    try {
      const params: {
        range?: string;
        deviceId?: string;
        startDate?: string;
        endDate?: string;
        signal?: AbortSignal;
      } = {
        signal: controller.signal
      };

      if (selectedRange === "custom" && appliedCustomDates) {
        params.startDate = appliedCustomDates.start;
        params.endDate = appliedCustomDates.end;
      } else {
        params.range = selectedRange;
      }

      if (selectedDrive !== "ALL") {
        params.deviceId = selectedDrive;
      }

      const res = await fetchHistoricalReport(params);
      if (res.success) {
        setReport(res);
      } else {
        setIsError(true);
        setErrorMessage(res.message || "Failed to load historical telemetry.");
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        return; // Ignore aborted requests
      }
      setIsError(true);
      setErrorMessage(err.message || "An unexpected network error occurred while querying historical reports.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedRange, selectedDrive, appliedCustomDates]);

  useEffect(() => {
    loadHistoricalData();
    return () => {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
    };
  }, [loadHistoricalData]);

  // Handle Range Selection
  const handleRangeSelect = (r: string) => {
    setSelectedRange(r);
    if (r !== "custom") {
      setAppliedCustomDates(null);
    }
  };

  const handleApplyCustomDates = () => {
    if (!customStart || !customEnd) {
      alert("Please specify both a start date and an end date.");
      return;
    }
    if (new Date(customStart) > new Date(customEnd)) {
      alert("Start date cannot be after end date.");
      return;
    }
    setAppliedCustomDates({ start: customStart, end: customEnd });
  };

  // CSV Export
  const handleExportCSV = () => {
    const params: { range?: string; deviceId?: string; startDate?: string; endDate?: string } = {};
    if (selectedRange === "custom" && appliedCustomDates) {
      params.startDate = appliedCustomDates.start;
      params.endDate = appliedCustomDates.end;
    } else {
      params.range = selectedRange;
    }
    if (selectedDrive !== "ALL") {
      params.deviceId = selectedDrive;
    }
    const url = getHistoricalCsvExportUrl(params);
    window.open(url, "_blank");
  };

  // JSON Export
  const handleExportJSON = () => {
    if (!report) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `AEGISSTOR_historical_report_${selectedRange}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Combine storage, performance, and disk IO for synchronized display
  const chartStorageData = React.useMemo(() => {
    if (!report?.storage_history) return [];
    const items = selectedDrive !== "ALL"
      ? report.storage_history.filter(pt => pt.device_id === selectedDrive)
      : report.storage_history;

    const timeMap = new Map<string, HistoricalStoragePoint>();
    items.forEach(pt => {
      const existing = timeMap.get(pt.timestamp);
      if (!existing) {
        timeMap.set(pt.timestamp, { ...pt });
      } else {
        existing.used_storage_gb = Math.round((existing.used_storage_gb + pt.used_storage_gb) * 100) / 100;
        existing.free_storage_gb = Math.round((existing.free_storage_gb + pt.free_storage_gb) * 100) / 100;
        existing.total_storage_gb = Math.round((existing.total_storage_gb + pt.total_storage_gb) * 100) / 100;
        existing.utilization_percent = existing.total_storage_gb > 0
          ? Math.round((existing.used_storage_gb / existing.total_storage_gb * 100) * 100) / 100
          : existing.utilization_percent;
        existing.device_id = "All Volumes";
      }
    });

    return Array.from(timeMap.values()).map(pt => ({
      ...pt,
      formattedTime: formatTimestamp(pt.timestamp, selectedRange),
      fullTime: formatFullTimestamp(pt.timestamp)
    }));
  }, [report?.storage_history, selectedDrive, formatTimestamp, formatFullTimestamp, selectedRange]);

  const chartDiskIOData = React.useMemo(() => {
    if (!report?.disk_io_history) return [];
    const items = selectedDrive !== "ALL"
      ? report.disk_io_history.filter(pt => pt.device_id === selectedDrive)
      : report.disk_io_history;

    const timeMap = new Map<string, HistoricalDiskIOPoint>();
    items.forEach(pt => {
      const existing = timeMap.get(pt.timestamp);
      if (!existing) {
        timeMap.set(pt.timestamp, { ...pt });
      } else {
        existing.disk_read_mb_s = Math.round((existing.disk_read_mb_s + pt.disk_read_mb_s) * 100) / 100;
        existing.disk_write_mb_s = Math.round((existing.disk_write_mb_s + pt.disk_write_mb_s) * 100) / 100;
        existing.device_id = "All Volumes";
      }
    });

    return Array.from(timeMap.values()).map(pt => ({
      ...pt,
      formattedTime: formatTimestamp(pt.timestamp, selectedRange),
      fullTime: formatFullTimestamp(pt.timestamp)
    }));
  }, [report?.disk_io_history, selectedDrive, formatTimestamp, formatFullTimestamp, selectedRange]);

  const chartPerfData = React.useMemo(() => {
    if (!report?.performance_history) return [];
    return report.performance_history.map(pt => ({
      ...pt,
      formattedTime: formatTimestamp(pt.timestamp, selectedRange),
      fullTime: formatFullTimestamp(pt.timestamp)
    }));
  }, [report?.performance_history, formatTimestamp, formatFullTimestamp, selectedRange]);

  // Detected device list for dropdown
  const detectedDriveOptions = React.useMemo(() => {
    const set = new Set<string>();
    if (drives && drives.length > 0) {
      drives.forEach(d => set.add(d.device));
    }
    if (report?.storage_history) {
      report.storage_history.forEach(s => set.add(s.device_id));
    }
    if (set.size === 0) {
      set.add("C:");
    }
    return Array.from(set);
  }, [drives, report?.storage_history]);

  const summary = report?.summary;

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>
            Historical Storage Reports & Telemetry
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Audit persisted storage telemetry records, analyze multi-horizon capacity progression, and export verified datasets.
          </p>
        </div>

        {/* Filter Controls & Exports */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Device Volume Filter */}
          <div style={{ display: "flex", alignItems: "center", background: "#0b1120", border: "1px solid #1e293b", borderRadius: "6px", padding: "4px 8px", gap: "6px" }}>
            <HardDrive size={13} color="#94a3b8" />
            <select
              value={selectedDrive}
              onChange={(e) => setSelectedDrive(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                color: "#f8fafc",
                fontSize: "0.78rem",
                fontWeight: 600,
                outline: "none",
                cursor: "pointer"
              }}
            >
              <option value="ALL" style={{ background: "#0b1120" }}>All Volumes</option>
              {detectedDriveOptions.map(dev => (
                <option key={dev} value={dev} style={{ background: "#0b1120" }}>
                  Volume {dev}
                </option>
              ))}
            </select>
          </div>

          {/* Time Range Selector */}
          <div style={{ display: "flex", background: "#0b1120", border: "1px solid #1e293b", borderRadius: "6px", padding: "2px" }}>
            {[
              { label: "24 Hours", value: "24h" },
              { label: "7 Days", value: "7d" },
              { label: "30 Days", value: "30d" },
              { label: "90 Days", value: "90d" },
              { label: "Custom", value: "custom" },
            ].map(r => (
              <button
                key={r.value}
                onClick={() => handleRangeSelect(r.value)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "4px",
                  border: "none",
                  background: selectedRange === r.value ? "#2563eb" : "transparent",
                  color: selectedRange === r.value ? "#ffffff" : "#94a3b8",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={loadHistoricalData}
            disabled={isLoading}
            className="btn"
            style={{ fontSize: "0.78rem", padding: "6px 10px" }}
            title="Refresh historical report"
          >
            <RefreshCw size={13} className={isLoading ? "spin-animation" : ""} />
          </button>

          {/* Export Buttons */}
          <button
            onClick={handleExportCSV}
            disabled={!report?.data_available}
            className="btn"
            style={{ fontSize: "0.78rem", padding: "6px 12px", opacity: !report?.data_available ? 0.5 : 1 }}
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportJSON}
            disabled={!report?.data_available}
            className="btn"
            style={{ fontSize: "0.78rem", padding: "6px 12px", opacity: !report?.data_available ? 0.5 : 1 }}
          >
            <Download size={13} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Custom Date Filter Panel */}
      {selectedRange === "custom" && (
        <div className="card" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", background: "#0b1120", border: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Calendar size={15} color="#38bdf8" />
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#f8fafc" }}>Custom Date Window:</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Start Date:</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              style={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "4px",
                color: "#f8fafc",
                padding: "4px 8px",
                fontSize: "0.8rem",
                outline: "none"
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "0.75rem", color: "#94a3b8" }}>End Date:</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "4px",
                color: "#f8fafc",
                padding: "4px 8px",
                fontSize: "0.8rem",
                outline: "none"
              }}
            />
          </div>

          <button
            onClick={handleApplyCustomDates}
            className="btn"
            style={{ background: "#2563eb", color: "#ffffff", padding: "5px 14px", fontSize: "0.78rem", fontWeight: 600 }}
          >
            Apply Range
          </button>
        </div>
      )}

      {/* Loading State Indicator */}
      {isLoading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px", gap: "12px", color: "#94a3b8" }}>
          <div style={{
            width: "24px",
            height: "24px",
            border: "3px solid rgba(59, 130, 246, 0.2)",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite"
          }} />
          <span style={{ fontSize: "0.85rem" }}>Querying persisted historical telemetry and aggregating time-series data...</span>
        </div>
      )}

      {/* Error State with Retry */}
      {isError && !isLoading && (
        <div className="card" style={{ borderLeft: "4px solid #ef4444", background: "rgba(239, 68, 68, 0.05)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <AlertCircle size={20} color="#ef4444" />
            <div>
              <div style={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.9rem" }}>Failed to retrieve historical telemetry</div>
              <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px" }}>{errorMessage}</div>
            </div>
          </div>
          <button onClick={loadHistoricalData} className="btn" style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
            Retry Request
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && report && !report.data_available && (
        <div className="card" style={{ textAlign: "center", padding: "50px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <Clock size={36} color="#64748b" />
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#f8fafc" }}>
            Historical Telemetry Has Not Been Collected Yet
          </h3>
          <p style={{ fontSize: "0.85rem", color: "#94a3b8", maxWidth: "500px" }}>
            The background telemetry collector records system snapshots every 5 seconds. If this instance was just started, initial records are being populated.
          </p>
          <button onClick={loadHistoricalData} className="btn" style={{ marginTop: "8px" }}>
            <RefreshCw size={14} />
            <span>Check Telemetry Again</span>
          </button>
        </div>
      )}

      {/* Main Content Area (when data is available) */}
      {!isLoading && !isError && report?.data_available && (
        <>
          {/* KPI Summary Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
            <div className="card" style={{ padding: "16px" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Total Storage</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
                {summary?.total_storage_gb ?? 0} <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>GB</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "#38bdf8", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                <HardDrive size={12} />
                <span>Monitored Capacity</span>
              </div>
            </div>

            <div className="card" style={{ padding: "16px" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Average Used</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#38bdf8", marginTop: "4px" }}>
                {summary?.average_used_storage_gb ?? 0} <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>GB</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
                Window Average
              </div>
            </div>

            <div className="card" style={{ padding: "16px" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Peak Storage Used</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#f59e0b", marginTop: "4px" }}>
                {summary?.maximum_used_storage_gb ?? 0} <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>GB</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
                Maximum Observed
              </div>
            </div>

            <div className="card" style={{ padding: "16px" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Avg Utilization</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: (summary?.average_utilization_percent || 0) > 80 ? "#ef4444" : "#10b981", marginTop: "4px" }}>
                {summary?.average_utilization_percent ?? 0} <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>%</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
                Storage Capacity Used
              </div>
            </div>

            <div className="card" style={{ padding: "16px" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Average Host CPU</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
                {summary?.average_cpu_percent ?? 0} <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>%</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                <Cpu size={12} color="#f59e0b" />
                <span>Host Load</span>
              </div>
            </div>

            <div className="card" style={{ padding: "16px" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Average Host RAM</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
                {summary?.average_ram_percent ?? 0} <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>%</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                <Layers size={12} color="#8b5cf6" />
                <span>Memory Footprint</span>
              </div>
            </div>
          </div>

          {/* Chart 1: Storage Utilization Progression */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 className="card-title" style={{ margin: 0 }}>
                <HardDrive size={18} color="#38bdf8" />
                Storage Utilization Progression ({report.range.toUpperCase()})
              </h3>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {report.record_count} historical time-series observation points
              </span>
            </div>

            <div style={{ height: "300px", width: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartStorageData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="usedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="freeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="formattedTime"
                    stroke="#64748b"
                    minTickGap={35}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="#64748b" tickFormatter={(v) => `${v} GB`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0b1120", borderColor: "#1e293b", color: "#f8fafc", borderRadius: "6px" }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime || ""}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Area
                    type="monotone"
                    dataKey="used_storage_gb"
                    name="Used Storage (GB)"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#usedGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="free_storage_gb"
                    name="Free Storage (GB)"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#freeGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Dual Charts Row: Disk I/O & Host Performance */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: "20px" }}>
            {/* Chart 2: Disk I/O Activity Over Time */}
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: "16px" }}>
                <Activity size={18} color="#10b981" />
                Disk I/O Activity Over Time (MB/s)
              </h3>

              <div style={{ height: "240px", width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartDiskIOData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="readHist" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="writeHist" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="formattedTime"
                      stroke="#64748b"
                      minTickGap={35}
                      interval="preserveStartEnd"
                    />
                    <YAxis stroke="#64748b" tickFormatter={(v) => `${v} MB/s`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0b1120", borderColor: "#1e293b", color: "#f8fafc", borderRadius: "6px" }}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime || ""}
                    />
                    <Legend verticalAlign="top" height={32} />
                    <Area
                      type="monotone"
                      dataKey="disk_read_mb_s"
                      name="Read Throughput (MB/s)"
                      stroke="#38bdf8"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#readHist)"
                    />
                    <Area
                      type="monotone"
                      dataKey="disk_write_mb_s"
                      name="Write Throughput (MB/s)"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#writeHist)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 3: Host CPU & RAM Load History */}
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: "16px" }}>
                <Cpu size={18} color="#f59e0b" />
                Host Performance Progression (CPU & RAM %)
              </h3>

              <div style={{ height: "240px", width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartPerfData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="formattedTime"
                      stroke="#64748b"
                      minTickGap={35}
                      interval="preserveStartEnd"
                    />
                    <YAxis stroke="#64748b" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0b1120", borderColor: "#1e293b", color: "#f8fafc", borderRadius: "6px" }}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime || ""}
                    />
                    <Legend verticalAlign="top" height={32} />
                    <Line
                      type="monotone"
                      dataKey="cpu_percent"
                      name="CPU Load %"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="ram_percent"
                      name="RAM Usage %"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Data Table of Persisted Telemetry Snapshots */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 className="card-title" style={{ margin: 0 }}>
                <Layers size={18} color="#38bdf8" />
                Recorded Telemetry Snapshots
              </h3>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Displaying chronologically persisted hardware records
              </span>
            </div>

            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp (Local)</th>
                    <th>Volume ID</th>
                    <th>Used Space</th>
                    <th>Free Space</th>
                    <th>Utilization</th>
                    <th>Read MB/s</th>
                    <th>Write MB/s</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {chartStorageData.slice(-20).reverse().map((row, i) => {
                    const ioMatch = chartDiskIOData.find(d => d.timestamp === row.timestamp && d.device_id === row.device_id) || chartDiskIOData.find(d => d.timestamp === row.timestamp);
                    return (
                      <tr key={i}>
                        <td style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: "0.8rem" }}>
                          {row.fullTime}
                        </td>
                        <td style={{ fontWeight: 600, color: "#f8fafc" }}>
                          {row.device_id}
                        </td>
                        <td style={{ color: "#38bdf8", fontWeight: 700 }}>
                          {row.used_storage_gb} GB
                        </td>
                        <td style={{ color: "#10b981" }}>
                          {row.free_storage_gb} GB
                        </td>
                        <td>
                          <span
                            className={`badge ${row.utilization_percent >= 90 ? "badge-critical" : row.utilization_percent >= 80 ? "badge-high" : "badge-low"}`}
                            style={{ fontSize: "0.7rem" }}
                          >
                            {row.utilization_percent}%
                          </span>
                        </td>
                        <td style={{ fontFamily: "monospace" }}>
                          {ioMatch?.disk_read_mb_s ?? 0}
                        </td>
                        <td style={{ fontFamily: "monospace" }}>
                          {ioMatch?.disk_write_mb_s ?? 0}
                        </td>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#10b981", fontSize: "0.72rem", fontWeight: 600 }}>
                            <CheckCircle2 size={12} />
                            <span>VERIFIED</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
