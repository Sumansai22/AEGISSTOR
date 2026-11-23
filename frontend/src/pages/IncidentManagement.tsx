import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  ShieldAlert,
  Clock,
  CheckCircle,
  TrendingUp,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
  X,
  Send
} from "lucide-react";
import {
  fetchIncidents,
  fetchIncidentStats,
  fetchIncidentDetails,
  acknowledgeIncident,
  resolveIncident
} from "../services/api";
import { IncidentItem, IncidentStats, IncidentDetails } from "../types";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from "recharts";

export const IncidentManagement: React.FC = () => {
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [stats, setStats] = useState<IncidentStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Selected Incident for Detail Modal
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [incidentDetails, setIncidentDetails] = useState<IncidentDetails | null>(null);
  const [actionComment, setActionComment] = useState<string>("");
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string>("");

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const [incData, statsData] = await Promise.all([
        fetchIncidents({
          status: statusFilter === "ALL" ? undefined : statusFilter,
          severity: severityFilter === "ALL" ? undefined : severityFilter,
          search: searchQuery || undefined,
          limit: 100
        }),
        fetchIncidentStats()
      ]);
      setIncidents(incData.items || []);
      setStats(statsData);
    } catch (err) {
      console.error("Failed to load incidents:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, severityFilter]);

  // Load details when modal opens
  useEffect(() => {
    if (selectedIncidentId) {
      fetchIncidentDetails(selectedIncidentId)
        .then(setIncidentDetails)
        .catch(console.error);
    } else {
      setIncidentDetails(null);
      setActionComment("");
      setActionSuccessMsg("");
    }
  }, [selectedIncidentId]);

  const handleAcknowledge = async () => {
    if (!selectedIncidentId) return;
    setIsActionLoading(true);
    try {
      await acknowledgeIncident(selectedIncidentId, actionComment || "Acknowledged by operator.");
      setActionSuccessMsg("Incident acknowledged successfully.");
      const updated = await fetchIncidentDetails(selectedIncidentId);
      setIncidentDetails(updated);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to acknowledge incident");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedIncidentId) return;
    setIsActionLoading(true);
    try {
      await resolveIncident(selectedIncidentId, actionComment || "Verified resolved by operator.");
      setActionSuccessMsg("Incident resolved successfully.");
      const updated = await fetchIncidentDetails(selectedIncidentId);
      setIncidentDetails(updated);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to resolve incident");
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px", display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle size={26} color="#ef4444" />
            Operational & Security Incident Management
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Real-time incident ticketing, multi-channel notification auditing, root-cause evidence, and escalation tracking.
          </p>
        </div>

        <button onClick={loadData} disabled={isRefreshing} className="btn btn-primary">
          <RefreshCw size={14} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
          <span>Refresh Incidents</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid-cols-4">
        <div className="card" style={{ borderLeft: "4px solid #38bdf8" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>Total Incidents</div>
          <div style={{ fontSize: "1.7rem", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>{stats?.total_incidents ?? 0}</div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>Across all storage & cloud domains</div>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #f59e0b" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>Open / Escalated</div>
          <div style={{ fontSize: "1.7rem", fontWeight: 700, color: "#f59e0b", marginTop: "4px" }}>{stats?.open_incidents ?? 0}</div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>Pending investigation or resolution</div>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #ef4444" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>Critical / Emergency</div>
          <div style={{ fontSize: "1.7rem", fontWeight: 700, color: "#ef4444", marginTop: "4px" }}>
            {(stats?.critical_incidents ?? 0) + (stats?.emergency_incidents ?? 0)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>Active high-priority incidents</div>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #10b981" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>MTTA / MTTR</div>
          <div style={{ fontSize: "1.7rem", fontWeight: 700, color: "#10b981", marginTop: "4px" }}>
            {stats?.mtta_minutes ?? 0}m / {stats?.mttr_minutes ?? 0}m
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>Mean Time to Acknowledge / Resolve</div>
        </div>
      </div>

      {/* 7-Day Incident Trend Chart */}
      {stats?.trends && stats.trends.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#f1f5f9", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <TrendingUp size={16} color="#38bdf8" />
            7-Day Incident Severity Trends
          </h3>
          <div style={{ width: "100%", height: "200px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.trends} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0b1120", border: "1px solid #1e293b", borderRadius: "6px" }}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                <Bar dataKey="emergency" name="Emergency" fill="#dc2626" />
                <Bar dataKey="critical" name="Critical" fill="#ef4444" />
                <Bar dataKey="warning" name="Warning" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: "16px", display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
          <Search size={16} color="#64748b" />
          <input
            type="text"
            placeholder="Search by incident number, title, or resource..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") loadData(); }}
            style={{
              background: "#070b14",
              border: "1px solid #1e293b",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#f8fafc",
              fontSize: "0.85rem",
              width: "100%"
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              background: "#070b14",
              border: "1px solid #1e293b",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#f8fafc",
              fontSize: "0.85rem"
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="ESCALATED">Escalated</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            style={{
              background: "#070b14",
              border: "1px solid #1e293b",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#f8fafc",
              fontSize: "0.85rem"
            }}
          >
            <option value="ALL">All Severities</option>
            <option value="EMERGENCY">Emergency</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
          </select>

          <button onClick={loadData} className="btn" style={{ padding: "8px 14px", fontSize: "0.85rem" }}>
            Filter
          </button>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="card" style={{ padding: "0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ background: "#070b14", borderBottom: "1px solid #1e293b", color: "#94a3b8" }}>
              <th style={{ padding: "12px 16px" }}>Incident ID</th>
              <th style={{ padding: "12px 16px" }}>Severity</th>
              <th style={{ padding: "12px 16px" }}>Title & Summary</th>
              <th style={{ padding: "12px 16px" }}>Resource</th>
              <th style={{ padding: "12px 16px" }}>Category</th>
              <th style={{ padding: "12px 16px" }}>Status</th>
              <th style={{ padding: "12px 16px" }}>Created</th>
              <th style={{ padding: "12px 16px", textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {incidents.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                  {loading ? "Loading incidents..." : "No matching operational incidents found."}
                </td>
              </tr>
            ) : (
              incidents.map((inc) => {
                const sevColor =
                  inc.severity === "EMERGENCY" ? "#dc2626" :
                  inc.severity === "CRITICAL" ? "#ef4444" :
                  inc.severity === "WARNING" ? "#f59e0b" : "#38bdf8";

                const statusBg =
                  inc.status === "RESOLVED" ? "rgba(16, 185, 129, 0.15)" :
                  inc.status === "ACKNOWLEDGED" ? "rgba(56, 189, 248, 0.15)" :
                  inc.status === "ESCALATED" ? "rgba(220, 38, 38, 0.2)" : "rgba(245, 158, 11, 0.15)";

                const statusColor =
                  inc.status === "RESOLVED" ? "#10b981" :
                  inc.status === "ACKNOWLEDGED" ? "#38bdf8" :
                  inc.status === "ESCALATED" ? "#f87171" : "#fbbf24";

                return (
                  <tr
                    key={inc.id}
                    style={{ borderBottom: "1px solid #1e293b", transition: "background 0.15s" }}
                    className="table-row-hover"
                  >
                    <td style={{ padding: "12px 16px", fontWeight: 700, color: "#38bdf8" }}>
                      {inc.incident_number}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        background: `${sevColor}22`,
                        color: sevColor,
                        border: `1px solid ${sevColor}44`,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontWeight: 700,
                        fontSize: "0.72rem"
                      }}>
                        {inc.severity}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#f8fafc", fontWeight: 500 }}>
                      {inc.title}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#94a3b8" }}>
                      <code>{inc.resource}</code>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#cbd5e1" }}>
                      {inc.category}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        background: statusBg,
                        color: statusColor,
                        padding: "3px 8px",
                        borderRadius: "12px",
                        fontWeight: 600,
                        fontSize: "0.75rem"
                      }}>
                        {inc.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: "0.78rem" }}>
                      {inc.created_at}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => setSelectedIncidentId(inc.id)}
                        className="btn"
                        style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                      >
                        Inspect Dossier
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Incident Detail Modal */}
      {selectedIncidentId && incidentDetails && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }}>
          <div style={{
            background: "#0b1120",
            border: "1px solid #1e293b",
            borderRadius: "12px",
            width: "100%",
            maxWidth: "850px",
            maxHeight: "90vh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.7)"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "20px 24px",
              borderBottom: "1px solid #1e293b",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#38bdf8" }}>
                    {incidentDetails.incident_number}
                  </span>
                  <span style={{
                    background: incidentDetails.severity === "EMERGENCY" ? "#dc262622" : incidentDetails.severity === "CRITICAL" ? "#ef444422" : "#f59e0b22",
                    color: incidentDetails.severity === "EMERGENCY" ? "#f87171" : incidentDetails.severity === "CRITICAL" ? "#ef4444" : "#f59e0b",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontWeight: 700,
                    fontSize: "0.75rem"
                  }}>
                    {incidentDetails.severity}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
                    Status: <strong style={{ color: "#f8fafc" }}>{incidentDetails.status}</strong>
                  </span>
                </div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 600, color: "#f8fafc", marginTop: "4px" }}>
                  {incidentDetails.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedIncidentId(null)}
                style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Alert Meta Grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "12px",
                background: "#070b14",
                padding: "16px",
                borderRadius: "8px",
                border: "1px solid #1e293b",
                fontSize: "0.82rem"
              }}>
                <div><span style={{ color: "#64748b" }}>Resource:</span> <strong style={{ color: "#f8fafc" }}>{incidentDetails.resource}</strong></div>
                <div><span style={{ color: "#64748b" }}>Category:</span> <strong style={{ color: "#f8fafc" }}>{incidentDetails.category}</strong></div>
                <div><span style={{ color: "#64748b" }}>Escalation Level:</span> <strong style={{ color: incidentDetails.escalation_level > 0 ? "#ef4444" : "#10b981" }}>Level {incidentDetails.escalation_level}</strong></div>
                <div><span style={{ color: "#64748b" }}>Created At:</span> <span style={{ color: "#cbd5e1" }}>{incidentDetails.created_at}</span></div>
                <div><span style={{ color: "#64748b" }}>Acknowledged:</span> <span style={{ color: "#cbd5e1" }}>{incidentDetails.acknowledged_at || "Pending"}</span></div>
                <div><span style={{ color: "#64748b" }}>Resolved:</span> <span style={{ color: "#cbd5e1" }}>{incidentDetails.resolved_at || "Open"}</span></div>
              </div>

              {/* Root Cause Evidence */}
              <div style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "8px", padding: "16px" }}>
                <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#f87171", textTransform: "uppercase", marginBottom: "6px" }}>
                  Root Cause Evidence & Metric Observation
                </h4>
                <p style={{ color: "#cbd5e1", fontSize: "0.85rem", lineHeight: 1.5 }}>
                  {incidentDetails.root_cause_evidence || "Awaiting supplementary telemetry capture."}
                </p>
              </div>

              {/* Recommended Action */}
              <div style={{ background: "rgba(56, 189, 248, 0.05)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "8px", padding: "16px" }}>
                <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", marginBottom: "6px" }}>
                  Recommended Corrective Action
                </h4>
                <p style={{ color: "#cbd5e1", fontSize: "0.85rem", lineHeight: 1.5 }}>
                  {incidentDetails.recommended_action || "Investigate target resource state."}
                </p>
              </div>

              {/* Notification Multi-Channel Delivery Logs */}
              <div>
                <h4 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#f1f5f9", marginBottom: "10px" }}>
                  Multi-Channel Notification Dispatch Audit Trail
                </h4>
                {incidentDetails.delivery_logs.length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: "0.82rem" }}>No external channel dispatches recorded.</p>
                ) : (
                  <div style={{ border: "1px solid #1e293b", borderRadius: "6px", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                      <thead>
                        <tr style={{ background: "#070b14", color: "#94a3b8", textAlign: "left" }}>
                          <th style={{ padding: "8px 12px" }}>Channel</th>
                          <th style={{ padding: "8px 12px" }}>Recipient</th>
                          <th style={{ padding: "8px 12px" }}>Status</th>
                          <th style={{ padding: "8px 12px" }}>Provider Response / Error</th>
                          <th style={{ padding: "8px 12px" }}>Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incidentDetails.delivery_logs.map((log, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #1e293b" }}>
                            <td style={{ padding: "8px 12px", fontWeight: 600, color: "#38bdf8" }}>{log.channel}</td>
                            <td style={{ padding: "8px 12px", color: "#cbd5e1" }}>{log.recipient}</td>
                            <td style={{ padding: "8px 12px" }}>
                              <span style={{
                                color: log.status === "DELIVERED" ? "#10b981" : "#ef4444",
                                fontWeight: 700
                              }}>
                                {log.status}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px", color: "#94a3b8" }}>
                              {log.provider_response || log.error_message || "-"}
                            </td>
                            <td style={{ padding: "8px 12px", color: "#64748b" }}>{log.delivered_at || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Action Toolbar */}
              <div style={{ borderTop: "1px solid #1e293b", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <h4 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#f1f5f9" }}>Administrator Incident Action</h4>

                {actionSuccessMsg && (
                  <div style={{ padding: "8px 12px", background: "rgba(16, 185, 129, 0.1)", color: "#10b981", borderRadius: "6px", fontSize: "0.82rem" }}>
                    {actionSuccessMsg}
                  </div>
                )}

                <textarea
                  placeholder="Enter investigation notes, root-cause assessment, or resolution details..."
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  style={{
                    background: "#070b14",
                    border: "1px solid #1e293b",
                    borderRadius: "6px",
                    padding: "10px 14px",
                    color: "#f8fafc",
                    fontSize: "0.85rem",
                    minHeight: "70px",
                    resize: "vertical"
                  }}
                />

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    onClick={handleAcknowledge}
                    disabled={isActionLoading || incidentDetails.status === "RESOLVED"}
                    className="btn"
                    style={{ padding: "8px 16px", fontSize: "0.85rem", background: "#0284c7" }}
                  >
                    Acknowledge Ticket
                  </button>

                  <button
                    onClick={handleResolve}
                    disabled={isActionLoading || incidentDetails.status === "RESOLVED"}
                    className="btn"
                    style={{ padding: "8px 16px", fontSize: "0.85rem", background: "#059669" }}
                  >
                    Resolve Incident
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
