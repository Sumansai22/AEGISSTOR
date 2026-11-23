import React, { useState, useEffect } from "react";
import {
  Database,
  PlusCircle,
  RefreshCw,
  Server,
  AlertTriangle,
  HardDrive,
  Layers,
  Activity,
  CheckCircle2,
  XCircle
} from "lucide-react";
import {
  fetchDatabases,
  createDatabaseConnection,
  testDatabaseConnection,
  syncDatabaseTelemetry,
  fetchDatabaseTelemetryLatest
} from "../services/api";
import { DatabaseConnection, DatabaseTelemetry } from "../types";
import { formatBytes } from "../utils/helpers";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

const DB_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b"];

export const DatabaseIntelligence: React.FC = () => {
  const [databases, setDatabases] = useState<DatabaseConnection[]>([]);
  const [selectedDb, setSelectedDb] = useState<DatabaseConnection | null>(null);
  const [telemetry, setTelemetry] = useState<DatabaseTelemetry | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // New DB form modal state
  const [showModal, setShowModal] = useState(false);
  const [newDb, setNewDb] = useState({
    name: "Production PostgreSQL",
    db_type: "POSTGRESQL",
    host: "localhost",
    port: 5432,
    database_name: "enterprise_db",
    username: "aegis_readonly",
    password: ""
  });

  const loadDatabases = async () => {
    try {
      setLoading(true);
      const data = await fetchDatabases();
      setDatabases(data);
      if (data.length > 0 && !selectedDb) {
        setSelectedDb(data[0]);
        loadTelemetry(data[0].id);
      }
    } catch (err: any) {
      console.warn("Databases load error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTelemetry = async (connId: number) => {
    try {
      const data = await fetchDatabaseTelemetryLatest(connId);
      setTelemetry(data);
    } catch {
      setTelemetry(null);
    }
  };

  useEffect(() => {
    loadDatabases();
  }, []);

  const handleTestConnection = async (id: number) => {
    setStatusMsg("Testing connection...");
    try {
      const res = await testDatabaseConnection(id);
      if (res.connected) {
        setStatusMsg(`Success: Connected to ${res.database_name} (${res.latency_ms} ms)`);
      } else {
        setStatusMsg(`Failed: ${res.error || "Unable to reach database"}`);
      }
    } catch (err: any) {
      setStatusMsg(`Connection error: ${err.message}`);
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleSyncTelemetry = async (id: number) => {
    setStatusMsg("Syncing metadata telemetry...");
    try {
      await syncDatabaseTelemetry(id);
      await loadTelemetry(id);
      setStatusMsg("Metadata telemetry synced successfully.");
    } catch (err: any) {
      setStatusMsg(`Sync error: ${err.message}`);
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleCreateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createDatabaseConnection(newDb);
      setShowModal(false);
      await loadDatabases();
      setStatusMsg("Database connection registered successfully.");
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      alert(`Registration failed: ${err.message}`);
    }
  };

  const pieData = telemetry ? [
    { name: "Table Data", value: telemetry.data_bytes, color: "#3b82f6" },
    { name: "Index Overhead", value: telemetry.index_bytes, color: "#f59e0b" }
  ] : [];

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Database className="w-7 h-7 text-indigo-400" />
            Enterprise Database Intelligence
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Enterprise database storage telemetry, index bloat surveillance, and tablespace growth tracking.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadDatabases()}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
          >
            <PlusCircle className="w-4 h-4" />
            Connect Database
          </button>
        </div>
      </div>

      {/* Compliance / Privacy Assurance Banner */}
      <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
        <div className="text-xs text-slate-300 space-y-1">
          <span className="font-semibold text-emerald-400">Read-Only Metadata Surveillance Active:</span>{" "}
          AEGISSTOR executes strict metadata and dictionary views (`pg_tables`, `sys.dm_db_index_usage_stats`, `information_schema`).
          No confidential business tables, PHI medical charts, or financial transaction rows are ever read, queried, or extracted.
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 bg-indigo-900/40 border border-indigo-500/40 rounded-lg text-indigo-200 text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
          {statusMsg}
        </div>
      )}

      {/* Database Connection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {databases.map((db) => {
          const isSelected = selectedDb?.id === db.id;
          return (
            <div
              key={db.id}
              onClick={() => {
                setSelectedDb(db);
                loadTelemetry(db.id);
              }}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                isSelected
                  ? "bg-slate-800/90 border-indigo-500 ring-2 ring-indigo-500/30"
                  : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-indigo-400" />
                  <span className="font-semibold text-white">{db.name}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                  {db.db_type}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Host: <span className="text-slate-200">{db.host}:{db.port}</span> | DB:{" "}
                <span className="text-slate-200">{db.database_name}</span>
              </p>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800/80">
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Active
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTestConnection(db.id);
                    }}
                    className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
                  >
                    Test
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSyncTelemetry(db.id);
                    }}
                    className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
                  >
                    Sync
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {databases.length === 0 && !loading && (
          <div className="col-span-full p-8 text-center bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
            <Database className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">No enterprise databases registered yet.</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add Connection
            </button>
          </div>
        )}
      </div>

      {/* Selected Database Telemetry Breakdown */}
      {selectedDb && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-xs text-slate-400 font-medium">Total Database Size</span>
              <p className="text-2xl font-bold text-white mt-1">
                {telemetry ? formatBytes(telemetry.total_storage_bytes) : "Scanning..."}
              </p>
              <p className="text-xs text-slate-500 mt-1">All datafiles + indexes combined</p>
            </div>
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-xs text-slate-400 font-medium">Table Data Footprint</span>
              <p className="text-2xl font-bold text-blue-400 mt-1">
                {telemetry ? formatBytes(telemetry.data_bytes) : "--"}
              </p>
              <p className="text-xs text-slate-500 mt-1">Raw table data extents</p>
            </div>
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-xs text-slate-400 font-medium">Index Overhead</span>
              <p className="text-2xl font-bold text-amber-400 mt-1">
                {telemetry ? formatBytes(telemetry.index_bytes) : "--"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {telemetry && telemetry.total_storage_bytes > 0
                  ? `${((telemetry.index_bytes / telemetry.total_storage_bytes) * 100).toFixed(1)}% of total volume`
                  : "Monitoring index bloat"}
              </p>
            </div>
          </div>

          {/* Charts & Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Storage Distribution */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                <HardDrive className="w-4 h-4 text-indigo-400" />
                Data vs Index Overhead Allocation
              </h2>
              {telemetry && pieData.length > 0 ? (
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={5}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any) => [formatBytes(Number(val) || 0), "Storage Size"]}
                        contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                  Click 'Sync' to load telemetry metrics
                </div>
              )}
            </div>

            {/* Tablespaces */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-indigo-400" />
                Tablespace Capacity Utilization
              </h2>
              {telemetry && telemetry.tablespaces && telemetry.tablespaces.length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {telemetry.tablespaces.map((ts, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
                      <div className="flex justify-between text-xs font-medium text-slate-200">
                        <span>{ts.tablespace_name}</span>
                        <span>{ts.usage_percent.toFixed(1)}% Used</span>
                      </div>
                      <div className="w-full bg-slate-700 h-2 rounded-full mt-2 overflow-hidden">
                        <div
                          className={`h-full ${
                            ts.usage_percent > 85
                              ? "bg-rose-500"
                              : ts.usage_percent > 70
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, ts.usage_percent)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 mt-1.5">
                        <span>Used: {formatBytes(ts.used_bytes)}</span>
                        <span>Total: {formatBytes(ts.total_bytes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                  No tablespace data available
                </div>
              )}
            </div>
          </div>

          {/* Bloat & Largest Tables Surveillance */}
          {telemetry && telemetry.largest_tables && telemetry.largest_tables.length > 0 && (
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Table Bloat & Capacity Surveillance
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Table Name</th>
                      <th className="py-2.5 px-3">Total Size</th>
                      <th className="py-2.5 px-3">Data Extents</th>
                      <th className="py-2.5 px-3">Index Overhead</th>
                      <th className="py-2.5 px-3">Row Count</th>
                      <th className="py-2.5 px-3">Bloat Estimate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {telemetry.largest_tables.map((tbl, i) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono text-indigo-300">{tbl.table_name}</td>
                        <td className="py-2.5 px-3">{formatBytes(tbl.total_bytes)}</td>
                        <td className="py-2.5 px-3">{formatBytes(tbl.data_bytes)}</td>
                        <td className="py-2.5 px-3 text-amber-300">{formatBytes(tbl.index_bytes)}</td>
                        <td className="py-2.5 px-3">{tbl.row_count.toLocaleString()}</td>
                        <td className="py-2.5 px-3">
                          {tbl.bloat_ratio && tbl.bloat_ratio > 1.3 ? (
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-medium">
                              {tbl.bloat_ratio.toFixed(2)}x (Vacuum Candidate)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                              Optimal
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Register Database Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-400" />
                Connect Enterprise Database
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDatabase} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Friendly Name</label>
                <input
                  type="text"
                  value={newDb.name}
                  onChange={(e) => setNewDb({ ...newDb, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Database Type</label>
                  <select
                    value={newDb.db_type}
                    onChange={(e) => setNewDb({ ...newDb, db_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  >
                    <option value="POSTGRESQL">PostgreSQL</option>
                    <option value="MYSQL">MySQL / MariaDB</option>
                    <option value="SQL_SERVER">Microsoft SQL Server</option>
                    <option value="ORACLE">Oracle Database</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Port</label>
                  <input
                    type="number"
                    value={newDb.port}
                    onChange={(e) => setNewDb({ ...newDb, port: parseInt(e.target.value) || 5432 })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Host / Endpoint</label>
                <input
                  type="text"
                  value={newDb.host}
                  onChange={(e) => setNewDb({ ...newDb, host: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Database Name</label>
                <input
                  type="text"
                  value={newDb.database_name}
                  onChange={(e) => setNewDb({ ...newDb, database_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Username</label>
                  <input
                    type="text"
                    value={newDb.username}
                    onChange={(e) => setNewDb({ ...newDb, username: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={newDb.password}
                    onChange={(e) => setNewDb({ ...newDb, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-slate-800/80 rounded border border-slate-700 text-[11px] text-slate-400">
                Credentials are encrypted locally with AES-256 before storage in SQLite.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg shadow"
                >
                  Save Connection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default DatabaseIntelligence;
