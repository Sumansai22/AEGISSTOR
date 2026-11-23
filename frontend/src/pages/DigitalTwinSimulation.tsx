import React, { useState } from "react";
import {
  Layers,
  Sparkles,
  TrendingUp,
  Sliders,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Play
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
import { SimulationResult, DriveInfo } from "../types";

interface DigitalTwinProps {
  drives: DriveInfo[];
  currentSimulation: SimulationResult | null;
  onRunSimulation: (params: {
    drive_name: string;
    monthly_growth_rate_percent?: number;
    removed_unnecessary_files_gb?: number;
    capacity_expansion_gb?: number;
    continuation_days?: number;
  }) => void;
  isRunning: boolean;
}

export const DigitalTwinSimulation: React.FC<DigitalTwinProps> = ({
  drives,
  currentSimulation,
  onRunSimulation,
  isRunning
}) => {
  const [selectedDrive, setSelectedDrive] = useState<string>(drives[0]?.device || "C:");
  const [monthlyGrowth, setMonthlyGrowth] = useState<number>(5.0);
  const [removedGb, setRemovedGb] = useState<number>(0.0);
  const [expansionGb, setExpansionGb] = useState<number>(0.0);
  const [horizonDays, setHorizonDays] = useState<number>(90);

  const handlePrebuiltScenario = (type: "A" | "B" | "C" | "D") => {
    if (type === "A") {
      setMonthlyGrowth(10.0);
      setRemovedGb(0);
      setExpansionGb(0);
      setHorizonDays(90);
      onRunSimulation({
        drive_name: selectedDrive,
        monthly_growth_rate_percent: 10.0,
        removed_unnecessary_files_gb: 0,
        capacity_expansion_gb: 0,
        continuation_days: 90
      });
    } else if (type === "B") {
      setMonthlyGrowth(2.0);
      setRemovedGb(20.0);
      setExpansionGb(0);
      setHorizonDays(90);
      onRunSimulation({
        drive_name: selectedDrive,
        monthly_growth_rate_percent: 2.0,
        removed_unnecessary_files_gb: 20.0,
        capacity_expansion_gb: 0,
        continuation_days: 90
      });
    } else if (type === "C") {
      setMonthlyGrowth(2.0);
      setRemovedGb(0);
      setExpansionGb(100.0);
      setHorizonDays(90);
      onRunSimulation({
        drive_name: selectedDrive,
        monthly_growth_rate_percent: 2.0,
        removed_unnecessary_files_gb: 0,
        capacity_expansion_gb: 100.0,
        continuation_days: 90
      });
    } else if (type === "D") {
      setMonthlyGrowth(1.0);
      setRemovedGb(0);
      setExpansionGb(0);
      setHorizonDays(90);
      onRunSimulation({
        drive_name: selectedDrive,
        monthly_growth_rate_percent: 1.0,
        removed_unnecessary_files_gb: 0,
        capacity_expansion_gb: 0,
        continuation_days: 90
      });
    }
  };

  const handleCustomRun = () => {
    onRunSimulation({
      drive_name: selectedDrive,
      monthly_growth_rate_percent: monthlyGrowth,
      removed_unnecessary_files_gb: removedGb,
      capacity_expansion_gb: expansionGb,
      continuation_days: horizonDays
    });
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>
            Storage Digital Twin Simulator
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Evaluate what-if growth, file purging, and hardware expansion scenarios without altering actual system disks.
          </p>
        </div>

        <div style={{
          background: "rgba(6, 182, 212, 0.12)",
          border: "1px solid rgba(6, 182, 212, 0.3)",
          padding: "6px 14px",
          borderRadius: "20px",
          fontSize: "0.75rem",
          fontWeight: 700,
          color: "#38bdf8",
          letterSpacing: "0.5px"
        }}>
          SIMULATION ENVIRONMENT
        </div>
      </div>

      {/* Prebuilt Scenarios Selector */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: "14px" }}>
          <Sparkles size={18} color="#06b6d4" />
          Prebuilt Experimental Scenarios
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
          <button
            onClick={() => handlePrebuiltScenario("A")}
            className="btn"
            style={{ textAlign: "left", padding: "12px", background: "#070b14", border: "1px solid #1e293b", display: "flex", flexDirection: "column", gap: "4px" }}
          >
            <strong style={{ color: "#38bdf8", fontSize: "0.85rem" }}>Scenario A: +10% Monthly Surge</strong>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Simulates heavy data ingestion over 90 days.</span>
          </button>

          <button
            onClick={() => handlePrebuiltScenario("B")}
            className="btn"
            style={{ textAlign: "left", padding: "12px", background: "#070b14", border: "1px solid #1e293b", display: "flex", flexDirection: "column", gap: "4px" }}
          >
            <strong style={{ color: "#10b981", fontSize: "0.85rem" }}>Scenario B: 20 GB File Removal</strong>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Simulates purging stale media or temp caches.</span>
          </button>

          <button
            onClick={() => handlePrebuiltScenario("C")}
            className="btn"
            style={{ textAlign: "left", padding: "12px", background: "#070b14", border: "1px solid #1e293b", display: "flex", flexDirection: "column", gap: "4px" }}
          >
            <strong style={{ color: "#8b5cf6", fontSize: "0.85rem" }}>Scenario C: +100 GB Expansion</strong>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Simulates volume partition enlargement.</span>
          </button>

          <button
            onClick={() => handlePrebuiltScenario("D")}
            className="btn"
            style={{ textAlign: "left", padding: "12px", background: "#070b14", border: "1px solid #1e293b", display: "flex", flexDirection: "column", gap: "4px" }}
          >
            <strong style={{ color: "#f59e0b", fontSize: "0.85rem" }}>Scenario D: Baseline 90-Day Run</strong>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Projects current trajectory unchanged.</span>
          </button>
        </div>
      </div>

      {/* Custom Tuner & Before-and-After Comparison */}
      <div className="grid-cols-2">
        {/* Tuner Controls */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: "16px" }}>
            <Sliders size={18} color="#38bdf8" />
            Custom Parameter Tuning
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "0.78rem", color: "#94a3b8", display: "block", marginBottom: "6px" }}>
                Target Digital Twin Drive:
              </label>
              <select
                value={selectedDrive}
                onChange={(e) => setSelectedDrive(e.target.value)}
                className="select-input"
              >
                {drives.map(d => (
                  <option key={d.device} value={d.device}>
                    {d.device} ({d.mountpoint}) - {(d.total_bytes / (1024 ** 3)).toFixed(1)} GB Total
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "4px" }}>
                <span style={{ color: "#cbd5e1" }}>Monthly Consumption Growth Rate:</span>
                <strong style={{ color: "#38bdf8" }}>{monthlyGrowth}% / month</strong>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={monthlyGrowth}
                onChange={(e) => setMonthlyGrowth(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#06b6d4" }}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "4px" }}>
                <span style={{ color: "#cbd5e1" }}>Purge / File Removal Simulation:</span>
                <strong style={{ color: "#10b981" }}>{removedGb} GB</strong>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={removedGb}
                onChange={(e) => setRemovedGb(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#10b981" }}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "4px" }}>
                <span style={{ color: "#cbd5e1" }}>Hardware Capacity Expansion:</span>
                <strong style={{ color: "#8b5cf6" }}>+{expansionGb} GB</strong>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                step="25"
                value={expansionGb}
                onChange={(e) => setExpansionGb(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#8b5cf6" }}
              />
            </div>

            <button
              onClick={handleCustomRun}
              disabled={isRunning}
              className="btn btn-primary"
              style={{ marginTop: "8px" }}
            >
              <Play size={14} />
              <span>{isRunning ? "Simulating..." : "Execute Simulation"}</span>
            </button>
          </div>
        </div>

        {/* Before and After Comparison Card */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: "16px" }}>
            <Layers size={18} color="#10b981" />
            Digital Twin Impact Analysis
          </h3>

          {currentSimulation ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                background: "#070b14",
                padding: "16px",
                borderRadius: "8px",
                border: "1px solid #1e293b"
              }}>
                <div>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Current Utilization</span>
                  <p style={{ fontSize: "1.45rem", fontWeight: 700, color: "#cbd5e1", marginTop: "2px" }}>
                    {currentSimulation.current_usage_percent.toFixed(1)}%
                  </p>
                  <span className={`badge badge-${currentSimulation.current_risk.toLowerCase()}`}>
                    {currentSimulation.current_risk} RISK
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Simulated Projected Utilization</span>
                  <p style={{ fontSize: "1.45rem", fontWeight: 700, color: "#38bdf8", marginTop: "2px" }}>
                    {currentSimulation.projected_usage_percent.toFixed(1)}%
                  </p>
                  <span className={`badge badge-${currentSimulation.projected_risk.toLowerCase()}`}>
                    {currentSimulation.projected_risk} RISK
                  </span>
                </div>
              </div>

              <div style={{ background: "#070b14", padding: "14px", borderRadius: "8px", border: "1px solid #1e293b" }}>
                <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Estimated Exhaustion Date</span>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, color: currentSimulation.days_to_exhaustion && currentSimulation.days_to_exhaustion < 30 ? "#f87171" : "#10b981", marginTop: "4px" }}>
                  {currentSimulation.estimated_exhaustion_date}
                </p>
                <p style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "6px" }}>
                  {currentSimulation.risk_change_summary}
                </p>
              </div>

              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Simulation Insights:</span>
                <ul style={{ fontSize: "0.8rem", color: "#cbd5e1", marginTop: "6px", marginLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {currentSimulation.simulation_notes.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              <p>Select a scenario above or adjust sliders to run the Digital Twin simulation.</p>
            </div>
          )}
        </div>
      </div>

      {/* Timeline Projection Chart */}
      {currentSimulation && currentSimulation.timeline_projection.length > 0 && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: "16px" }}>
            <TrendingUp size={18} color="#06b6d4" />
            90-Day Digital Twin Capacity Trajectory
          </h3>

          <div style={{ height: "260px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={currentSimulation.timeline_projection} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" />
                <YAxis stroke="#64748b" tickFormatter={(v) => `${v} GB`} />
                <Tooltip contentStyle={{ backgroundColor: "#0b1120", borderColor: "#1e293b", color: "#f8fafc", borderRadius: "6px" }} />
                <Legend verticalAlign="top" height={36} />
                <Area type="monotone" dataKey="projected_used_gb" name="Simulated Used (GB)" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#simGrad)" />
                <Area type="monotone" dataKey="projected_free_gb" name="Simulated Free Headroom (GB)" stroke="#10b981" fillOpacity={0.2} fill="#10b981" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
