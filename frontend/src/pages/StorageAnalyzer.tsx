import React, { useState } from "react";
import {
  FolderSearch,
  FileText,
  Folder,
  Copy,
  PieChart as PieIcon,
  Trash2,
  Play,
  CheckCircle2,
  Clock,
  Layers,
  Search
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import { ScanSummary, FileItem, FolderItem, DuplicateGroup, CategoryStat } from "../types";

interface StorageAnalyzerProps {
  scanResult: ScanSummary | null;
  isScanning: boolean;
  onStartScan: (path: string) => void;
  onRequestCleanup: (recommendationId: number, paths: string[], benefit: string) => void;
}

const COLORS = ["#06b6d4", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"];

export const StorageAnalyzer: React.FC<StorageAnalyzerProps> = ({
  scanResult,
  isScanning,
  onStartScan,
  onRequestCleanup
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"files" | "folders" | "duplicates" | "categories" | "temp">("files");
  const [targetPath, setTargetPath] = useState<string>("C:\\Users\\Sumanth");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const filteredFiles = scanResult?.largest_files.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.path.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredFolders = scanResult?.largest_folders.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.path.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header & Scan Launcher */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>
            Advanced Storage Analyzer
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Deep filesystem profiling, duplicate hashing, space hogs, extension breakdown, and temp file detection.
          </p>
        </div>

        {/* Scan Trigger Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="text"
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            disabled={isScanning}
            className="input-text"
            style={{ width: "260px" }}
            placeholder="Scan directory path (e.g. C:\Users\...)"
          />
          <button
            onClick={() => onStartScan(targetPath)}
            disabled={isScanning}
            className="btn btn-primary"
          >
            <Play size={14} fill={isScanning ? "none" : "#ffffff"} />
            <span>{isScanning ? "Scanning..." : "Start Scan"}</span>
          </button>
        </div>
      </div>

      {/* Scan Summary Banner */}
      {scanResult && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          background: "#0b1120",
          border: "1px solid #1e293b",
          padding: "16px",
          borderRadius: "10px"
        }}>
          <div>
            <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Target Directory</span>
            <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#f8fafc", marginTop: "2px", wordBreak: "break-all" }}>
              {scanResult.target_path}
            </p>
          </div>
          <div>
            <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Total Capacity Analyzed</span>
            <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "#38bdf8", marginTop: "2px" }}>
              {scanResult.size_formatted}
            </p>
          </div>
          <div>
            <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Files & Folders Scanned</span>
            <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc", marginTop: "2px" }}>
              {scanResult.total_files.toLocaleString()} files / {scanResult.total_dirs.toLocaleString()} dirs
            </p>
          </div>
          <div>
            <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Scan Duration</span>
            <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "#10b981", marginTop: "2px" }}>
              {scanResult.duration_sec}s
            </p>
          </div>
        </div>
      )}

      {/* Sub Tabs Navigation */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #1e293b", paddingBottom: "12px" }}>
        {[
          { id: "files", label: "Largest Files", icon: FileText, count: scanResult?.largest_files.length },
          { id: "folders", label: "Largest Folders", icon: Folder, count: scanResult?.largest_folders.length },
          { id: "duplicates", label: "Duplicate Files", icon: Copy, count: scanResult?.duplicates.length },
          { id: "categories", label: "File Categories", icon: PieIcon },
          { id: "temp", label: "Temporary Files", icon: Trash2, count: scanResult?.temp_files_count },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className="btn"
              style={{
                background: isActive ? "rgba(37, 99, 235, 0.2)" : "#0f172a",
                color: isActive ? "#38bdf8" : "#94a3b8",
                border: `1px solid ${isActive ? "rgba(37, 99, 235, 0.5)" : "#1e293b"}`,
                fontWeight: isActive ? 600 : 500
              }}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span style={{ fontSize: "0.7rem", opacity: 0.8, marginLeft: "4px" }}>
                  ({tab.count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search Filter for Tables */}
      {(activeSubTab === "files" || activeSubTab === "folders") && (
        <div style={{ position: "relative", width: "320px" }}>
          <Search size={15} color="#64748b" style={{ position: "absolute", left: "10px", top: "11px" }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-text"
            style={{ paddingLeft: "32px" }}
            placeholder={`Search ${activeSubTab}...`}
          />
        </div>
      )}

      {/* VIEW 1: LARGEST FILES */}
      {activeSubTab === "files" && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Category</th>
                <th>File Size</th>
                <th>Modified Date</th>
                <th>Absolute Path</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "#64748b", padding: "30px" }}>
                    No files found matching criteria. Run a scan to discover largest files.
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: "#f8fafc" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <FileText size={15} color="#38bdf8" />
                        <span>{file.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-cyan" style={{ fontSize: "0.7rem" }}>
                        {file.category}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: "#38bdf8" }}>
                      {file.size_formatted}
                    </td>
                    <td style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                      {file.modified_time}
                    </td>
                    <td style={{ color: "#64748b", fontFamily: "monospace", fontSize: "0.75rem" }}>
                      {file.path}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW 2: LARGEST FOLDERS */}
      {activeSubTab === "folders" && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Folder Name</th>
                <th>Total Consumption</th>
                <th>Contained Files</th>
                <th>Directory Path</th>
              </tr>
            </thead>
            <tbody>
              {filteredFolders.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", color: "#64748b", padding: "30px" }}>
                    No folder results available.
                  </td>
                </tr>
              ) : (
                filteredFolders.map((folder, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: "#f8fafc" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Folder size={15} color="#f59e0b" />
                        <span>{folder.name}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, color: "#f59e0b" }}>
                      {folder.size_formatted}
                    </td>
                    <td style={{ color: "#cbd5e1" }}>
                      {folder.file_count.toLocaleString()} files
                    </td>
                    <td style={{ color: "#64748b", fontFamily: "monospace", fontSize: "0.75rem" }}>
                      {folder.path}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW 3: DUPLICATE FILES */}
      {activeSubTab === "duplicates" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {(!scanResult?.duplicates || scanResult.duplicates.length === 0) ? (
            <div className="card" style={{ textAlign: "center", padding: "40px" }}>
              <CheckCircle2 size={36} color="#10b981" style={{ margin: "0 auto 12px auto" }} />
              <h3 style={{ color: "#f8fafc" }}>No Redundant Duplicates Detected</h3>
              <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "4px" }}>
                Files scanned in this directory contain unique cryptographic signatures.
              </p>
            </div>
          ) : (
            scanResult.duplicates.map((group, idx) => (
              <div key={idx} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className="badge badge-high">
                        {group.count} Identical Copies
                      </span>
                      <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#f8fafc" }}>
                        Single File Size: {group.size_formatted}
                      </span>
                      <span style={{ fontSize: "0.8rem", color: "#f87171", fontWeight: 600 }}>
                        Wasted Space: {((group.wasted_bytes) / (1024 ** 2)).toFixed(2)} MB
                      </span>
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b", fontFamily: "monospace" }}>
                      SHA-256: {group.file_hash}
                    </span>
                  </div>

                  <button
                    onClick={() => onRequestCleanup(2, group.files.slice(1).map(f => f.path), `${((group.wasted_bytes) / (1024 ** 2)).toFixed(2)} MB`)}
                    className="btn btn-danger"
                    style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                  >
                    <Trash2 size={13} />
                    <span>Purge Copies</span>
                  </button>
                </div>

                <div style={{ background: "#070b14", borderRadius: "6px", border: "1px solid #1e293b", padding: "8px 12px" }}>
                  {group.files.map((file, fIdx) => (
                    <div key={fIdx} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.78rem",
                      padding: "4px 0",
                      borderBottom: fIdx < group.files.length - 1 ? "1px solid #111b2e" : "none"
                    }}>
                      <span style={{ color: fIdx === 0 ? "#34d399" : "#cbd5e1", fontFamily: "monospace" }}>
                        {fIdx === 0 ? "[Original Candidate] " : "[Duplicate] "} {file.path}
                      </span>
                      <span style={{ color: "#64748b" }}>{file.modified_time}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* VIEW 4: CATEGORY ANALYSIS */}
      {activeSubTab === "categories" && (
        <div className="grid-cols-2">
          {/* Pie Chart */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: "16px" }}>
              <PieIcon size={18} color="#06b6d4" />
              Category Storage Distribution
            </h3>
            <div style={{ height: "260px", width: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={scanResult?.categories || []}
                    dataKey="total_bytes"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(entry: any) => `${entry.category || entry.name} (${entry.percent_of_scanned || 0}%)`}
                  >
                    {(scanResult?.categories || []).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0b1120", borderColor: "#1e293b", color: "#f8fafc", borderRadius: "6px" }}
                    formatter={(val: any) => [`${(val / (1024 ** 2)).toFixed(2)} MB`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: "16px" }}>
              File Types & Extensions
            </h3>
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Volume</th>
                    <th>Files</th>
                    <th>Extensions</th>
                  </tr>
                </thead>
                <tbody>
                  {(scanResult?.categories || []).map((cat, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, color: "#f8fafc" }}>
                        {cat.category}
                      </td>
                      <td style={{ fontWeight: 700, color: "#38bdf8" }}>
                        {cat.size_formatted}
                      </td>
                      <td>{cat.file_count.toLocaleString()}</td>
                      <td style={{ color: "#64748b", fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {cat.extension_list.join(", ") || "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 5: TEMPORARY FILES */}
      {activeSubTab === "temp" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 className="card-title">
                <Trash2 size={18} color="#f87171" />
                Temporary & Obsolete File Candidates
              </h3>
              <p className="card-subtitle">
                Identified {scanResult?.temp_files_count || 0} temporary/cache files ({((scanResult?.temp_files_bytes || 0) / (1024 ** 2)).toFixed(2)} MB)
              </p>
            </div>
            {scanResult && scanResult.temp_files_count > 0 && (
              <button
                onClick={() => onRequestCleanup(1, scanResult.temp_files_list.map(f => f.path), `${((scanResult.temp_files_bytes) / (1024 ** 2)).toFixed(2)} MB`)}
                className="btn btn-danger"
              >
                <Trash2 size={14} />
                <span>Safely Clean Temp Files</span>
              </button>
            )}
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Size</th>
                  <th>Type</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {(!scanResult?.temp_files_list || scanResult.temp_files_list.length === 0) ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "#64748b", padding: "30px" }}>
                      No temporary clutter found in current scan scope.
                    </td>
                  </tr>
                ) : (
                  scanResult.temp_files_list.map((file, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, color: "#f8fafc" }}>{file.name}</td>
                      <td style={{ fontWeight: 700, color: "#f87171" }}>{file.size_formatted}</td>
                      <td><span className="badge badge-low">{file.extension || "temp"}</span></td>
                      <td style={{ color: "#64748b", fontFamily: "monospace", fontSize: "0.75rem" }}>{file.path}</td>
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
