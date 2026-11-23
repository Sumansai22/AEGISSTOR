import React from "react";
import {
  LayoutDashboard,
  HardDrive,
  FolderSearch,
  TrendingUp,
  AlertOctagon,
  Activity,
  Sparkles,
  Layers,
  FileText,
  Settings as SettingsIcon,
  Database,
  Shield,
  Lock,
  BarChart2,
  Cloud,
  AlertTriangle,
  Bell,
  Radio
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  alertCount: number;
  recommendationCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  alertCount,
  recommendationCount
}) => {
  const sections = [
    {
      title: "Core Monitoring",
      items: [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "monitoring", label: "Storage Monitoring", icon: HardDrive },
        { id: "aws_storage", label: "AWS Cloud Storage", icon: Cloud },
        { id: "analyzer", label: "Storage Analyzer", icon: FolderSearch },
        { id: "performance", label: "System Performance", icon: Activity },
      ]
    },
    {
      title: "Enterprise Intelligence & AI",
      items: [
        { id: "databases", label: "Database Intelligence", icon: Database },
        { id: "forecasting", label: "AI Forecasting", icon: TrendingUp },
        { id: "capacity", label: "Capacity Runway", icon: BarChart2 },
        { id: "digital_twin", label: "Digital Twin", icon: Layers },
      ]
    },
    {
      title: "Alerts & Incident Response",
      items: [
        { id: "incidents", label: "Incident Management", icon: AlertTriangle },
        { id: "notifications", label: "Notification Center", icon: Bell },
        { id: "system_updates", label: "System Updates", icon: Radio },
      ]
    },
    {
      title: "Security & Optimization",
      items: [
        { id: "security", label: "Security Center", icon: Shield },
        { id: "privacy", label: "Privacy Guard", icon: Lock },
        { id: "risks", label: "Risk Management", icon: AlertOctagon, badge: alertCount },
        { id: "optimization", label: "Optimization Center", icon: Sparkles, badge: recommendationCount },
        { id: "reports", label: "Historical Reports", icon: FileText },
        { id: "settings", label: "Settings", icon: SettingsIcon },
      ]
    }
  ];

  return (
    <aside style={{
      width: "250px",
      backgroundColor: "#0b1120",
      borderRight: "1px solid #1e293b",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      height: "calc(100vh - 64px)",
      overflowY: "auto"
    }}>
      <div style={{ padding: "12px 10px" }}>
        {sections.map((section, idx) => (
          <div key={idx} style={{ marginBottom: "16px" }}>
            <p style={{
              fontSize: "0.65rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "#475569",
              padding: "0 12px 6px 12px"
            }}>
              {section.title}
            </p>
            <nav style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "7px",
                      border: "none",
                      background: isActive ? "rgba(37, 99, 235, 0.18)" : "transparent",
                      color: isActive ? "#38bdf8" : "#94a3b8",
                      fontWeight: isActive ? 600 : 500,
                      fontSize: "0.82rem",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      textAlign: "left"
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "#111b2e";
                        e.currentTarget.style.color = "#f8fafc";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "#94a3b8";
                      }
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                      <Icon size={16} color={isActive ? "#38bdf8" : "#64748b"} />
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && item.badge > 0 && (
                      <span style={{
                        fontSize: "0.68rem",
                        padding: "1px 6px",
                        borderRadius: "10px",
                        background: item.id === "risks" ? "rgba(239, 68, 68, 0.25)" : "rgba(6, 182, 212, 0.2)",
                        color: item.id === "risks" ? "#fca5a5" : "#67e8f9",
                        border: `1px solid ${item.id === "risks" ? "rgba(239, 68, 68, 0.4)" : "rgba(6, 182, 212, 0.4)"}`,
                        fontWeight: 700
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Engine Status Footnote */}
      <div style={{
        padding: "12px",
        margin: "8px 10px 12px 10px",
        backgroundColor: "#070b14",
        borderRadius: "8px",
        border: "1px solid #1e293b",
        fontSize: "0.72rem",
        color: "#64748b"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981" }} />
          <span style={{ fontWeight: 600, color: "#cbd5e1" }}>Enterprise Engine v2.0</span>
        </div>
        <p>AES-256 encrypted, zero-cloud metadata surveillance on localhost.</p>
      </div>
    </aside>
  );
};
export default Sidebar;
