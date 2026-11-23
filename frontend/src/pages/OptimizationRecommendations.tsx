import React, { useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  FolderOpen,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert
} from "lucide-react";
import { OptimizationRecommendationItem, AuditLogItem } from "../types";

interface OptimizationProps {
  recommendations: OptimizationRecommendationItem[];
  auditLogs: AuditLogItem[];
  onRequestAction: (rec: OptimizationRecommendationItem) => void;
  onRefresh: () => void;
}

export const OptimizationRecommendations: React.FC<OptimizationProps> = ({
  recommendations,
  auditLogs,
  onRequestAction,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<"pending" | "audit">("pending");

  const totalPotentialRecoveryBytes = recommendations.reduce(
    (acc, r) => acc + (r.status === "PENDING" ? r.estimated_recovery_bytes : 0),
    0
  );
  const potentialRecoveryGb = (totalPotentialRecoveryBytes / (1024 ** 3)).toFixed(2);

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>
            Optimization Center & Safety Protocols
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Rule-verified recommendations with strict confirmation gates, guaranteed system file preservation, and full audit trails.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => setActiveTab("pending")}
            className="btn"
            style={{
              background: activeTab === "pending" ? "rgba(37, 99, 235, 0.2)" : "#0f172a",
              color: activeTab === "pending" ? "#38bdf8" : "#94a3b8",
              border: `1px solid ${activeTab === "pending" ? "rgba(37, 99, 235, 0.5)" : "#1e293b"}`
            }}
          >
            <Sparkles size={14} />
            <span>Active Proposals ({recommendations.filter(r => r.status === "PENDING").length})</span>
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            className="btn"
            style={{
              background: activeTab === "audit" ? "rgba(37, 99, 235, 0.2)" : "#0f172a",
              color: activeTab === "audit" ? "#38bdf8" : "#94a3b8",
              border: `1px solid ${activeTab === "audit" ? "rgba(37, 99, 235, 0.5)" : "#1e293b"}`
            }}
          >
            <Clock size={14} />
            <span>Audit Trail ({auditLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Safety Manifesto Banner */}
      <div style={{
        background: "rgba(16, 185, 129, 0.08)",
        border: "1px solid rgba(16, 185, 129, 0.25)",
        borderRadius: "10px",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <ShieldCheck size={28} color="#34d399" />
          <div>
            <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc" }}>
              Active Safety Shield: Protected OS Boundaries
            </h4>
            <p style={{ fontSize: "0.8rem", color: "#cbd5e1", marginTop: "2px" }}>
              C:\Windows, System Volume Information, boot partitions, and system services are strictly protected. No file is ever removed without explicit review.
            </p>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Potential Reclaimable Space</span>
          <p style={{ fontSize: "1.25rem", fontWeight: 700, color: "#34d399" }}>
            +{potentialRecoveryGb} GB
          </p>
        </div>
      </div>

      {/* ACTIVE PROPOSALS TAB */}
      {activeTab === "pending" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {recommendations.filter(r => r.status === "PENDING").length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "40px" }}>
              <CheckCircle2 size={36} color="#10b981" style={{ margin: "0 auto 12px auto" }} />
              <h3 style={{ color: "#f8fafc" }}>System Is Fully Optimized</h3>
              <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "4px" }}>
                No critical clutter or pending actions identified at this time.
              </p>
            </div>
          ) : (
            recommendations.filter(r => r.status === "PENDING").map((rec) => (
              <div key={rec.id} className="card" style={{ borderLeft: `4px solid ${rec.risk_level === "LOW" ? "#10b981" : rec.risk_level === "MODERATE" ? "#f59e0b" : "#ef4444"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className={`badge badge-${rec.risk_level.toLowerCase()}`}>
                        {rec.risk_level} RISK
                      </span>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc" }}>
                        {rec.issue}
                      </h3>
                    </div>
                    <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>
                      Drive Volume: <strong style={{ color: "#cbd5e1" }}>{rec.drive_name}</strong> | Category: <strong style={{ color: "#cbd5e1" }}>{rec.category.replace("_", " ")}</strong>
                    </p>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Estimated Headroom Recovery</span>
                    <p style={{ fontSize: "1.25rem", fontWeight: 700, color: "#38bdf8" }}>
                      {rec.estimated_recovery_formatted}
                    </p>
                  </div>
                </div>

                {/* Details Box */}
                <div style={{
                  background: "#070b14",
                  borderRadius: "8px",
                  padding: "14px",
                  border: "1px solid #1e293b",
                  marginBottom: "14px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px"
                }}>
                  <div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Expected System Benefit</span>
                    <p style={{ fontSize: "0.85rem", color: "#cbd5e1", marginTop: "2px" }}>
                      {rec.expected_benefit}
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Proposed Action</span>
                    <p style={{ fontSize: "0.85rem", color: "#38bdf8", marginTop: "2px" }}>
                      {rec.recommended_action}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    onClick={() => onRequestAction(rec)}
                    className="btn btn-primary"
                  >
                    <CheckCircle2 size={14} />
                    <span>Review & Execute Safe Action</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* AUDIT LOG TAB */}
      {activeTab === "audit" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <Clock size={18} color="#06b6d4" />
                Immutable Audit Log
              </h3>
              <p className="card-subtitle">
                Cryptographically tracked record of all scans, interventions, and optimizations performed
              </p>
            </div>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp (UTC)</th>
                  <th>Action Type</th>
                  <th>Operation Description</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "#64748b", padding: "30px" }}>
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ color: "#94a3b8", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                        {log.timestamp}
                      </td>
                      <td style={{ fontWeight: 600, color: "#38bdf8" }}>
                        {log.action_type}
                      </td>
                      <td style={{ color: "#cbd5e1" }}>
                        {log.description}
                      </td>
                      <td>
                        <span className="badge badge-low" style={{ fontSize: "0.68rem" }}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
