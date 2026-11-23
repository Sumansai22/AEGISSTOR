import React, { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  Shield,
  Save,
  CheckCircle2,
  Clock,
  Database,
  Sliders,
  AlertTriangle,
  Info
} from "lucide-react";
import {
  fetchSettings,
  updateSettings,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  sendTestNotification
} from "../services/api";

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<Record<string, string>>({
    telemetry_interval_sec: "5",
    warning_usage_percent: "80.0",
    critical_usage_percent: "90.0",
    runway_warning_days: "30.0",
    runway_critical_days: "7.0",
    excluded_scan_paths: "Windows,System Volume Information,$Recycle.Bin,WinSxS,pagefile.sys,hiberfil.sys",
    retention_days: "30"
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings()
      .then(data => {
        if (data && Object.keys(data).length > 0) {
          setSettings(prev => ({ ...prev, ...data }));
        }
      })
      .catch(err => console.error("Error loading settings:", err));
  }, []);

  const handleChange = (key: string, val: string) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateSettings(settings);
      setSaveMessage("Settings saved and synchronized with SQLite database.");
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err) {
      setSaveMessage("Failed to save settings. Please verify backend connectivity.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>
            Application & Risk Engine Settings
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Configure telemetry polling frequencies, threshold triggers, scan exclusion lists, and database retention.
          </p>
        </div>

        <button onClick={handleSave} disabled={isSaving} className="btn btn-primary">
          <Save size={14} />
          <span>{isSaving ? "Saving..." : "Save Configuration"}</span>
        </button>
      </div>

      {saveMessage && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "8px",
          background: "rgba(16, 185, 129, 0.12)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          color: "#34d399",
          fontSize: "0.85rem",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <CheckCircle2 size={16} />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Settings Grid */}
      <div className="grid-cols-2">
        {/* Monitoring & Telemetry Settings */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: "16px" }}>
            <Clock size={18} color="#38bdf8" />
            Telemetry & Polling Configuration
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "0.82rem", color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
                Continuous Telemetry Sampling Interval (Seconds)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={settings.telemetry_interval_sec || "5"}
                onChange={(e) => handleChange("telemetry_interval_sec", e.target.value)}
                className="input-text"
              />
              <span style={{ fontSize: "0.74rem", color: "#64748b", display: "block", marginTop: "4px" }}>
                Default: 5 seconds. Higher frequency yields finer I/O resolution.
              </span>
            </div>

            <div>
              <label style={{ fontSize: "0.82rem", color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
                Historical Telemetry Retention (Days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={settings.retention_days || "30"}
                onChange={(e) => handleChange("retention_days", e.target.value)}
                className="input-text"
              />
              <span style={{ fontSize: "0.74rem", color: "#64748b", display: "block", marginTop: "4px" }}>
                Automatically purges records older than this limit to preserve SQLite storage size.
              </span>
            </div>
          </div>
        </div>

        {/* Risk Thresholds */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: "16px" }}>
            <Sliders size={18} color="#f59e0b" />
            Predictive Risk Safety Thresholds
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "0.82rem", color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
                Warning Utilization Threshold (%)
              </label>
              <input
                type="number"
                min="50"
                max="95"
                step="1"
                value={settings.warning_usage_percent || "80.0"}
                onChange={(e) => handleChange("warning_usage_percent", e.target.value)}
                className="input-text"
              />
              <span style={{ fontSize: "0.74rem", color: "#64748b", display: "block", marginTop: "4px" }}>
                Triggers MODERATE or HIGH advisory warnings. Default: 80%.
              </span>
            </div>

            <div>
              <label style={{ fontSize: "0.82rem", color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
                Critical Exhaustion Threshold (%)
              </label>
              <input
                type="number"
                min="70"
                max="99"
                step="1"
                value={settings.critical_usage_percent || "90.0"}
                onChange={(e) => handleChange("critical_usage_percent", e.target.value)}
                className="input-text"
              />
              <span style={{ fontSize: "0.74rem", color: "#64748b", display: "block", marginTop: "4px" }}>
                Triggers CRITICAL capacity warnings. Default: 90%.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Protected Exclusions */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: "14px" }}>
          <Shield size={18} color="#10b981" />
          Safety Boundaries & Scan Exclusion Paths
        </h3>
        <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginBottom: "12px" }}>
          These paths and system files are permanently bypassed during directory traversals and file operations to prevent filesystem corruption or permission faults:
        </p>
        <textarea
          rows={3}
          value={settings.excluded_scan_paths || ""}
          onChange={(e) => handleChange("excluded_scan_paths", e.target.value)}
          className="input-text"
          style={{ fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" }}
        />
        <div style={{
          marginTop: "12px",
          padding: "10px 14px",
          borderRadius: "6px",
          background: "#070b14",
          border: "1px solid #1e293b",
          fontSize: "0.75rem",
          color: "#94a3b8",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <Info size={14} color="#38bdf8" />
          <span>Note: Running the application as standard user guarantees that protected OS files cannot be touched. Administrator privileges are never required for monitoring.</span>
        </div>
      </div>

      {/* Enterprise Notification Channels & Preferences (Phase 7) */}
      <NotificationPreferencesSection />
    </div>
  );
};

const NotificationPreferencesSection: React.FC = () => {
  const [prefs, setPrefs] = useState<any>({
    email_enabled: true,
    in_app_enabled: true,
    web_push_enabled: true,
    sms_enabled: false,
    aws_sns_enabled: false,
    notification_email: "admin@aegisstor.local",
    notification_phone: "",
    aws_sns_topic_arn: "",
    min_severity_email: "WARNING",
    min_severity_in_app: "INFO",
    min_severity_web_push: "WARNING",
    min_severity_sms: "CRITICAL",
    min_severity_aws_sns: "CRITICAL",
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    retention_days: 90
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Test Notification State
  const [testChannel, setTestChannel] = useState<string>("IN_APP");
  const [testRecipient, setTestRecipient] = useState<string>("");
  const [testSeverity, setTestSeverity] = useState<string>("INFO");
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    fetchNotificationPreferences().then(data => {
      if (data) setPrefs(data);
    }).catch(console.error);
  }, []);

  const handlePrefChange = (key: string, val: any) => {
    setPrefs((prev: any) => ({ ...prev, [key]: val }));
  };

  const handleSavePrefs = async () => {
    setIsSaving(true);
    setSaveMsg(null);
    try {
      await updateNotificationPreferences(prefs);
      setSaveMsg("Notification preferences and quiet hours saved.");
      setTimeout(() => setSaveMsg(null), 4000);
    } catch (err: any) {
      setSaveMsg("Failed to update notification preferences.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestDispatch = async () => {
    setTestRunning(true);
    setTestResult(null);
    try {
      const res = await sendTestNotification(testChannel, testRecipient || undefined, testSeverity);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestRunning(false);
    }
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 className="card-title" style={{ fontSize: "1.1rem" }}>
            <SettingsIcon size={18} color="#38bdf8" />
            Multi-Channel Notification Dispatch & Quiet Hours (Phase 7)
          </h3>
          <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "4px" }}>
            Configure delivery channels, minimum severity triggers, quiet hours rules, and verify provider connectivity.
          </p>
        </div>

        <button onClick={handleSavePrefs} disabled={isSaving} className="btn btn-primary" style={{ padding: "6px 14px", fontSize: "0.82rem" }}>
          <Save size={13} />
          <span>{isSaving ? "Saving..." : "Save Preferences"}</span>
        </button>
      </div>

      {saveMsg && (
        <div style={{ padding: "10px 14px", background: "rgba(16, 185, 129, 0.12)", color: "#10b981", borderRadius: "6px", fontSize: "0.82rem" }}>
          {saveMsg}
        </div>
      )}

      {/* Channel Toggles & Thresholds */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
        {/* Email */}
        <div style={{ background: "#070b14", border: "1px solid #1e293b", borderRadius: "8px", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <strong style={{ color: "#f8fafc", fontSize: "0.9rem" }}>Email Notifications</strong>
            <input
              type="checkbox"
              checked={prefs.email_enabled}
              onChange={(e) => handlePrefChange("email_enabled", e.target.checked)}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Recipient Email</label>
            <input
              type="email"
              value={prefs.notification_email || ""}
              onChange={(e) => handlePrefChange("notification_email", e.target.value)}
              className="input-text"
              style={{ fontSize: "0.82rem" }}
            />
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Minimum Severity</label>
            <select
              value={prefs.min_severity_email}
              onChange={(e) => handlePrefChange("min_severity_email", e.target.value)}
              className="input-text"
              style={{ fontSize: "0.82rem" }}
            >
              <option value="INFO">INFO & Higher</option>
              <option value="WARNING">WARNING & Higher</option>
              <option value="CRITICAL">CRITICAL & Higher</option>
              <option value="EMERGENCY">EMERGENCY Only</option>
            </select>
          </div>
        </div>

        {/* Browser Web Push */}
        <div style={{ background: "#070b14", border: "1px solid #1e293b", borderRadius: "8px", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <strong style={{ color: "#f8fafc", fontSize: "0.9rem" }}>Browser Web Push</strong>
            <input
              type="checkbox"
              checked={prefs.web_push_enabled}
              onChange={(e) => handlePrefChange("web_push_enabled", e.target.checked)}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Protocol: VAPID RFC 8292</label>
            <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Delivers real-time OS popups to subscribed browsers.</span>
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Minimum Severity</label>
            <select
              value={prefs.min_severity_web_push}
              onChange={(e) => handlePrefChange("min_severity_web_push", e.target.value)}
              className="input-text"
              style={{ fontSize: "0.82rem" }}
            >
              <option value="INFO">INFO & Higher</option>
              <option value="WARNING">WARNING & Higher</option>
              <option value="CRITICAL">CRITICAL & Higher</option>
            </select>
          </div>
        </div>

        {/* SMS Urgent Dispatch */}
        <div style={{ background: "#070b14", border: "1px solid #1e293b", borderRadius: "8px", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <strong style={{ color: "#f8fafc", fontSize: "0.9rem" }}>SMS Urgent Dispatch</strong>
            <input
              type="checkbox"
              checked={prefs.sms_enabled}
              onChange={(e) => handlePrefChange("sms_enabled", e.target.checked)}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Administrator Phone (+E.164)</label>
            <input
              type="text"
              placeholder="+1234567890"
              value={prefs.notification_phone || ""}
              onChange={(e) => handlePrefChange("notification_phone", e.target.value)}
              className="input-text"
              style={{ fontSize: "0.82rem" }}
            />
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Minimum Severity</label>
            <select
              value={prefs.min_severity_sms}
              onChange={(e) => handlePrefChange("min_severity_sms", e.target.value)}
              className="input-text"
              style={{ fontSize: "0.82rem" }}
            >
              <option value="CRITICAL">CRITICAL & EMERGENCY</option>
              <option value="EMERGENCY">EMERGENCY Only</option>
            </select>
          </div>
        </div>

        {/* AWS SNS Topic */}
        <div style={{ background: "#070b14", border: "1px solid #1e293b", borderRadius: "8px", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <strong style={{ color: "#f8fafc", fontSize: "0.9rem" }}>AWS SNS Publish</strong>
            <input
              type="checkbox"
              checked={prefs.aws_sns_enabled}
              onChange={(e) => handlePrefChange("aws_sns_enabled", e.target.checked)}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>AWS SNS Topic ARN</label>
            <input
              type="text"
              placeholder="arn:aws:sns:ap-southeast-2:425178888081:..."
              value={prefs.aws_sns_topic_arn || ""}
              onChange={(e) => handlePrefChange("aws_sns_topic_arn", e.target.value)}
              className="input-text"
              style={{ fontSize: "0.82rem" }}
            />
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Minimum Severity</label>
            <select
              value={prefs.min_severity_aws_sns}
              onChange={(e) => handlePrefChange("min_severity_aws_sns", e.target.value)}
              className="input-text"
              style={{ fontSize: "0.82rem" }}
            >
              <option value="CRITICAL">CRITICAL & EMERGENCY</option>
              <option value="EMERGENCY">EMERGENCY Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Quiet Hours Policy */}
      <div style={{ background: "#070b14", border: "1px solid #1e293b", borderRadius: "8px", padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <div>
            <strong style={{ color: "#f8fafc", fontSize: "0.9rem" }}>Quiet Hours Policy</strong>
            <p style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "2px" }}>
              Silences non-critical alerts during scheduled windows. <strong>CRITICAL and EMERGENCY security alerts bypass quiet hours automatically.</strong>
            </p>
          </div>
          <input
            type="checkbox"
            checked={prefs.quiet_hours_enabled}
            onChange={(e) => handlePrefChange("quiet_hours_enabled", e.target.checked)}
          />
        </div>

        <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
          <div>
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Start Time (UTC)</label>
            <input
              type="time"
              value={prefs.quiet_hours_start}
              onChange={(e) => handlePrefChange("quiet_hours_start", e.target.value)}
              className="input-text"
              style={{ fontSize: "0.82rem" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>End Time (UTC)</label>
            <input
              type="time"
              value={prefs.quiet_hours_end}
              onChange={(e) => handlePrefChange("quiet_hours_end", e.target.value)}
              className="input-text"
              style={{ fontSize: "0.82rem" }}
            />
          </div>
        </div>
      </div>

      {/* Diagnostic Channel Test */}
      <div style={{ borderTop: "1px solid #1e293b", paddingTop: "16px" }}>
        <h4 style={{ fontSize: "0.92rem", fontWeight: 600, color: "#f1f5f9", marginBottom: "10px" }}>
          Diagnostic Notification Dispatch Test
        </h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          <select
            value={testChannel}
            onChange={(e) => setTestChannel(e.target.value)}
            className="input-text"
            style={{ fontSize: "0.82rem", width: "130px" }}
          >
            <option value="IN_APP">In-App</option>
            <option value="EMAIL">Email</option>
            <option value="WEB_PUSH">Web Push</option>
            <option value="SMS">SMS</option>
            <option value="AWS_SNS">AWS SNS</option>
          </select>

          <input
            type="text"
            placeholder="Recipient target (email, phone, or topic ARN)"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            className="input-text"
            style={{ fontSize: "0.82rem", flex: 1, minWidth: "220px" }}
          />

          <button
            onClick={handleTestDispatch}
            disabled={testRunning}
            className="btn btn-primary"
            style={{ padding: "8px 14px", fontSize: "0.82rem" }}
          >
            {testRunning ? "Dispatching..." : "Send Test Notification"}
          </button>
        </div>

        {testResult && (
          <div style={{
            marginTop: "12px",
            padding: "10px 14px",
            borderRadius: "6px",
            background: testResult.success ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
            border: `1px solid ${testResult.success ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            fontSize: "0.82rem",
            color: testResult.success ? "#34d399" : "#f87171"
          }}>
            <strong>{testResult.success ? "DISPATCH CONFIRMED: " : "TRANSMISSION FAILED: "}</strong>
            {testResult.response || testResult.error || testResult.status || JSON.stringify(testResult)}
          </div>
        )}
      </div>
    </div>
  );
};

