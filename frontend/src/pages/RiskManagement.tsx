import React from "react";
import {
  AlertOctagon,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  Info,
  Clock,
  ArrowRight
} from "lucide-react";
import { RiskSummary, DriveInfo } from "../types";

interface RiskManagementProps {
  risks: RiskSummary | null;
  drives: DriveInfo[];
  onNavigateToOptimization: () => void;
}

export const RiskManagement: React.FC<RiskManagementProps> = ({
  risks,
  drives,
  onNavigateToOptimization
}) => {
  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>
            Storage Risk Engine & Alerts
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Real-time multi-factor risk categorization based on headroom, exhaustion trajectory, and I/O saturation.
          </p>
        </div>

        {risks && (
          <span className={`badge badge-${risks.overall_system_risk.toLowerCase()}`} style={{ fontSize: "0.85rem", padding: "6px 14px" }}>
            {risks.overall_system_risk} RISK LEVEL
          </span>
        )}
      </div>

      {/* Risk Metrics Summary */}
      <div className="grid-cols-4">
        <div className="card">
          <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>Critical Alerts</span>
          <p style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f87171", marginTop: "4px" }}>
            {risks?.critical_count ?? 0}
          </p>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Requires immediate intervention</span>
        </div>

        <div className="card">
          <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>High Risk</span>
          <p style={{ fontSize: "1.75rem", fontWeight: 700, color: "#fbbf24", marginTop: "4px" }}>
            {risks?.high_count ?? 0}
          </p>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Exceeding 80% advisory safety margin</span>
        </div>

        <div className="card">
          <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>Moderate Advisories</span>
          <p style={{ fontSize: "1.75rem", fontWeight: 700, color: "#38bdf8", marginTop: "4px" }}>
            {risks?.moderate_count ?? 0}
          </p>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Preventive maintenance recommended</span>
        </div>

        <div className="card">
          <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>Low / Healthy</span>
          <p style={{ fontSize: "1.75rem", fontWeight: 700, color: "#34d399", marginTop: "4px" }}>
            {risks?.low_count ?? 0}
          </p>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Normal operating headroom</span>
        </div>
      </div>

      {/* Active Alerts List */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">
              <ShieldAlert size={18} color="#f87171" />
              Active System Risk Alerts
            </h3>
            <p className="card-subtitle">
              Intelligent warnings generated from actual volume utilization and I/O telemetry
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {(!risks?.alerts || risks.alerts.length === 0) ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              <CheckCircle2 size={36} color="#10b981" style={{ margin: "0 auto 12px auto" }} />
              <h3 style={{ color: "#f8fafc" }}>No Active Risk Alerts</h3>
              <p style={{ fontSize: "0.85rem", marginTop: "4px" }}>
                All connected storage partitions are operating within safe utilization thresholds.
              </p>
            </div>
          ) : (
            risks.alerts.map((alert, i) => {
              const lvl = alert.risk_level.toLowerCase();
              return (
                <div key={i} style={{
                  background: "#070b14",
                  border: `1px solid ${alert.risk_level === "CRITICAL" ? "rgba(239, 68, 68, 0.4)" : alert.risk_level === "HIGH" ? "rgba(245, 158, 11, 0.4)" : "#1e293b"}`,
                  borderRadius: "8px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className={`badge badge-${lvl}`}>
                        {alert.risk_level}
                      </span>
                      <h4 style={{ fontSize: "1rem", fontWeight: 600, color: "#f8fafc" }}>
                        {alert.title}
                      </h4>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
                      Drive: {alert.drive_name}
                    </span>
                  </div>

                  <p style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
                    <strong>Reason:</strong> {alert.reason}
                  </p>

                  <div style={{
                    background: "#0b1120",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #1e293b",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <span style={{ fontSize: "0.82rem", color: "#38bdf8" }}>
                      <strong>Recommended Action:</strong> {alert.recommended_action}
                    </span>
                    <button onClick={onNavigateToOptimization} className="btn" style={{ padding: "4px 10px", fontSize: "0.75rem" }}>
                      <span>Resolve in Optimization Center</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Explanatory Risk Architecture Card */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: "12px" }}>
          <Info size={18} color="#06b6d4" />
          Risk Scoring Architecture & Principles
        </h3>
        <p style={{ fontSize: "0.85rem", color: "#94a3b8", lineHeight: 1.6 }}>
          AEGISSTOR does not evaluate risk purely on arbitrary percentages. It combines four distinct telemetry dimensions:
        </p>
        <ul style={{ fontSize: "0.82rem", color: "#cbd5e1", margin: "10px 0 0 20px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <li><strong>Threshold Exceedance:</strong> Standard advisory limits at 80% (Warning) and 90% (Critical) capacity.</li>
          <li><strong>Minimum Working Headroom:</strong> Windows requires at least 15 GB free space for kernel paging and hibernation files.</li>
          <li><strong>Storage Runway Velocity:</strong> If ML regression projects exhaustion within 7 days, a Critical Alert is raised regardless of current usage.</li>
          <li><strong>Disk I/O Saturation:</strong> Sustained throughput exceeding 150 MB/s triggers an I/O latency advisory.</li>
        </ul>
      </div>
    </div>
  );
};
