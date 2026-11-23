import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  BrainCircuit,
  AlertCircle,
  Clock,
  Sparkles,
  BarChart2,
  CheckCircle2,
  ShieldAlert,
  Zap,
  Layers,
  ArrowRight,
  Database,
  Cloud,
  HardDrive,
  RefreshCw,
  Info
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from "recharts";
import { fetchAdvancedForecast, triggerSampleCollection } from "../services/api";

export const MLForecasting: React.FC = () => {
  const [selectedResource, setSelectedResource] = useState<string>("C:");
  const [forecastData, setForecastData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSampling, setIsSampling] = useState<boolean>(false);
  const [sampleSuccessMsg, setSampleSuccessMsg] = useState<string | null>(null);

  const loadForecast = async (resId: string = selectedResource) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await fetchAdvancedForecast(resId);
      setForecastData(data);
    } catch (e: any) {
      console.error("Error loading forecast:", e);
      setErrorMsg(e.message || "Failed to load forecast data from backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForecast(selectedResource);
  }, [selectedResource]);

  const handleSampleAndRetrain = async () => {
    if (isSampling) return;
    setIsSampling(true);
    setSampleSuccessMsg(null);
    try {
      await triggerSampleCollection();
      setSampleSuccessMsg(
        `Observation recorded successfully across local, cloud, and database storage. Retrained tournament models.`
      );
      await loadForecast(selectedResource);
      setTimeout(() => setSampleSuccessMsg(null), 6000);
    } catch (e: any) {
      console.error(e);
      alert(`Sampling error: ${e.message || e}`);
    } finally {
      setIsSampling(false);
    }
  };

  // Build unified continuous timeline: historical points + bridge + future projections
  const historicalPts = forecastData?.historical_points || [];
  const projections = forecastData?.projections || [];

  const timelineData: any[] = [];

  // 1. Historical Actual Observations
  historicalPts.forEach((pt: any) => {
    timelineData.push({
      dateLabel: pt.date || pt.timestamp?.split(" ")[0] || "History",
      fullTime: pt.timestamp,
      actualGb: pt.used_gb,
      predictedGb: null,
      confidenceLowerGb: null,
      confidenceUpperGb: null,
      percent: pt.usage_percent,
      type: "HISTORICAL"
    });
  });

  // 2. Current bridge anchor point
  if (forecastData && timelineData.length > 0) {
    const lastHist = timelineData[timelineData.length - 1];
    lastHist.predictedGb = lastHist.actualGb;
    lastHist.confidenceLowerGb = lastHist.actualGb;
    lastHist.confidenceUpperGb = lastHist.actualGb;
  } else if (forecastData && projections.length > 0) {
    timelineData.push({
      dateLabel: "Today (Current)",
      fullTime: "Current Live Reading",
      actualGb: forecastData.current_used_gb,
      predictedGb: forecastData.current_used_gb,
      confidenceLowerGb: forecastData.current_used_gb,
      confidenceUpperGb: forecastData.current_used_gb,
      percent: forecastData.current_usage_percent,
      type: "CURRENT"
    });
  }

  // 3. Multi-Horizon AI Projections (1d, 7d, 14d, 30d, 60d, 90d)
  projections.forEach((p: any) => {
    timelineData.push({
      dateLabel: `${p.label} (${p.target_date})`,
      targetDate: p.target_date,
      actualGb: null,
      predictedGb: p.predicted_used_gb,
      confidenceLowerGb: p.confidence_lower_gb,
      confidenceUpperGb: p.confidence_upper_gb,
      percent: p.predicted_usage_percent,
      type: "FORECAST"
    });
  });

  // Custom Rich Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: "#070b14",
          border: "1px solid #334155",
          borderRadius: "8px",
          padding: "12px 16px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          minWidth: "220px"
        }}>
          <p style={{ margin: "0 0 8px 0", fontSize: "0.82rem", fontWeight: 700, color: "#f8fafc" }}>
            {data.dateLabel}
          </p>
          {data.actualGb !== null && data.actualGb !== undefined && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "0.78rem", color: "#34d399", marginBottom: "4px" }}>
              <span>Actual Used:</span>
              <strong>{data.actualGb} GB</strong>
            </div>
          )}
          {data.predictedGb !== null && data.predictedGb !== undefined && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "0.78rem", color: "#38bdf8", marginBottom: "4px" }}>
              <span>AI Point Forecast:</span>
              <strong>{data.predictedGb} GB</strong>
            </div>
          )}
          {data.confidenceLowerGb !== null && data.confidenceUpperGb !== null && data.type === "FORECAST" && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "0.74rem", color: "#94a3b8", marginBottom: "4px" }}>
              <span>95% Confidence Corridor:</span>
              <span>[{data.confidenceLowerGb} GB – {data.confidenceUpperGb} GB]</span>
            </div>
          )}
          {data.percent !== undefined && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "0.74rem", color: "#cbd5e1", marginTop: "6px", borderTop: "1px solid #1e293b", paddingTop: "4px" }}>
              <span>Capacity Utilization:</span>
              <strong>{data.percent}%</strong>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const summary = forecastData?.summary_cards || {};
  const availableResources = forecastData?.available_resources || [
    { id: "C:", name: "Local Volume (C:) - NVMe/SSD", type: "LOCAL_DISK" },
    { id: "aegisstor-mon-425178888081-ap-southeast-2-an", name: "AWS S3 Cloud Storage", type: "AWS_S3" },
    { id: "internal_db", name: "Enterprise Database (SQLite Store)", type: "DATABASE" }
  ];

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "14px" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>
            Enterprise AI Capacity Forecasting
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Multi-model algorithm tournament across 1d, 7d, 14d, 30d, 60d, and 90d horizons with uncertainty corridors.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Multi-Resource Selector */}
          <select
            value={selectedResource}
            onChange={(e) => setSelectedResource(e.target.value)}
            style={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              color: "#f8fafc",
              padding: "8px 14px",
              borderRadius: "6px",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            {availableResources.map((res: any) => (
              <option key={res.id} value={res.id}>
                {res.type === "AWS_S3" ? "☁️ " : res.type === "DATABASE" ? "🗄️ " : "💾 "}
                {res.name}
              </option>
            ))}
          </select>

          {/* Record Sample & Retrain Button */}
          <button
            onClick={handleSampleAndRetrain}
            disabled={isSampling}
            className="btn btn-cyan"
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px" }}
            title="Records verified telemetry sample and re-evaluates tournament models"
          >
            {isSampling ? (
              <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <Zap size={14} />
            )}
            <span>{isSampling ? "Sampling & Retraining..." : "Record Sample & Retrain"}</span>
          </button>
        </div>
      </div>

      {/* Success Banner */}
      {sampleSuccessMsg && (
        <div style={{
          padding: "12px 18px",
          borderRadius: "8px",
          background: "rgba(16, 185, 129, 0.12)",
          border: "1px solid rgba(16, 185, 129, 0.35)",
          color: "#34d399",
          fontSize: "0.82rem",
          display: "flex",
          alignItems: "center",
          gap: "10px"
        }}>
          <CheckCircle2 size={16} color="#34d399" />
          <span>{sampleSuccessMsg}</span>
        </div>
      )}

      {/* Error State Banner */}
      {errorMsg && (
        <div style={{
          padding: "16px 20px",
          borderRadius: "8px",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.35)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "14px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertCircle size={20} color="#f87171" />
            <div>
              <strong style={{ color: "#f87171", fontSize: "0.88rem" }}>Forecasting Service Offline or Error</strong>
              <p style={{ margin: "2px 0 0 0", color: "#cbd5e1", fontSize: "0.8rem" }}>{errorMsg}</p>
            </div>
          </div>
          <button
            onClick={() => loadForecast(selectedResource)}
            className="btn"
            style={{ padding: "6px 14px", fontSize: "0.8rem", background: "#1e293b" }}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* 5 Summary Cards */}
      {forecastData && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px" }}>
          {/* Card 1: Current Storage */}
          <div className="card" style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>Current Storage Usage</span>
              <div style={{ background: "rgba(56, 189, 248, 0.12)", padding: "6px", borderRadius: "6px" }}>
                <HardDrive size={16} color="#38bdf8" />
              </div>
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f8fafc" }}>
              {summary.current_used_gb ?? forecastData.current_used_gb} GB
            </div>
            <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>
              {summary.current_usage_percent ?? forecastData.current_usage_percent}% of {summary.total_capacity_gb ?? forecastData.total_capacity_gb} GB capacity
            </div>
          </div>

          {/* Card 2: Predicted 30-Day Usage */}
          <div className="card" style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>Predicted 30-Day Usage</span>
              <div style={{ background: "rgba(168, 85, 247, 0.12)", padding: "6px", borderRadius: "6px" }}>
                <Clock size={16} color="#a855f7" />
              </div>
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#a855f7" }}>
              {summary.predicted_30d_gb ?? "--"} GB
            </div>
            <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>
              Projected {summary.predicted_30d_percent ?? "--"}% utilization at T+30d
            </div>
          </div>

          {/* Card 3: Predicted 90-Day Usage */}
          <div className="card" style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>Predicted 90-Day Usage</span>
              <div style={{ background: "rgba(236, 72, 153, 0.12)", padding: "6px", borderRadius: "6px" }}>
                <TrendingUp size={16} color="#ec4899" />
              </div>
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#ec4899" }}>
              {summary.predicted_90d_gb ?? "--"} GB
            </div>
            <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>
              Projected {summary.predicted_90d_percent ?? "--"}% utilization at T+90d
            </div>
          </div>

          {/* Card 4: Capacity Runway */}
          <div className="card" style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>Estimated Runway</span>
              <div style={{ background: "rgba(245, 158, 11, 0.12)", padding: "6px", borderRadius: "6px" }}>
                <ShieldAlert size={16} color="#f59e0b" />
              </div>
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fbbf24" }}>
              {summary.estimated_runway || "Safe & Sustainable"}
            </div>
            <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>
              Velocity: {forecastData.daily_growth_gb > 0 ? `+${forecastData.daily_growth_gb} GB/day` : "0.00 GB/day (Stable)"}
            </div>
          </div>

          {/* Card 5: Best AI Model */}
          <div className="card" style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>Best-Performing Model</span>
              <div style={{ background: "rgba(16, 185, 129, 0.12)", padding: "6px", borderRadius: "6px" }}>
                <BrainCircuit size={16} color="#34d399" />
              </div>
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#34d399" }}>
              {forecastData.selected_model?.replace(/_/g, " ")}
            </div>
            <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>
              {forecastData.model_benchmarks?.[forecastData.selected_model]?.model_type || "ML Model"}
              {summary.best_mae_gb !== undefined && ` | MAE: ${summary.best_mae_gb} GB`}
            </div>
          </div>
        </div>
      )}

      {/* Model Selection & Cold Start Banner */}
      {forecastData && (
        <div style={{
          padding: "16px 20px",
          borderRadius: "10px",
          backgroundColor: !forecastData.is_cold_start ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)",
          border: `1px solid ${!forecastData.is_cold_start ? "rgba(16, 185, 129, 0.25)" : "rgba(245, 158, 11, 0.25)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {!forecastData.is_cold_start ? (
              <CheckCircle2 size={24} color="#34d399" />
            ) : (
              <AlertCircle size={24} color="#fbbf24" />
            )}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc" }}>
                  Selected Model: <span style={{ color: "#38bdf8" }}>{forecastData.selected_model?.replace(/_/g, " ")}</span>
                </span>
                <span style={{
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  backgroundColor: !forecastData.is_cold_start ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                  color: !forecastData.is_cold_start ? "#a7f3d0" : "#fef08a",
                  fontWeight: 600
                }}>
                  {forecastData.status}
                </span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "3px" }}>
                {forecastData.explanation}
              </p>
            </div>
          </div>

          <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
            Telemetry Points: <strong style={{ color: "#f8fafc" }}>{forecastData.observations_count}</strong> | Source: <strong style={{ color: "#f8fafc" }}>{forecastData.resource_type}</strong>
          </div>
        </div>
      )}

      {/* Capacity Runway Cards (70%, 80%, 90%, 95%, 100%) */}
      {forecastData?.capacity_runway && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
              Capacity Runway Exhaustion Countdown
            </h3>
            <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
              Daily Velocity: <strong style={{ color: "#f8fafc" }}>{forecastData.daily_growth_gb > 0 ? `+${forecastData.daily_growth_gb} GB/day` : "0.00 GB/day (Stable)"}</strong>
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
            {[70, 80, 90, 95, 100].map((t) => {
              const days = forecastData.capacity_runway[`days_to_${t}_percent`];
              const date = forecastData.capacity_runway[`date_${t}_percent`];
              const status = forecastData.capacity_runway[`status_${t}`];
              const isExceeded = status === "EXCEEDED";
              const isStable = status === "STABLE";

              return (
                <div
                  key={t}
                  style={{
                    backgroundColor: "#0f172a",
                    border: `1px solid ${isExceeded ? "rgba(239, 68, 68, 0.3)" : t >= 90 ? "rgba(245, 158, 11, 0.3)" : "#1e293b"}`,
                    borderRadius: "8px",
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>{t}% Capacity</span>
                    <span style={{
                      fontSize: "0.68rem",
                      padding: "1px 6px",
                      borderRadius: "10px",
                      background: isExceeded ? "rgba(239, 68, 68, 0.2)" : isStable ? "rgba(16, 185, 129, 0.2)" : "rgba(56, 189, 248, 0.2)",
                      color: isExceeded ? "#f87171" : isStable ? "#34d399" : "#38bdf8",
                      fontWeight: 700
                    }}>
                      {status}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: "1.35rem", fontWeight: 700, color: isExceeded ? "#f87171" : isStable ? "#34d399" : "#f8fafc" }}>
                      {days !== null && days !== undefined ? `${days} Days` : "Safe"}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
                      {date}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Multi-Horizon Unified Timeline Chart */}
      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 className="card-title">
              <TrendingUp size={18} color="#38bdf8" />
              Unified Storage Capacity Timeline & AI Uncertainty Bounds
            </h3>
            <p className="card-subtitle">
              Continuous visualization linking chronological observed telemetry (solid emerald line) to multi-horizon predictions (dashed cyan line) with 95% confidence corridor.
            </p>
          </div>
          {forecastData?.observations_count !== undefined && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "0.76rem", color: "#94a3b8" }}>
              <span>Historical Points: <strong style={{ color: "#34d399" }}>{historicalPts.length}</strong></span>
              <span>Projections: <strong style={{ color: "#38bdf8" }}>{projections.length} Horizons</strong></span>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ height: "340px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", color: "#94a3b8" }}>
            <RefreshCw size={28} color="#38bdf8" style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: "0.85rem" }}>Evaluating Tournament Models & Generating Predictions...</span>
          </div>
        ) : timelineData.length === 0 ? (
          <div style={{ height: "300px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", color: "#64748b" }}>
            <AlertCircle size={32} color="#f59e0b" />
            <p style={{ margin: 0, fontSize: "0.88rem", color: "#cbd5e1" }}>No historical telemetry recorded for {selectedResource} yet.</p>
            <p style={{ margin: 0, fontSize: "0.78rem" }}>Click "Record Sample & Retrain" to capture real storage telemetry now.</p>
            <button onClick={handleSampleAndRetrain} disabled={isSampling} className="btn btn-cyan" style={{ marginTop: "8px" }}>
              <Zap size={14} /> Record First Sample
            </button>
          </div>
        ) : (
          <div style={{ height: "350px", width: "100%", marginTop: "10px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={timelineData} margin={{ top: 20, right: 30, left: 15, bottom: 25 }}>
                <defs>
                  <linearGradient id="forecastingBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="dateLabel"
                  stroke="#64748b"
                  fontSize={11}
                  angle={-20}
                  textAnchor="end"
                  height={45}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(v) => `${v} GB`}
                  domain={["auto", "auto"]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} />

                {/* 95% Confidence Corridor Area */}
                <Area
                  type="monotone"
                  dataKey="confidenceUpperGb"
                  stroke="#0284c7"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  fill="url(#forecastingBand)"
                  name="95% Confidence Corridor"
                />
                <Area
                  type="monotone"
                  dataKey="confidenceLowerGb"
                  stroke="#0284c7"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  fill="#0b1120"
                  legendType="none"
                />

                {/* Actual Historical Telemetry (Solid Emerald Line) */}
                <Line
                  type="monotone"
                  dataKey="actualGb"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 3, fill: "#10b981" }}
                  activeDot={{ r: 6 }}
                  name="Actual Observed Telemetry"
                />

                {/* AI Point Forecast (Dashed Cyan Line) */}
                <Line
                  type="monotone"
                  dataKey="predictedGb"
                  stroke="#38bdf8"
                  strokeWidth={3}
                  strokeDasharray="5 5"
                  dot={{ r: 4, fill: "#38bdf8" }}
                  activeDot={{ r: 7 }}
                  name="AI Point Prediction"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Model Tournament Evaluation Table */}
      {forecastData?.model_benchmarks && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <BarChart2 size={18} color="#a855f7" />
                Algorithm Tournament Benchmarks (Chronological 80/20 Validation)
              </h3>
              <p className="card-subtitle">
                Competitive evaluation across Seasonal Naive, Moving Average, Linear Regression, Ridge Regression, Random Forest, and LightGBM
              </p>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e293b", textAlign: "left", color: "#94a3b8" }}>
                  <th style={{ padding: "10px 14px" }}>Model</th>
                  <th style={{ padding: "10px 14px" }}>Architecture Type</th>
                  <th style={{ padding: "10px 14px" }}>MAE (GB)</th>
                  <th style={{ padding: "10px 14px" }}>RMSE (GB)</th>
                  <th style={{ padding: "10px 14px" }}>sMAPE (%)</th>
                  <th style={{ padding: "10px 14px" }}>R² Score</th>
                  <th style={{ padding: "10px 14px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(forecastData.model_benchmarks).map(([name, bm]: [string, any]) => (
                  <tr key={name} style={{
                    borderBottom: "1px solid #1e293b",
                    backgroundColor: bm.is_selected ? "rgba(56, 189, 248, 0.08)" : "transparent"
                  }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: bm.is_selected ? "#38bdf8" : "#f8fafc" }}>
                      {name.replace(/_/g, " ")}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{bm.model_type || "Model"}</td>
                    <td style={{ padding: "10px 14px", color: "#cbd5e1" }}>{bm.mae_gb !== undefined ? `${bm.mae_gb} GB` : "--"}</td>
                    <td style={{ padding: "10px 14px", color: "#cbd5e1" }}>{bm.rmse_gb !== undefined ? `${bm.rmse_gb} GB` : "--"}</td>
                    <td style={{ padding: "10px 14px", color: "#cbd5e1" }}>{bm.smape_percent !== undefined ? `${bm.smape_percent}%` : "--"}</td>
                    <td style={{ padding: "10px 14px", color: "#cbd5e1" }}>{bm.r2_score !== undefined ? bm.r2_score : "--"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {bm.is_selected ? (
                        <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.2)", color: "#34d399", fontWeight: 700 }}>
                          Selected (Best)
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.7rem", color: "#64748b" }}>Evaluated</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default MLForecasting;
