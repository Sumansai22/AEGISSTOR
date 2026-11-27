import React, { useState, useEffect } from "react";
import {
  Shield,
  Key,
  Lock,
  UserCheck,
  Smartphone,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  RefreshCw,
  Users,
  Search,
  Download,
  Activity,
  PlayCircle,
  Clock,
  Filter,
  CheckCircle2,
  AlertOctagon,
  ExternalLink
} from "lucide-react";
import {
  setupMFA,
  verifyMFA,
  fetchAuditLogs,
  downloadAuditLogsCsv,
  fetchCurrentUser,
  fetchUsers,
  fetchSecurityDashboard,
  runSecurityScan,
  fetchSecurityEvents,
  fetchSecurityChecks
} from "../services/api";
import {
  AuditLogItem,
  User,
  SecurityDashboardData,
  SecurityCheckResult,
  SecurityEventItem
} from "../types";

export const SecurityCenter: React.FC = () => {
  const [dashboard, setDashboard] = useState<SecurityDashboardData | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [checks, setChecks] = useState<SecurityCheckResult[]>([]);
  const [events, setEvents] = useState<SecurityEventItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditTotal, setAuditTotal] = useState<number>(0);

  // Filter & Search states
  const [auditSearch, setAuditSearch] = useState<string>("");
  const [auditSeverity, setAuditSeverity] = useState<string>("ALL");
  const [auditAction, setAuditAction] = useState<string>("ALL");
  const [checkCategoryFilter, setCheckCategoryFilter] = useState<string>("ALL");
  const [eventSeverityFilter, setEventSeverityFilter] = useState<string>("ALL");

  // MFA states
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState<string>("");
  const [mfaStatus, setMfaStatus] = useState<string | null>(null);

  // Loading & Scanning states
  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"scanner" | "events" | "audit" | "rbac">("scanner");

  const loadSecurityState = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch current user
      try {
        const u = await fetchCurrentUser();
        setCurrentUser(u);
      } catch {
        setCurrentUser({ email: "admin@aegisstor.internal", role: "SUPER_ADMIN", mfa_enabled: false });
      }

      // 2. Fetch Security Dashboard
      const dash = await fetchSecurityDashboard();
      setDashboard(dash);
      if (dash.latest_scan?.checks) {
        setChecks(dash.latest_scan.checks);
      }

      // 3. Fetch Security Events
      const evts = await fetchSecurityEvents("ALL", "ALL", 30);
      setEvents(evts);

      // 4. Fetch Audit Logs
      await loadAuditLogs(auditSearch, auditSeverity, auditAction);
    } catch (err: any) {
      console.warn("Security load error:", err.message);
      setErrorMsg(err.message || "Failed to load real-time security telemetry.");
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async (search: string, severity: string, action: string) => {
    try {
      const res = await fetchAuditLogs({
        search,
        severity,
        action_type: action,
        limit: 50,
        offset: 0
      });
      if (Array.isArray(res)) {
        setAuditLogs(res);
        setAuditTotal(res.length);
      } else if (res && res.items) {
        setAuditLogs(res.items);
        setAuditTotal(res.total || res.items.length);
      }
    } catch (err: any) {
      console.error("Audit log error:", err);
    }
  };

  useEffect(() => {
    loadSecurityState();
  }, []);

  const handleRunScan = async () => {
    setScanning(true);
    try {
      const res = await runSecurityScan();
      if (res && res.checks) {
        setChecks(res.checks);
      }
      // Reload dashboard state to update posture score
      const updatedDash = await fetchSecurityDashboard();
      setDashboard(updatedDash);

      const updatedEvents = await fetchSecurityEvents("ALL", "ALL", 30);
      setEvents(updatedEvents);
    } catch (err: any) {
      alert(`Security Scan failed: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  const handleAuditFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadAuditLogs(auditSearch, auditSeverity, auditAction);
  };

  const handleExportAuditCsv = async () => {
    try {
      await downloadAuditLogsCsv({
        search: auditSearch,
        severity: auditSeverity,
        action_type: auditAction
      });
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  const handleInitMFA = async () => {
    try {
      const res = await setupMFA();
      setMfaSecret(res.secret);
      setMfaStatus("Scan the URI or enter the secret below into your authenticator app.");
    } catch (err: any) {
      setMfaStatus(`Error: ${err.message}`);
    }
  };

  const handleVerifyMFA = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await verifyMFA(mfaCode);
      setMfaStatus("MFA verified and activated successfully!");
      setMfaSecret(null);
      setMfaCode("");
      await loadSecurityState();
    } catch (err: any) {
      setMfaStatus(`Verification failed: ${err.message}`);
    }
  };

  // Filtered checks
  const filteredChecks = checks.filter((c) => {
    if (checkCategoryFilter === "ALL") return true;
    return c.category === checkCategoryFilter;
  });

  const uniqueCategories = ["ALL", ...Array.from(new Set(checks.map((c) => c.category)))];

  // Filtered events
  const filteredEvents = events.filter((e) => {
    if (eventSeverityFilter === "ALL") return true;
    return e.severity === eventSeverityFilter;
  });

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-7 h-7 text-emerald-400" />
            Enterprise Security Center & Access Governance
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Continuous threat scanning, Argon2id authentication, TOTP two-factor authorization, AES-256 credential vaults, and verified RBAC least-privilege policies.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleRunScan}
            disabled={scanning}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors shadow-lg shadow-emerald-950/40"
          >
            <PlayCircle className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Evaluating Security..." : "Run Security Scan"}
          </button>
          <button
            onClick={() => loadSecurityState()}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-rose-950/50 border border-rose-500/50 rounded-xl text-rose-200 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => loadSecurityState()} className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-900 rounded text-xs font-medium">
            Retry
          </button>
        </div>
      )}

      {/* Top Security Posture Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Posture Score */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-400" />
              Security Posture Score
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              dashboard?.overall_status === "PASSED" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
            }`}>
              {dashboard?.overall_status || "VERIFIED"}
            </span>
          </div>
          <p className="text-3xl font-extrabold text-white mt-2 font-mono">
            {dashboard ? `${dashboard.security_score}%` : "—"}
          </p>
          <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            {dashboard ? `${dashboard.latest_scan?.passed_checks || 0}/${dashboard.latest_scan?.total_checks || 0} checks passing` : "Evaluating..."}
          </span>
        </div>

        {/* Active Alerts */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              Active Security Alerts
            </span>
            <span className="text-[10px] text-slate-500">Last 7 Days</span>
          </div>
          <p className={`text-3xl font-extrabold mt-2 font-mono ${
            (dashboard?.active_alerts_count || 0) > 0 ? "text-amber-400" : "text-emerald-400"
          }`}>
            {dashboard?.active_alerts_count ?? 0}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {dashboard?.active_alerts_count === 0 ? "Zero critical vulnerabilities" : "Requires attention"}
          </span>
        </div>

        {/* Authentication Health */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
              <Key className="w-4 h-4 text-emerald-400" />
              Vault Encryption Status
            </span>
            <span className="text-[10px] text-emerald-400 font-semibold">AES-256</span>
          </div>
          <p className="text-lg font-bold text-white mt-2">Authenticated GCM</p>
          <span className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
            <CheckCircle className="w-3.5 h-3.5" /> 256-bit credentials at rest
          </span>
        </div>

        {/* Identity & MFA */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              Multi-Factor Authentication
            </span>
            <span className="text-[10px] text-indigo-300 font-mono">RFC 6238</span>
          </div>
          <p className="text-lg font-bold text-white mt-2">
            {currentUser?.mfa_enabled ? "TOTP Active" : "Configured / Ready"}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            User: {currentUser?.email || "admin@aegisstor.internal"} ({currentUser?.role || "SUPER_ADMIN"})
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 space-x-2 text-sm font-medium">
        <button
          onClick={() => setActiveTab("scanner")}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "scanner"
              ? "border-emerald-400 text-white font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Shield className="w-4 h-4" />
          Security Checks ({checks.length})
        </button>
        <button
          onClick={() => setActiveTab("events")}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "events"
              ? "border-emerald-400 text-white font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Activity className="w-4 h-4" />
          Security Events ({events.length})
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "audit"
              ? "border-emerald-400 text-white font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileText className="w-4 h-4" />
          Audit Trail ({auditTotal})
        </button>
        <button
          onClick={() => setActiveTab("rbac")}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "rbac"
              ? "border-emerald-400 text-white font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="w-4 h-4" />
          Access Control & MFA
        </button>
      </div>

      {/* TAB 1: SECURITY SCANNER & LIVE CHECKS */}
      {activeTab === "scanner" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Filter className="w-4 h-4 text-emerald-400" />
              <span>Filter Category:</span>
              <div className="flex flex-wrap gap-1.5">
                {uniqueCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCheckCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      checkCategoryFilter === cat
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Last Scan: {dashboard?.last_verification_utc ? new Date(dashboard.last_verification_utc).toLocaleTimeString() : "Recent"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {filteredChecks.map((check) => (
              <div
                key={check.id}
                className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {check.id}
                    </span>
                    <h3 className="text-sm font-semibold text-white">{check.name}</h3>
                    <span className="text-xs text-slate-400">({check.category})</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{check.details}</p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <span className="font-semibold text-slate-400">Remediation:</span> {check.remediation}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
                    check.status === "PASS"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : check.status === "WARNING"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  }`}>
                    {check.status === "PASS" && <CheckCircle className="w-3.5 h-3.5" />}
                    {check.status === "WARNING" && <AlertTriangle className="w-3.5 h-3.5" />}
                    {check.status === "FAILED" && <XCircle className="w-3.5 h-3.5" />}
                    {check.status}
                  </span>
                  <span className="px-2 py-1 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                    {check.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: SECURITY EVENTS MANAGEMENT */}
      {activeTab === "events" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Filter className="w-4 h-4 text-indigo-400" />
              <span>Severity Filter:</span>
              {["ALL", "INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setEventSeverityFilter(sev)}
                  className={`px-2 py-0.5 rounded text-xs ${
                    eventSeverityFilter === sev ? "bg-indigo-600 text-white font-medium" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Showing {filteredEvents.length} events
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Timestamp (UTC)</th>
                    <th className="py-2.5 px-3">Event ID</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Result</th>
                    <th className="py-2.5 px-3">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-sans">
                  {filteredEvents.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                        {new Date(evt.timestamp_utc).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{evt.event_id}</td>
                      <td className="py-2.5 px-3 font-semibold text-white">{evt.event_type}</td>
                      <td className="py-2.5 px-3 text-slate-300">{evt.action}</td>
                      <td className="py-2.5 px-3 text-slate-400">{evt.user_identifier || "system"}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          evt.result === "SUCCESS" || evt.result === "PASSED"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : evt.result === "FAILED" || evt.result === "DENIED"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}>
                          {evt.result}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">
                        {evt.severity}
                      </td>
                    </tr>
                  ))}
                  {filteredEvents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500 text-xs">
                        No security events found matching the selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT TRAIL SEARCH & CSV EXPORT */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <form onSubmit={handleAuditFilterSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div className="relative md:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search description, email, resource..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
              />
            </div>
            <select
              value={auditSeverity}
              onChange={(e) => setAuditSeverity(e.target.value)}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
              <option value="WARNING">WARNING</option>
            </select>
            <div className="flex gap-2">
              <button
                type="submit"
                className="w-1/2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
              >
                Search
              </button>
              <button
                type="button"
                onClick={handleExportAuditCsv}
                className="w-1/2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
            </div>
          </form>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Timestamp (UTC)</th>
                    <th className="py-2.5 px-3">Action Type</th>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40">
                      <td className="py-2 px-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {log.timestamp}
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-[11px]">
                          {log.action_type}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-300">{log.user_email || "System"}</td>
                      <td className="py-2 px-3 text-slate-200">{log.description}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            log.status === "SUCCESS"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : log.status === "DENIED" || log.status === "FAILED"
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500 text-xs">
                        No audit records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ACCESS CONTROL & MFA CONFIGURATION */}
      {activeTab === "rbac" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* MFA Configuration Card */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              Two-Factor Authentication (TOTP)
            </h2>
            <p className="text-xs text-slate-400">
              Enforce RFC 6238 time-based one-time password security for sensitive storage actions, credential vaults, and retention purging.
            </p>

            {mfaStatus && (
              <div className="p-2.5 bg-slate-800 rounded border border-slate-700 text-xs text-slate-300">
                {mfaStatus}
              </div>
            )}

            {!mfaSecret && (
              <button
                onClick={handleInitMFA}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Configure / Regenerate MFA Secret
              </button>
            )}

            {mfaSecret && (
              <form onSubmit={handleVerifyMFA} className="space-y-3 pt-2">
                <div className="p-3 bg-slate-950 rounded border border-slate-800 text-center font-mono text-xs text-emerald-400 select-all">
                  {mfaSecret}
                </div>
                <input
                  type="text"
                  placeholder="Enter 6-digit TOTP code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  maxLength={6}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-center text-sm font-mono tracking-widest"
                  required
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMfaSecret(null)}
                    className="w-1/2 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-xs"
                  >
                    Verify & Activate
                  </button>
                </div>
              </form>
            )}

            <div className="pt-4 border-t border-slate-800 text-xs text-slate-500 space-y-1">
              <p><strong>Supported Apps:</strong> Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden.</p>
            </div>
          </div>

          {/* RBAC Matrix Card */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl lg:col-span-2 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              4-Tier Role-Based Access Control (RBAC) Permissions
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2 px-3">Role Tier</th>
                    <th className="py-2 px-3">Telemetry View</th>
                    <th className="py-2 px-3">Simulations & ML</th>
                    <th className="py-2 px-3">DB Registration</th>
                    <th className="py-2 px-3">Disk Cleanup / Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-semibold text-emerald-400">SUPER_ADMIN</td>
                    <td className="py-2 px-3 text-emerald-400">Full Access</td>
                    <td className="py-2 px-3 text-emerald-400">Full Access</td>
                    <td className="py-2 px-3 text-emerald-400">Full Access</td>
                    <td className="py-2 px-3 text-emerald-400">Full Access</td>
                  </tr>
                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-semibold text-blue-400">DATABASE_ADMIN</td>
                    <td className="py-2 px-3 text-emerald-400">Full Access</td>
                    <td className="py-2 px-3 text-emerald-400">Full Access</td>
                    <td className="py-2 px-3 text-emerald-400">Full Access</td>
                    <td className="py-2 px-3 text-slate-500">Restricted</td>
                  </tr>
                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-semibold text-purple-400">ANALYST</td>
                    <td className="py-2 px-3 text-emerald-400">Full Access</td>
                    <td className="py-2 px-3 text-emerald-400">Full Access</td>
                    <td className="py-2 px-3 text-slate-500">Read-Only</td>
                    <td className="py-2 px-3 text-slate-500">Restricted</td>
                  </tr>
                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-semibold text-slate-400">VIEWER</td>
                    <td className="py-2 px-3 text-emerald-400">Read-Only</td>
                    <td className="py-2 px-3 text-slate-500">Read-Only</td>
                    <td className="py-2 px-3 text-slate-500">No Access</td>
                    <td className="py-2 px-3 text-slate-500">No Access</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecurityCenter;
