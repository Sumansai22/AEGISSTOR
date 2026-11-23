import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Cpu,
  Calendar,
  AlertOctagon,
  Clock,
  ShieldCheck,
  Zap,
  BarChart2,
  RefreshCw
} from "lucide-react";
import { fetchForecast, fetchMLBenchmarks, fetchDrives } from "../services/api";
import { ForecastResponse, DriveInfo } from "../types";
import { formatBytes } from "../utils/helpers";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export const CapacityAnalytics: React.FC = () => {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<string>("C:");
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const loadData = async (driveLetter: string) => {
    setLoading(true);
    try {
      const driveList = await fetchDrives();
      setDrives(driveList);
      const fc = await fetchForecast(driveLetter);
      setForecast(fc);

      try {
        const bm = await fetchMLBenchmarks(driveLetter);
        setBenchmarks(bm.benchmarks || []);
      } catch {
        setBenchmarks([]);
      }
    } catch (err: any) {
      console.warn("Analytics load error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedDrive);
  }, [selectedDrive]);

  // Transform timeline points for Recharts
  const chartData = forecast?.forecast_points?.map((p) => ({
    name: p.label,
    predictedGb: (p.predicted_used_bytes / (1024 ** 3)).toFixed(1),
    upperGb: (p.confidence_upper_bytes / (1024 ** 3)).toFixed(1),
    lowerGb: (p.confidence_lower_bytes / (1024 ** 3)).toFixed(1),
    percent: p.predicted_usage_percent.toFixed(1)
  })) || [];

  const runway = forecast?.runway;

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-cyan-400" />
            Predictive Capacity Analytics & Runway
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Multi-model chronological cross-validation, threshold exhaustion projections, and model benchmark comparisons.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedDrive}
            onChange={(e) => setSelectedDrive(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg"
          >
            {drives.map((d) => (
              <option key={d.mountpoint} value={d.mountpoint}>
                {d.mountpoint} ({d.hardware_name || d.device})
              </option>
            ))}
          </select>
          <button
            onClick={() => loadData(selectedDrive)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Recalculate
          </button>
        </div>
      </div>

      {/* Runway Milestone Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <span className="text-xs text-slate-400 font-medium">Daily Growth Velocity</span>
          <p className="text-2xl font-bold text-cyan-400 mt-1">
            {runway ? `${runway.daily_growth_gb > 0 ? "+" : ""}${runway.daily_growth_gb.toFixed(2)} GB` : "--"}
          </p>
          <span className="text-[11px] text-slate-500">Per 24 hours</span>
        </div>
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <span className="text-xs text-slate-400 font-medium">80% Threshold Runway</span>
          <p className="text-2xl font-bold text-amber-400 mt-1">
            {runway?.hours_to_80_percent !== null && runway?.hours_to_80_percent !== undefined
              ? `${(runway.hours_to_80_percent / 24).toFixed(0)} Days`
              : "Safe (>90d)"}
          </p>
          <span className="text-[11px] text-slate-500">Early warning horizon</span>
        </div>
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <span className="text-xs text-slate-400 font-medium">90% Threshold Runway</span>
          <p className="text-2xl font-bold text-orange-400 mt-1">
            {runway?.hours_to_90_percent !== null && runway?.hours_to_90_percent !== undefined
              ? `${(runway.hours_to_90_percent / 24).toFixed(0)} Days`
              : "Safe (>90d)"}
          </p>
          <span className="text-[11px] text-slate-500">Critical warning horizon</span>
        </div>
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <span className="text-xs text-slate-400 font-medium">95% Risk Threshold</span>
          <p className="text-2xl font-bold text-rose-400 mt-1">
            {runway?.hours_to_95_percent !== null && runway?.hours_to_95_percent !== undefined
              ? `${(runway.hours_to_95_percent / 24).toFixed(0)} Days`
              : "Safe (>90d)"}
          </p>
          <span className="text-[11px] text-slate-500">Emergency buffer margin</span>
        </div>
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl col-span-2 sm:col-span-1">
          <span className="text-xs text-slate-400 font-medium">100% Exhaustion</span>
          <p className="text-2xl font-bold text-red-500 mt-1">
            {runway?.estimated_exhaustion_days !== null && runway?.estimated_exhaustion_days !== undefined
              ? `${runway.estimated_exhaustion_days} Days`
              : "No Risk"}
          </p>
          <span className="text-[11px] text-slate-500">Complete drive fullness</span>
        </div>
      </div>

      {/* Projection Chart */}
      <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-cyan-400" />
            Multi-Horizon Capacity Forecast with 95% Confidence Interval
          </h2>
          <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">
            Model: <strong className="text-cyan-300">{forecast?.metrics?.model_name || "Auto-Selected"}</strong>
          </span>
        </div>
        {chartData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="capacityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} unit=" GB" />
                <Tooltip
                  formatter={(val: any) => [`${val} GB`, "Projected Used Storage"]}
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px" }}
                />
                <Area
                  type="monotone"
                  dataKey="predictedGb"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#capacityGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-72 flex items-center justify-center text-slate-500 text-sm">
            Insufficient telemetry history collected yet.
          </div>
        )}
      </div>

      {/* Model Benchmark Performance Matrix */}
      <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-cyan-400" />
          Model Evaluation & Chronological Benchmark Matrix
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Algorithm</th>
                <th className="py-2.5 px-3">MAE (Mean Absolute Error)</th>
                <th className="py-2.5 px-3">RMSE (Root Mean Square)</th>
                <th className="py-2.5 px-3">MAPE (%)</th>
                <th className="py-2.5 px-3">R² Score</th>
                <th className="py-2.5 px-3">Active Selection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {benchmarks.length > 0 ? (
                benchmarks.map((bm, i) => (
                  <tr key={i} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-semibold text-white">{bm.model_name}</td>
                    <td className="py-2.5 px-3 font-mono text-cyan-300">{bm.mae_gb.toFixed(4)} GB</td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">{bm.rmse_gb.toFixed(4)} GB</td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">{bm.mape_percent.toFixed(2)}%</td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400">{bm.r2_score.toFixed(4)}</td>
                    <td className="py-2.5 px-3">
                      {bm.selected_for_forecast ? (
                        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold flex items-center gap-1 w-fit">
                          <Zap className="w-3 h-3" /> Selected Production Model
                        </span>
                      ) : (
                        <span className="text-slate-500">Evaluated Candidate</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    Collecting historical data points for automated algorithm tournament...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default CapacityAnalytics;
