import React, { useState, useEffect } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Archive,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  Info,
  ShieldAlert,
  HardDrive,
  Database,
  Activity,
  Cloud,
  TrendingUp,
  Radio,
  ExternalLink
} from "lucide-react";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification
} from "../services/api";
import { NotificationItem } from "../types";

interface NotificationCenterProps {
  onNavigateToIncident?: (incidentId: number) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  onNavigateToIncident
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const loadNotifications = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetchNotifications({
        category: categoryFilter === "ALL" ? undefined : categoryFilter,
        severity: severityFilter === "ALL" ? undefined : severityFilter,
        is_read: unreadOnly ? false : undefined,
        search: searchQuery || undefined,
        limit: 100
      });
      setNotifications(res.items || []);
      setTotalCount(res.total || 0);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [categoryFilter, severityFilter, unreadOnly]);

  const handleMarkRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleArchive = async (id: number) => {
    try {
      await archiveNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setTotalCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat.toUpperCase()) {
      case "STORAGE": return <HardDrive size={16} color="#38bdf8" />;
      case "DATABASE": return <Database size={16} color="#a855f7" />;
      case "PERFORMANCE": return <Activity size={16} color="#34d399" />;
      case "AWS": return <Cloud size={16} color="#f59e0b" />;
      case "AI_FORECAST": return <TrendingUp size={16} color="#06b6d4" />;
      case "SECURITY": return <ShieldAlert size={16} color="#ef4444" />;
      default: return <Radio size={16} color="#94a3b8" />;
    }
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px", display: "flex", alignItems: "center", gap: "10px" }}>
            <Bell size={26} color="#38bdf8" />
            Enterprise Notification Center
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Central notification feed, validated monitoring events, alert suppression status, and delivery tracking.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={handleMarkAllRead} className="btn" style={{ padding: "8px 14px", fontSize: "0.82rem" }}>
            <CheckCheck size={14} />
            <span>Mark All Read</span>
          </button>
          <button onClick={loadNotifications} disabled={isRefreshing} className="btn btn-primary" style={{ padding: "8px 14px", fontSize: "0.82rem" }}>
            <RefreshCw size={14} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: "16px", display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
          <Search size={16} color="#64748b" />
          <input
            type="text"
            placeholder="Search notifications by title, message, or resource..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") loadNotifications(); }}
            style={{
              background: "#070b14",
              border: "1px solid #1e293b",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#f8fafc",
              fontSize: "0.85rem",
              width: "100%"
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", color: "#94a3b8", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            <span>Unread Only</span>
          </label>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              background: "#070b14",
              border: "1px solid #1e293b",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#f8fafc",
              fontSize: "0.85rem"
            }}
          >
            <option value="ALL">All Categories</option>
            <option value="STORAGE">Storage</option>
            <option value="DATABASE">Database</option>
            <option value="PERFORMANCE">Performance</option>
            <option value="AWS">AWS S3</option>
            <option value="AI_FORECAST">AI Forecast</option>
            <option value="SECURITY">Security</option>
            <option value="ANNOUNCEMENT">Announcements</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            style={{
              background: "#070b14",
              border: "1px solid #1e293b",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#f8fafc",
              fontSize: "0.85rem"
            }}
          >
            <option value="ALL">All Severities</option>
            <option value="EMERGENCY">Emergency</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
          </select>
        </div>
      </div>

      {/* Notifications Feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {notifications.length === 0 ? (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
            <Bell size={36} color="#334155" style={{ margin: "0 auto 12px auto" }} />
            <h3 style={{ color: "#94a3b8" }}>No Notifications Found</h3>
            <p style={{ fontSize: "0.85rem", marginTop: "4px" }}>
              {loading ? "Loading event feed..." : "All system alerts have been reviewed or no events match current filters."}
            </p>
          </div>
        ) : (
          notifications.map((n) => {
            const sevColor =
              n.severity === "EMERGENCY" ? "#dc2626" :
              n.severity === "CRITICAL" ? "#ef4444" :
              n.severity === "WARNING" ? "#f59e0b" : "#38bdf8";

            return (
              <div
                key={n.id}
                className="card"
                style={{
                  padding: "16px 20px",
                  borderLeft: `4px solid ${sevColor}`,
                  opacity: n.is_read ? 0.75 : 1.0,
                  background: n.is_read ? "#0b1120" : "#0f172a",
                  transition: "all 0.15s ease"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flex: 1 }}>
                    <div style={{
                      marginTop: "2px",
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "#070b14",
                      border: "1px solid #1e293b",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}>
                      {getCategoryIcon(n.category)}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{
                          background: `${sevColor}22`,
                          color: sevColor,
                          border: `1px solid ${sevColor}44`,
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontSize: "0.7rem",
                          fontWeight: 700
                        }}>
                          {n.severity}
                        </span>

                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {n.category} • {n.source}
                        </span>

                        {n.resource && (
                          <span style={{ fontSize: "0.75rem", background: "#070b14", padding: "1px 6px", borderRadius: "4px", color: "#cbd5e1" }}>
                            {n.resource}
                          </span>
                        )}

                        {!n.is_read && (
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#38bdf8" }} />
                        )}
                      </div>

                      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "#f8fafc", marginTop: "4px" }}>
                        {n.title}
                      </h3>

                      <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "4px", lineHeight: 1.4 }}>
                        {n.message}
                      </p>

                      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "10px", fontSize: "0.75rem", color: "#64748b" }}>
                        <span>Logged: {n.created_at}</span>
                        {n.read_at && <span>Read: {n.read_at}</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="btn"
                        style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                        title="Mark as read"
                      >
                        <Check size={13} />
                        <span>Read</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleArchive(n.id)}
                      className="btn"
                      style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      title="Archive notification"
                    >
                      <Archive size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
