import React from "react";
import {
  HardDrive,
  Activity,
  CheckCircle2,
  RefreshCw,
  FolderGit2,
  Cpu,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { DriveInfo } from "../types";

interface StorageMonitoringProps {
  drives: DriveInfo[];
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const StorageMonitoring: React.FC<StorageMonitoringProps> = ({
  drives,
  onRefresh,
  isRefreshing
}) => {
  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>
            Real-Time Storage Monitoring
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Live hardware telemetry, mount points, partition health and disk I/O rates across all attached devices.
          </p>
        </div>

        <button onClick={onRefresh} disabled={isRefreshing} className="btn btn-primary">
          <RefreshCw size={14} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
          <span>Scan Storage Devices</span>
        </button>
      </div>

      {/* Drives Grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {drives.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "40px" }}>
            <HardDrive size={36} color="#64748b" style={{ margin: "0 auto 12px auto" }} />
            <h3 style={{ color: "#cbd5e1" }}>No Storage Volumes Detected</h3>
            <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "4px" }}>
              Querying Windows storage subsystems... Please verify drive permissions.
            </p>
          </div>
        ) : (
          drives.map((d) => {
            const totalGb = (d.total_bytes / (1024 ** 3)).toFixed(1);
            const usedGb = (d.used_bytes / (1024 ** 3)).toFixed(1);
            const freeGb = (d.free_bytes / (1024 ** 3)).toFixed(1);
            const totalTb = (d.total_bytes / (1024 ** 4)).toFixed(2);
            const pct = d.usage_percent;

            const readMbS = (d.read_bytes_sec / (1024 * 1024)).toFixed(2);
            const writeMbS = (d.write_bytes_sec / (1024 * 1024)).toFixed(2);

            let statusClass = "fill-low";
            let badgeType: "low" | "moderate" | "high" | "critical" = "low";
            if (pct >= 90) { statusClass = "fill-critical"; badgeType = "critical"; }
            else if (pct >= 80) { statusClass = "fill-high"; badgeType = "high"; }
            else if (pct >= 65) { statusClass = "fill-moderate"; badgeType = "moderate"; }

            return (
              <div key={d.device} className="card" style={{ borderLeft: "4px solid #3b82f6" }}>
                {/* Top Row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "10px",
                      backgroundColor: "#070b14",
                      border: "1px solid #1e293b",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}>
                      <HardDrive size={24} color="#38bdf8" />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#f8fafc" }}>
                          {d.device} ({d.mountpoint})
                        </h2>
                        <span className="badge badge-cyan">
                          {d.drive_type || "NVMe SSD"}
                        </span>
                        <span className={`badge badge-${badgeType}`}>
                          {pct}% Used
                        </span>
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
                        Hardware: <strong style={{ color: "#cbd5e1" }}>{d.hardware_name || "Primary NVMe Storage"}</strong> | Filesystem: <strong style={{ color: "#cbd5e1" }}>{d.fstype}</strong>
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(16, 185, 129, 0.1)", padding: "4px 10px", borderRadius: "6px", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
                    <CheckCircle2 size={13} color="#34d399" />
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#34d399" }}>
                      {d.disk_health}
                    </span>
                  </div>
                </div>

                {/* Capacity Progress Bar */}
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "6px" }}>
                    <span style={{ color: "#cbd5e1" }}>
                      Used: <strong style={{ color: "#f8fafc" }}>{usedGb} GB</strong> / Free: <strong style={{ color: "#34d399" }}>{freeGb} GB</strong>
                    </span>
                    <span style={{ color: "#64748b" }}>
                      Total Volume: {totalGb} GB ({totalTb} TB)
                    </span>
                  </div>
                  <div className="progress-container" style={{ height: "10px" }}>
                    <div className={`progress-fill ${statusClass}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {/* Telemetry Metrics Grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                  background: "#070b14",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #1e293b"
                }}>
                  <div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Read Throughput</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                      <ArrowDownRight size={16} color="#38bdf8" />
                      <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc" }}>{readMbS} MB/s</span>
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>{d.read_ops_sec.toFixed(0)} IOPS</span>
                  </div>

                  <div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Write Throughput</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                      <ArrowUpRight size={16} color="#10b981" />
                      <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc" }}>{writeMbS} MB/s</span>
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>{d.write_ops_sec.toFixed(0)} IOPS</span>
                  </div>

                  <div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Mount Options</span>
                    <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#f8fafc", marginTop: "4px" }}>
                      {d.opts || "rw, fixed"}
                    </p>
                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Windows Partition</span>
                  </div>

                  <div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Sampling Interval</span>
                    <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#f8fafc", marginTop: "4px" }}>
                      5.0 Seconds
                    </p>
                    <span style={{ fontSize: "0.72rem", color: "#34d399" }}>Synchronized</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
