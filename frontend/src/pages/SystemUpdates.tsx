import React, { useState, useEffect } from "react";
import {
  Radio,
  Sparkles,
  ShieldCheck,
  Cpu,
  Cloud,
  TrendingUp,
  AlertCircle,
  PlusCircle,
  RefreshCw
} from "lucide-react";
import { fetchSystemAnnouncements, createSystemAnnouncement } from "../services/api";
import { SystemAnnouncementItem } from "../types";

export const SystemUpdates: React.FC = () => {
  const [announcements, setAnnouncements] = useState<SystemAnnouncementItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Announcement creator modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [version, setVersion] = useState<string>("2.1.0");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [category, setCategory] = useState<string>("FEATURE");
  const [impact, setImpact] = useState<string>("LOW");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadAnnouncements = async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchSystemAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) return;
    setIsSubmitting(true);
    try {
      await createSystemAnnouncement({
        version,
        title,
        description,
        category,
        impact
      });
      setShowCreateModal(false);
      setTitle("");
      setDescription("");
      loadAnnouncements();
    } catch (err: any) {
      alert(err.message || "Failed to publish announcement");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat.toUpperCase()) {
      case "FEATURE":
        return <span className="badge badge-cyan">Feature Release</span>;
      case "SECURITY_PATCH":
        return <span className="badge badge-high">Security Patch</span>;
      case "ML_UPDATE":
        return <span className="badge badge-moderate">ML Update</span>;
      case "AWS_UPDATE":
        return <span className="badge badge-cyan">AWS Update</span>;
      case "MAINTENANCE":
        return <span className="badge badge-low">Maintenance</span>;
      default:
        return <span className="badge badge-low">{cat}</span>;
    }
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px", display: "flex", alignItems: "center", gap: "10px" }}>
            <Radio size={26} color="#38bdf8" />
            System Updates & Service Announcements
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Verified software releases, architecture upgrades, maintenance notices, and security advisories.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary" style={{ padding: "8px 14px", fontSize: "0.82rem" }}>
            <PlusCircle size={14} />
            <span>Publish Announcement</span>
          </button>
          <button onClick={loadAnnouncements} disabled={isRefreshing} className="btn" style={{ padding: "8px 14px", fontSize: "0.82rem" }}>
            <RefreshCw size={14} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Announcements Timeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {announcements.length === 0 ? (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
            <Radio size={36} color="#334155" style={{ margin: "0 auto 12px auto" }} />
            <h3 style={{ color: "#94a3b8" }}>No Announcements Logged</h3>
            <p style={{ fontSize: "0.85rem", marginTop: "4px" }}>
              {loading ? "Loading verified release records..." : "System is running current release."}
            </p>
          </div>
        ) : (
          announcements.map((ann) => (
            <div key={ann.id} className="card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#38bdf8", background: "#070b14", padding: "2px 8px", borderRadius: "4px", border: "1px solid #1e293b" }}>
                      v{ann.version}
                    </span>
                    {getCategoryBadge(ann.category)}
                    <span style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: ann.impact === "HIGH" ? "#ef4444" : ann.impact === "MEDIUM" ? "#f59e0b" : "#10b981",
                      textTransform: "uppercase"
                    }}>
                      {ann.impact} Impact
                    </span>
                  </div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#f8fafc", marginTop: "8px" }}>
                    {ann.title}
                  </h3>
                </div>
                <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                  {ann.created_at}
                </span>
              </div>
              <p style={{ fontSize: "0.88rem", color: "#94a3b8", marginTop: "8px", lineHeight: 1.5 }}>
                {ann.description}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Create Announcement Modal */}
      {showCreateModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "550px", padding: "24px" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#f8fafc", marginBottom: "16px" }}>
              Publish Verified System Announcement
            </h3>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Application Version</label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  style={{ width: "100%", background: "#070b14", border: "1px solid #1e293b", borderRadius: "6px", padding: "8px 12px", color: "#f8fafc" }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Announcement Title</label>
                <input
                  type="text"
                  placeholder="e.g. Database Maintenance Window Scheduled"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ width: "100%", background: "#070b14", border: "1px solid #1e293b", borderRadius: "6px", padding: "8px 12px", color: "#f8fafc" }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{ width: "100%", background: "#070b14", border: "1px solid #1e293b", borderRadius: "6px", padding: "8px 12px", color: "#f8fafc" }}
                  >
                    <option value="FEATURE">Feature Announcement</option>
                    <option value="MAINTENANCE">Maintenance Notice</option>
                    <option value="SECURITY_PATCH">Security Patch</option>
                    <option value="SERVICE_STATUS">Service Status</option>
                    <option value="ML_UPDATE">ML Update</option>
                    <option value="AWS_UPDATE">AWS Update</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Impact Level</label>
                  <select
                    value={impact}
                    onChange={(e) => setImpact(e.target.value)}
                    style={{ width: "100%", background: "#070b14", border: "1px solid #1e293b", borderRadius: "6px", padding: "8px 12px", color: "#f8fafc" }}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Description</label>
                <textarea
                  placeholder="Detailed description of the upgrade or operational change..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ width: "100%", background: "#070b14", border: "1px solid #1e293b", borderRadius: "6px", padding: "8px 12px", color: "#f8fafc", minHeight: "80px" }}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                  {isSubmitting ? "Publishing..." : "Publish Announcement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
