import React from "react";
import { LucideIcon } from "lucide-react";

interface SummaryCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  badge?: {
    text: string;
    type?: "low" | "moderate" | "high" | "critical" | "cyan";
  };
  progress?: {
    percent: number;
    colorClass?: "fill-low" | "fill-moderate" | "fill-high" | "fill-critical";
  };
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "#38bdf8",
  badge,
  progress
}) => {
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {title}
        </span>
        <div style={{
          width: "36px",
          height: "36px",
          borderRadius: "8px",
          background: "rgba(30, 41, 59, 0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #1e293b"
        }}>
          <Icon size={18} color={iconColor} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "8px" }}>
        <span style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>
          {value}
        </span>
        {badge && (
          <span className={`badge badge-${badge.type || "cyan"}`}>
            {badge.text}
          </span>
        )}
      </div>

      {progress && (
        <div style={{ marginTop: "10px", marginBottom: "8px" }}>
          <div className="progress-container">
            <div
              className={`progress-fill ${progress.colorClass || "fill-low"}`}
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
        </div>
      )}

      {subtitle && (
        <p style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "4px" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
};
