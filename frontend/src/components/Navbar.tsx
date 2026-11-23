import React, { useState, useEffect } from "react";
import { Shield, RefreshCw, Cpu, HardDrive, CheckCircle2, AlertTriangle, Bell, Check, ExternalLink, Cloud } from "lucide-react";
import { SystemInfo, BackendHealthStatus, AWSConnectionStatus } from "../types";
import { fetchNotifications, fetchUnreadNotificationCount, markNotificationRead, markAllNotificationsRead } from "../services/api";

interface NavbarProps {
  systemInfo: SystemInfo | null;
  isConnected: boolean;
  backendHealth?: BackendHealthStatus | null;
  awsStatus?: AWSConnectionStatus | null;
  lastUpdated: string;
  onRefresh: () => void;
  isRefreshing: boolean;
  onNavigate?: (tabId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  systemInfo,
  isConnected,
  backendHealth,
  awsStatus,
  lastUpdated,
  onRefresh,
  isRefreshing,
  onNavigate
}) => {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [recentNotifs, setRecentNotifs] = useState<any[]>([]);

  const pollUnread = async () => {
    try {
      const count = await fetchUnreadNotificationCount();
      setUnreadCount(count);
    } catch {
      // Ignore
    }
  };

  const loadDropdownNotifs = async () => {
    try {
      const res = await fetchNotifications({ limit: 5 });
      setRecentNotifs(res.items || []);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    pollUnread();
    const interval = setInterval(pollUnread, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleDropdown = () => {
    if (!showDropdown) {
      loadDropdownNotifs();
    }
    setShowDropdown(!showDropdown);
  };

  const handleMarkRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setRecentNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setRecentNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <header style={{
      height: "64px",
      backgroundColor: "#0b1120",
      borderBottom: "1px solid #1e293b",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      zIndex: 100,
      position: "relative"
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "36px",
          height: "36px",
          borderRadius: "8px",
          background: "linear-gradient(135deg, #0284c7, #2563eb)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 12px rgba(37, 99, 235, 0.4)"
        }}>
          <Shield size={22} color="#ffffff" />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.15rem", fontWeight: 700, letterSpacing: "1px", color: "#f8fafc" }}>
              AEGISSTOR
            </span>
            <span style={{
              fontSize: "0.65rem",
              background: "rgba(6, 182, 212, 0.2)",
              color: "#38bdf8",
              border: "1px solid rgba(6, 182, 212, 0.4)",
              borderRadius: "4px",
              padding: "1px 6px",
              fontWeight: 600
            }}>
              v2.1 Enterprise
            </span>
          </div>
          <p style={{ fontSize: "0.72rem", color: "#64748b" }}>
            Predictive Storage Management & Performance Optimization
          </p>
        </div>
      </div>

      {/* Host Specs & Connection Status */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {systemInfo && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            background: "#070b14",
            border: "1px solid #1e293b",
            borderRadius: "6px",
            padding: "6px 12px",
            fontSize: "0.78rem",
            color: "#94a3b8"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <HardDrive size={14} color="#38bdf8" />
              <span>{systemInfo.hostname}</span>
            </div>
            <div style={{ width: "1px", height: "14px", background: "#1e293b" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <Cpu size={14} color="#34d399" />
              <span>{systemInfo.cpu_logical_cores} Cores | {systemInfo.total_ram_gb} GB RAM</span>
            </div>
          </div>
        )}

        {/* Backend Health Status Indicator */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "5px 10px",
          borderRadius: "20px",
          fontSize: "0.75rem",
          fontWeight: 600,
          background: isConnected ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
          color: isConnected ? "#34d399" : "#f87171",
          border: `1px solid ${isConnected ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`
        }} title={backendHealth ? `Status: ${backendHealth.status} | DB: ${backendHealth.database || "connected"} | App: ${backendHealth.app} v${backendHealth.version}` : "FastAPI Backend Connection"}>
          {isConnected ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          <span>{isConnected ? "BACKEND ONLINE" : "BACKEND OFFLINE"}</span>
        </div>

        {/* AWS Cloud Storage Status Indicator */}
        <div
          onClick={() => onNavigate && onNavigate("aws_storage")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "5px 10px",
            borderRadius: "20px",
            fontSize: "0.75rem",
            fontWeight: 600,
            cursor: "pointer",
            background: awsStatus?.connected
              ? "rgba(14, 165, 233, 0.14)"
              : (awsStatus?.is_expired ? "rgba(245, 158, 11, 0.14)" : "rgba(239, 68, 68, 0.12)"),
            color: awsStatus?.connected
              ? "#38bdf8"
              : (awsStatus?.is_expired ? "#fbbf24" : "#f87171"),
            border: `1px solid ${
              awsStatus?.connected
                ? "rgba(14, 165, 233, 0.35)"
                : (awsStatus?.is_expired ? "rgba(245, 158, 11, 0.35)" : "rgba(239, 68, 68, 0.3)")
            }`
          }}
          title={awsStatus?.connected ? `AWS Account: ${awsStatus.account_id || "425178888081"} | Region: ${awsStatus.region || "ap-southeast-2"} | Profile: ${awsStatus.profile || "aegisstor"}` : "Click to view AWS Cloud Storage details"}
        >
          <Cloud size={13} color={awsStatus?.connected ? "#38bdf8" : (awsStatus?.is_expired ? "#fbbf24" : "#f87171")} />
          <span>{awsStatus?.connected ? "AWS CONNECTED" : (awsStatus?.is_expired ? "AWS EXPIRED" : "AWS DISCONNECTED")}</span>
        </div>

        {/* Notification Bell with Badge & Dropdown */}
        <div style={{ position: "relative" }}>
          <button
            onClick={handleToggleDropdown}
            className="btn"
            style={{
              padding: "7px 10px",
              position: "relative",
              background: showDropdown ? "#1e293b" : "transparent"
            }}
            title="Notifications"
          >
            <Bell size={16} color={unreadCount > 0 ? "#38bdf8" : "#94a3b8"} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute",
                top: "-4px",
                right: "-4px",
                background: "#ef4444",
                color: "#ffffff",
                borderRadius: "10px",
                padding: "1px 5px",
                fontSize: "0.68rem",
                fontWeight: 700,
                border: "2px solid #0b1120",
                minWidth: "16px",
                textAlign: "center"
              }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {/* Interactive Dropdown */}
          {showDropdown && (
            <div style={{
              position: "absolute",
              right: 0,
              top: "44px",
              width: "360px",
              background: "#0b1120",
              border: "1px solid #1e293b",
              borderRadius: "8px",
              boxShadow: "0 12px 28px rgba(0, 0, 0, 0.6)",
              display: "flex",
              flexDirection: "column",
              zIndex: 1000,
              overflow: "hidden"
            }}>
              <div style={{
                padding: "12px 16px",
                borderBottom: "1px solid #1e293b",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#f8fafc" }}>
                  Notifications ({unreadCount} unread)
                </span>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    style={{ background: "transparent", border: "none", color: "#38bdf8", fontSize: "0.75rem", cursor: "pointer" }}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                {recentNotifs.length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "0.8rem" }}>
                    No recent notifications.
                  </div>
                ) : (
                  recentNotifs.map((n) => {
                    const sevColor =
                      n.severity === "EMERGENCY" ? "#dc2626" :
                      n.severity === "CRITICAL" ? "#ef4444" :
                      n.severity === "WARNING" ? "#f59e0b" : "#38bdf8";

                    return (
                      <div
                        key={n.id}
                        style={{
                          padding: "10px 14px",
                          borderBottom: "1px solid #1e293b",
                          borderLeft: `3px solid ${sevColor}`,
                          background: n.is_read ? "#0b1120" : "#0f172a",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "8px"
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: sevColor }}>
                              {n.severity}
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "#64748b" }}>
                              {n.category}
                            </span>
                          </div>
                          <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#f8fafc", marginTop: "2px" }}>
                            {n.title}
                          </p>
                          <p style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "2px" }}>
                            {n.message.length > 80 ? `${n.message.substring(0, 80)}...` : n.message}
                          </p>
                        </div>

                        {!n.is_read && (
                          <button
                            onClick={() => handleMarkRead(n.id)}
                            style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", padding: "2px" }}
                            title="Mark as read"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{
                padding: "10px 14px",
                borderTop: "1px solid #1e293b",
                background: "#070b14",
                display: "flex",
                justifyContent: "space-between"
              }}>
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    if (onNavigate) onNavigate("notifications");
                  }}
                  style={{ background: "transparent", border: "none", color: "#38bdf8", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
                >
                  View All Notifications
                </button>
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    if (onNavigate) onNavigate("incidents");
                  }}
                  style={{ background: "transparent", border: "none", color: "#a855f7", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
                >
                  Manage Incidents
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Last updated & Refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
            {lastUpdated ? `Sync: ${lastUpdated}` : "Syncing..."}
          </span>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="btn"
            style={{ padding: "6px 10px", fontSize: "0.78rem" }}
            title="Refresh All Telemetry"
          >
            <RefreshCw size={13} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
            <span>Refresh</span>
          </button>
        </div>
      </div>
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </header>
  );
};

