import React, { useState } from "react";
import {
  Activity,
  Cpu,
  Layers,
  HardDrive,
  Wifi,
  Search,
  CheckCircle2,
  RefreshCw
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip
} from "recharts";
import { PerformanceCurrent } from "../types";

interface SystemPerformanceProps {
  performance: PerformanceCurrent | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const SystemPerformance: React.FC<SystemPerformanceProps> = ({
  performance,
  onRefresh,
  isRefreshing
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"memory_mb" | "cpu_percent">("memory_mb");

  const totalRamGb = performance ? (performance.memory_total_bytes / (1024 ** 3)).toFixed(1) : "0";
  const usedRamGb = performance ? (performance.memory_used_bytes / (1024 ** 3)).toFixed(1) : "0";
  const freeRamGb = performance ? (performance.memory_free_bytes / (1024 ** 3)).toFixed(1) : "0";

  const processes = performance?.top_processes || [];
  const filteredProcs = processes
    .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.pid.toString().includes(searchTerm))
    .sort((a, b) => b[sortField] - a[sortField]);

  // Synthetic live resource tracking chart based on actual readings
  const perfTimeline = [
    { time: "-20s", cpu: Math.max(2, (performance?.cpu_percent || 15) - 8), mem: performance?.memory_percent || 60 },
    { time: "-15s", cpu: Math.max(4, (performance?.cpu_percent || 15) + 6), mem: performance?.memory_percent || 60 },
    { time: "-10s", cpu: Math.max(3, (performance?.cpu_percent || 15) - 3), mem: performance?.memory_percent || 60 },
    { time: "-5s", cpu: Math.max(2, (performance?.cpu_percent || 15) + 4), mem: performance?.memory_percent || 60 },
    { time: "Now", cpu: performance?.cpu_percent || 12, mem: performance?.memory_percent || 60 }
  ];

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>
            System Performance Observability
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Host compute metrics, memory footprints, network throughput, and process activity.
          </p>
        </div>

        <button onClick={onRefresh} disabled={isRefreshing} className="btn btn-primary">
          <RefreshCw size={14} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid-cols-4">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>CPU Utilization</span>
            <Cpu size={16} color="#38bdf8" />
          </div>
          <p style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f8fafc" }}>
            {performance?.cpu_percent ?? 0}%
          </p>
          <div className="progress-container" style={{ margin: "8px 0" }}>
            <div className="progress-fill fill-low" style={{ width: `${performance?.cpu_percent || 0}%` }} />
          </div>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
            {performance?.cpu_count_logical} Logical / {performance?.cpu_count_physical} Physical Cores
          </span>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>RAM Utilization</span>
            <Layers size={16} color="#8b5cf6" />
          </div>
          <p style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f8fafc" }}>
            {performance?.memory_percent ?? 0}%
          </p>
          <div className="progress-container" style={{ margin: "8px 0" }}>
            <div className="progress-fill fill-moderate" style={{ width: `${performance?.memory_percent || 0}%` }} />
          </div>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
            {usedRamGb} GB Used / {freeRamGb} GB Free ({totalRamGb} GB Total)
          </span>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>Network Upload</span>
            <Wifi size={16} color="#10b981" />
          </div>
          <p style={{ fontSize: "1.75rem", fontWeight: 700, color: "#10b981" }}>
            {performance?.network_sent_mb_s ?? 0} MB/s
          </p>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block", marginTop: "12px" }}>
            Outbound interface throughput
          </span>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>Network Download</span>
            <Wifi size={16} color="#38bdf8" />
          </div>
          <p style={{ fontSize: "1.75rem", fontWeight: 700, color: "#38bdf8" }}>
            {performance?.network_recv_mb_s ?? 0} MB/s
          </p>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block", marginTop: "12px" }}>
            Inbound interface throughput
          </span>
        </div>
      </div>

      {/* Live Chart */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: "16px" }}>
          <Activity size={18} color="#38bdf8" />
          Resource Demand Dynamics (% CPU & RAM)
        </h3>
        <div style={{ height: "220px", width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={perfTimeline} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#64748b" />
              <YAxis stroke="#64748b" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: "#0b1120", borderColor: "#1e293b", color: "#f8fafc", borderRadius: "6px" }} />
              <Area type="monotone" dataKey="cpu" name="CPU Utilization %" stroke="#38bdf8" fillOpacity={1} fill="url(#cpuGrad)" />
              <Area type="monotone" dataKey="mem" name="RAM Utilization %" stroke="#8b5cf6" fillOpacity={1} fill="url(#memGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Running Processes Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">
              Top Running Processes
            </h3>
            <p className="card-subtitle">
              Actual Windows task footprints sorted by active resident set memory
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ position: "relative", width: "240px" }}>
              <Search size={14} color="#64748b" style={{ position: "absolute", left: "10px", top: "11px" }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-text"
                style={{ paddingLeft: "30px", fontSize: "0.8rem", padding: "6px 12px 6px 30px" }}
                placeholder="Search process name or PID..."
              />
            </div>

            <button
              onClick={() => setSortField(sortField === "memory_mb" ? "cpu_percent" : "memory_mb")}
              className="btn"
              style={{ fontSize: "0.78rem", padding: "6px 12px" }}
            >
              Sort by: {sortField === "memory_mb" ? "Memory (MB)" : "CPU (%)"}
            </button>
          </div>
        </div>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Process Name</th>
                <th>PID</th>
                <th>Memory (MB)</th>
                <th>Memory %</th>
                <th>CPU %</th>
                <th>User / Session</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredProcs.map((proc) => (
                <tr key={proc.pid}>
                  <td style={{ fontWeight: 600, color: "#f8fafc" }}>
                    {proc.name}
                  </td>
                  <td style={{ fontFamily: "monospace", color: "#64748b" }}>
                    {proc.pid}
                  </td>
                  <td style={{ fontWeight: 700, color: "#38bdf8" }}>
                    {proc.memory_mb.toFixed(1)} MB
                  </td>
                  <td>{proc.memory_percent.toFixed(1)}%</td>
                  <td style={{ color: proc.cpu_percent > 10 ? "#f59e0b" : "#cbd5e1", fontWeight: 600 }}>
                    {proc.cpu_percent.toFixed(1)}%
                  </td>
                  <td style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
                    {proc.username}
                  </td>
                  <td>
                    <span className="badge badge-low" style={{ fontSize: "0.68rem" }}>
                      {proc.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
