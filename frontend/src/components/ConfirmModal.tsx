import React from "react";
import { AlertTriangle, X, Check, ShieldAlert } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  riskLevel: "LOW" | "MODERATE" | "HIGH";
  filePaths?: string[];
  expectedRecovery?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  riskLevel,
  filePaths = [],
  expectedRecovery,
  onConfirm,
  onCancel,
  isProcessing = false
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
      padding: "20px"
    }}>
      <div style={{
        backgroundColor: "#0f172a",
        border: "1px solid #334155",
        borderRadius: "12px",
        width: "100%",
        maxWidth: "580px",
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
        overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              background: "rgba(245, 158, 11, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <ShieldAlert size={18} color="#f59e0b" />
            </div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "#f8fafc" }}>
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            disabled={isProcessing}
            style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "20px" }}>
          <p style={{ fontSize: "0.88rem", color: "#cbd5e1", marginBottom: "16px", lineHeight: 1.6 }}>
            {message}
          </p>

          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginBottom: "16px",
            background: "#070b14",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #1e293b"
          }}>
            <div>
              <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Safety Risk Level</span>
              <p style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                color: riskLevel === "LOW" ? "#34d399" : riskLevel === "MODERATE" ? "#fbbf24" : "#f87171"
              }}>
                {riskLevel}
              </p>
            </div>
            {expectedRecovery && (
              <div>
                <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Estimated Capacity Recovery</span>
                <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "#38bdf8" }}>
                  {expectedRecovery}
                </p>
              </div>
            )}
          </div>

          {filePaths && filePaths.length > 0 && (
            <div>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Target Review Item ({filePaths.length} items to be processed):
              </span>
              <div style={{
                maxHeight: "140px",
                overflowY: "auto",
                background: "#070b14",
                border: "1px solid #1e293b",
                borderRadius: "6px",
                padding: "8px",
                fontSize: "0.75rem",
                fontFamily: "monospace",
                color: "#94a3b8"
              }}>
                {filePaths.slice(0, 15).map((p, i) => (
                  <div key={i} style={{ padding: "3px 0", borderBottom: "1px solid #111b2e", wordBreak: "break-all" }}>
                    {p}
                  </div>
                ))}
                {filePaths.length > 15 && (
                  <div style={{ color: "#64748b", fontStyle: "italic", paddingTop: "4px" }}>
                    + {filePaths.length - 15} additional items...
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{
            marginTop: "16px",
            padding: "10px 12px",
            borderRadius: "6px",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            fontSize: "0.78rem",
            color: "#fca5a5",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>Windows system directories and protected files are permanently safeguarded. This operation is logged to the system audit trail.</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 20px",
          background: "#070b14",
          borderTop: "1px solid #1e293b",
          display: "flex",
          justifyContent: "flex-end",
          gap: "10px"
        }}>
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="btn"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className="btn btn-danger"
          >
            <Check size={14} />
            <span>{isProcessing ? "Processing..." : "Confirm & Execute"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
