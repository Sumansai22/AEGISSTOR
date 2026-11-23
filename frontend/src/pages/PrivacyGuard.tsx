import React, { useState, useEffect } from "react";
import {
  Lock,
  EyeOff,
  Trash2,
  FileCheck,
  CheckCircle2,
  Clock,
  Save,
  RefreshCw,
  Info
} from "lucide-react";
import {
  fetchPrivacyPolicy,
  updatePrivacyPolicy,
  triggerRetentionPurge
} from "../services/api";

export const PrivacyGuard: React.FC = () => {
  const [policy, setPolicy] = useState<any>({
    data_minimization_mode: true,
    mask_identifiers: true,
    retention_days: 30,
    enforce_tenant_isolation: true
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showPurgeModal, setShowPurgeModal] = useState<boolean>(false);

  const loadPolicy = async () => {
    setLoading(true);
    try {
      const data = await fetchPrivacyPolicy();
      setPolicy(data);
    } catch {
      // Default fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPolicy();
  }, []);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updatePrivacyPolicy(policy);
      setStatusMsg("Privacy and retention policy updated successfully.");
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    }
  };

  const handleExecutePurge = async () => {
    setShowPurgeModal(false);
    setStatusMsg("Executing automated retention purge...");
    try {
      const res = await triggerRetentionPurge();
      setStatusMsg(`Retention purge complete: ${res.purged_telemetry_records} telemetry records purged.`);
    } catch (err: any) {
      setStatusMsg(`Purge error: ${err.message}`);
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Lock className="w-7 h-7 text-emerald-400" />
            Privacy Guard & Enterprise Compliance
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Data minimization governance, cryptographic identifier masking, and scheduled telemetry lifecycle purging.
          </p>
        </div>
        <button
          onClick={() => loadPolicy()}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm border border-slate-700 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {statusMsg && (
        <div className="p-3 bg-emerald-900/40 border border-emerald-500/40 rounded-lg text-emerald-200 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {statusMsg}
        </div>
      )}

      {/* Compliance Guarantee Badges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
            <FileCheck className="w-4 h-4" />
            HIPAA Privacy & Security Rules
          </div>
          <p className="text-sm text-slate-200 mt-2 font-medium">Zero PHI Ingestion</p>
          <p className="text-xs text-slate-400 mt-1">
            Complies with 45 CFR § 164.312 by strictly querying system catalog tables and disk extent allocations. No medical records or patient charts are accessed.
          </p>
        </div>

        <div className="p-4 bg-blue-950/30 border border-blue-500/30 rounded-xl">
          <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold">
            <EyeOff className="w-4 h-4" />
            GDPR Data Minimization
          </div>
          <p className="text-sm text-slate-200 mt-2 font-medium">Article 5(1)(c) Compliance</p>
          <p className="text-xs text-slate-400 mt-1">
            Collects solely operational byte capacities and disk I/O frequencies. Personal identifiers are hashed and masked before persistence.
          </p>
        </div>

        <div className="p-4 bg-purple-950/30 border border-purple-500/30 rounded-xl">
          <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold">
            <Lock className="w-4 h-4" />
            Zero-Cloud Boundary
          </div>
          <p className="text-sm text-slate-200 mt-2 font-medium">Local Windows 11 Sovereignty</p>
          <p className="text-xs text-slate-400 mt-1">
            All telemetry remains on localhost. No outbound network beacons, telemetry tracking, or external cloud storage dependencies exist.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Policy Configuration Form */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Save className="w-4 h-4 text-emerald-400" />
            Data Lifecycle & Anonymization Policy
          </h2>
          <form onSubmit={handleSavePolicy} className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
              <div>
                <span className="font-semibold text-slate-200 block">Strict Metadata-Only Mode</span>
                <span className="text-slate-400 text-[11px]">Enforce read-only catalog scanning without file content inspection</span>
              </div>
              <input
                type="checkbox"
                checked={policy.data_minimization_mode}
                onChange={(e) => setPolicy({ ...policy, data_minimization_mode: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
              <div>
                <span className="font-semibold text-slate-200 block">Mask System Identifiers</span>
                <span className="text-slate-400 text-[11px]">Anonymize usernames, hostnames, and table identifiers in audit logs</span>
              </div>
              <input
                type="checkbox"
                checked={policy.mask_identifiers}
                onChange={(e) => setPolicy({ ...policy, mask_identifiers: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
              <div>
                <span className="font-semibold text-slate-200 block">Enforce Tenant Isolation</span>
                <span className="text-slate-400 text-[11px]">Strict multi-tenant organization boundary validation on all queries</span>
              </div>
              <input
                type="checkbox"
                checked={policy.enforce_tenant_isolation}
                onChange={(e) => setPolicy({ ...policy, enforce_tenant_isolation: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
            </div>

            <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/50 space-y-2">
              <label className="font-semibold text-slate-200 block">
                Telemetry Retention Period (Days)
              </label>
              <input
                type="number"
                min={7}
                max={365}
                value={policy.retention_days}
                onChange={(e) => setPolicy({ ...policy, retention_days: parseInt(e.target.value) || 30 })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
              />
              <span className="text-slate-400 text-[11px] block">
                Telemetry records older than {policy.retention_days} days are scheduled for automatic purge to preserve local disk space.
              </span>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
            >
              Update Policy
            </button>
          </form>
        </div>

        {/* Data Purge & Verification Panel */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-400" />
            Compliance Data Purge Execution
          </h2>
          <p className="text-xs text-slate-400">
            Execute an immediate cryptographic retention purge. This securely deletes historical telemetry points exceeding the retention threshold from SQLite.
          </p>

          <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>Retention Cutoff: Records older than <strong>{policy.retention_days} days</strong></span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Info className="w-4 h-4 text-emerald-400" />
              <span>Safety Guarantee: Machine learning calibration models remain intact.</span>
            </div>

            <button
              onClick={() => setShowPurgeModal(true)}
              className="w-full py-2 bg-rose-600/80 hover:bg-rose-600 text-white font-medium rounded-lg text-xs transition-colors mt-2"
            >
              Run Retention Purge Now
            </button>
          </div>

          <div className="pt-3 border-t border-slate-800 text-xs text-slate-400 space-y-2">
            <h3 className="font-semibold text-white text-xs">Compliance Audit Summary</h3>
            <ul className="list-disc pl-4 space-y-1 text-slate-400 text-[11px]">
              <li>Storage Telemetry: Masked metadata only</li>
              <li>Database Credentials: AES-256 Fernet encrypted in SQLite</li>
              <li>Audit Logs: Timestamped, immutable, user-attributed</li>
              <li>Multi-Tenancy: Scoped by Organization ID</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              Confirm Telemetry Purge
            </h3>
            <p className="text-xs text-slate-300">
              Are you sure you want to purge all telemetry samples older than {policy.retention_days} days? This action permanently frees local disk space.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPurgeModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleExecutePurge}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg text-xs"
              >
                Confirm Purge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PrivacyGuard;
