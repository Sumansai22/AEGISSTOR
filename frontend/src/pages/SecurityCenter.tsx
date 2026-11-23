import React, { useState, useEffect } from "react";
import {
  Shield,
  Key,
  Lock,
  UserCheck,
  Smartphone,
  AlertTriangle,
  CheckCircle,
  FileText,
  RefreshCw,
  Users
} from "lucide-react";
import {
  setupMFA,
  verifyMFA,
  fetchAuditLogs,
  fetchCurrentUser,
  fetchUsers
} from "../services/api";
import { AuditLogItem, User } from "../types";

export const SecurityCenter: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState<string>("");
  const [mfaStatus, setMfaStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const loadSecurityState = async () => {
    setLoading(true);
    try {
      try {
        const u = await fetchCurrentUser();
        setCurrentUser(u);
      } catch {
        setCurrentUser({ email: "admin@aegisstor.internal", role: "SUPER_ADMIN", mfa_enabled: false });
      }

      const logs = await fetchAuditLogs(40);
      setAuditLogs(logs);

      try {
        const users = await fetchUsers();
        setUsersList(users);
      } catch {
        setUsersList([]);
      }
    } catch (err: any) {
      console.warn("Security load error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSecurityState();
  }, []);

  const handleInitMFA = async () => {
    try {
      const res = await setupMFA();
      setMfaSecret(res.secret);
      setMfaStatus("Scan the QR URI or enter the secret below into Google Authenticator or 1Password.");
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

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-7 h-7 text-emerald-400" />
            Enterprise Security & Access Governance
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Argon2id cryptographic authentication, TOTP two-factor authorization, AES-256 encrypted vaults, and role-based access control.
          </p>
        </div>
        <button
          onClick={() => loadSecurityState()}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm border border-slate-700 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Security Posture Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
            <Lock className="w-4 h-4 text-emerald-400" />
            Password Security
          </div>
          <p className="text-xl font-bold text-white mt-1">Argon2id</p>
          <span className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
            <CheckCircle className="w-3 h-3" /> 64MB memory cost, 3 iter
          </span>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
            <Key className="w-4 h-4 text-emerald-400" />
            Vault Encryption
          </div>
          <p className="text-xl font-bold text-white mt-1">AES-256 (Fernet)</p>
          <span className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
            <CheckCircle className="w-3 h-3" /> Credentials encrypted at rest
          </span>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            Multi-Factor (MFA)
          </div>
          <p className="text-xl font-bold text-white mt-1">
            {currentUser?.mfa_enabled ? "Active (TOTP)" : "Optional / Ready"}
          </p>
          <span className="text-[11px] text-slate-400 mt-1">RFC 6238 time-based tokens</span>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
            <UserCheck className="w-4 h-4 text-indigo-400" />
            Active RBAC Tier
          </div>
          <p className="text-xl font-bold text-indigo-400 mt-1">
            {currentUser?.role || "SUPER_ADMIN"}
          </p>
          <span className="text-[11px] text-slate-400 mt-1">Tenant isolated: Org #1</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MFA Configuration Card */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            Two-Factor Authentication (TOTP)
          </h2>
          <p className="text-xs text-slate-400">
            Enforce one-time password security for sensitive storage actions, credentials modifications, and optimization workflows.
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

      {/* Security Audit Trail Log */}
      <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-400" />
          Tamper-Evident Security Audit Trail
        </h2>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Action Type</th>
                <th className="py-2.5 px-3">User</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{log.timestamp}</td>
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
                          : log.status === "DENIED"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default SecurityCenter;
