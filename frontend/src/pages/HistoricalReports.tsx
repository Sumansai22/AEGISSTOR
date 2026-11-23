import React, { useState } from "react";
import {
  FileText,
  Download,
  Calendar,
  HardDrive,
  Activity,
  CheckCircle2,
  Clock
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from "recharts";

interface HistoricalReportsProps {
  historyData: any[];
  onTimeRangeChange: (hours: number) => void;
}

export const HistoricalReports: React.FC<HistoricalReportsProps> = ({
  historyData,
  onTimeRangeChange
}) => {
  const [selectedRange, setSelectedRange] = useState<number>(24);

  const handleRangeChange = (hours: number) => {
    setSelectedRange(hours);
    onTimeRangeChange(hours);
  };

  const handleExportCSV = () => {
    if (!historyData || historyData.length === 0) return;
    const headers = Object.keys(historyData[0]).join(",");
    const rows = historyData.map(row => Object.values(row).join(",")).join("\n");
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `AEGISSTOR_telemetry_${selectedRange}h.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    if (!historyData || historyData.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(historyData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `AEGISSTOR_telemetry_${selectedRange}h.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>
            Historical Storage Reports & Telemetry
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Audit storage telemetry records, evaluate consumption trends over time, and export verified datasets.
          </p>
        </div>

        {/* Range Selector & Exports */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", background: "#0b1120", border: "1px solid #1e293b", borderRadius: "6px", padding: "2px" }}>
            {[
              { label: "1h", hours: 1 },
              { label: "24h", hours: 24 },
              { label: "7d", hours: 168 },
              { label: "30d", hours: 720 },
            ].map(r => (
              <button
                key={r.hours}
                onClick={() => handleRangeChange(r.hours)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "4px",
                  border: "none",
                  background: selectedRange === r.hours ? "#2563eb" : "transparent",
                  color: selectedRange === r.hours ? "#ffffff" : "#94a3b8",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button onClick={handleExportCSV} className="btn" style={{ fontSize: "0.78rem", padding: "6px 12px" }}>
            <Download size={13} />
            <span>Export CSV</span>
          </button>
          <button onClick={handleExportJSON} className="btn" style={{ fontSize: "0.78rem", padding: "6px 12px" }}>
            <Download size={13} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Historical Utilization Chart */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: "16px" }}>
          <HardDrive size={18} color="#38bdf8" />
          Storage Utilization Progression ({selectedRange} Hours)
        </h3>

        <div style={{ height: "280px", width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={historyData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="timestamp" stroke="#64748b" />
              <YAxis stroke="#64748b" tickFormatter={(v) => `${v} GB`} />
              <Tooltip contentStyle={{ backgroundColor: "#0b1120", borderColor: "#1e293b", color: "#f8fafc", borderRadius: "6px" }} />
              <Legend verticalAlign="top" height={36} />
              <Area type="monotone" dataKey="used_gb" name="Used Storage (GB)" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#histGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Historical I/O Chart */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: "16px" }}>
          <Activity size={18} color="#10b981" />
          Disk I/O Activity Over Time (MB/s)
        </h3>

        <div style={{ height: "240px", width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={historyData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="readHist" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="writeHist" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="timestamp" stroke="#64748b" />
              <YAxis stroke="#64748b" tickFormatter={(v) => `${v} MB/s`} />
              <Tooltip contentStyle={{ backgroundColor: "#0b1120", borderColor: "#1e293b", color: "#f8fafc", borderRadius: "6px" }} />
              <Legend verticalAlign="top" height={36} />
              <Area type="monotone" dataKey="read_mb_s" name="Read Throughput (MB/s)" stroke="#38bdf8" fill="url(#readHist)" />
              <Area type="monotone" dataKey="write_mb_s" name="Write Throughput (MB/s)" stroke="#10b981" fill="url(#writeHist)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data Table */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: "16px" }}>
          Recorded Telemetry Snapshots
        </h3>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Drive Volume</th>
                <th>Used Space</th>
                <th>Free Space</th>
                <th>Utilization %</th>
                <th>Read (MB/s)</th>
                <th>Write (MB/s)</th>
              </tr>
            </thead>
            <tbody>
              {historyData.slice(-15).reverse().map((row, i) => (
                <tr key={i}>
                  <td style={{ color: "#94a3b8", fontFamily: "monospace" }}>{row.timestamp}</td>
                  <td style={{ fontWeight: 600, color: "#f8fafc" }}>{row.drive}</td>
                  <td style={{ color: "#38bdf8", fontWeight: 700 }}>{row.used_gb} GB</td>
                  <td style={{ color: "#10b981" }}>{row.free_gb} GB</td>
                  <td>
                    <span className="badge badge-low" style={{ fontSize: "0.7rem" }}>
                      {row.usage_percent}%
                    </span>
                  </td>
                  <td>{row.read_mb_s}</td>
                  <td>{row.write_mb_s}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
