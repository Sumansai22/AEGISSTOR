import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { ConfirmModal } from "./components/ConfirmModal";

// Eagerly loaded primary landing view for instant First Contentful Paint
import { OverviewDashboard } from "./pages/OverviewDashboard";

// Lazy-loaded secondary & compute-heavy pages with code splitting
const StorageMonitoring = lazy(() => import("./pages/StorageMonitoring").then(m => ({ default: m.StorageMonitoring })));
const StorageAnalyzer = lazy(() => import("./pages/StorageAnalyzer").then(m => ({ default: m.StorageAnalyzer })));
const MLForecasting = lazy(() => import("./pages/MLForecasting").then(m => ({ default: m.MLForecasting })));
const CapacityAnalytics = lazy(() => import("./pages/CapacityAnalytics").then(m => ({ default: m.CapacityAnalytics })));
const RiskManagement = lazy(() => import("./pages/RiskManagement").then(m => ({ default: m.RiskManagement })));
const SystemPerformance = lazy(() => import("./pages/SystemPerformance").then(m => ({ default: m.SystemPerformance })));
const DatabaseIntelligence = lazy(() => import("./pages/DatabaseIntelligence").then(m => ({ default: m.DatabaseIntelligence })));
const SecurityCenter = lazy(() => import("./pages/SecurityCenter").then(m => ({ default: m.SecurityCenter })));
const PrivacyGuard = lazy(() => import("./pages/PrivacyGuard").then(m => ({ default: m.PrivacyGuard })));
const OptimizationRecommendations = lazy(() => import("./pages/OptimizationRecommendations").then(m => ({ default: m.OptimizationRecommendations })));
const DigitalTwinSimulation = lazy(() => import("./pages/DigitalTwinSimulation").then(m => ({ default: m.DigitalTwinSimulation })));
const HistoricalReports = lazy(() => import("./pages/HistoricalReports").then(m => ({ default: m.HistoricalReports })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const AWSCloudStorage = lazy(() => import("./pages/AWSCloudStorage").then(m => ({ default: m.AWSCloudStorage })));
const IncidentManagement = lazy(() => import("./pages/IncidentManagement").then(m => ({ default: m.IncidentManagement })));
const NotificationCenter = lazy(() => import("./pages/NotificationCenter").then(m => ({ default: m.NotificationCenter })));
const SystemUpdates = lazy(() => import("./pages/SystemUpdates").then(m => ({ default: m.SystemUpdates })));

// Fallback spinner for lazy chunk resolution
const ModuleFallback: React.FC = () => (
  <div style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "420px",
    gap: "14px",
    color: "#94a3b8"
  }}>
    <div style={{
      width: "36px",
      height: "36px",
      border: "3px solid rgba(59, 130, 246, 0.15)",
      borderTopColor: "#3b82f6",
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite"
    }} />
    <span style={{ fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.4px" }}>
      Loading Module...
    </span>
  </div>
);

// Services & Types
import {
  fetchHealth,
  fetchSystemInfo,
  fetchStorageSummary,
  fetchPerformanceCurrent,
  fetchRisks,
  fetchForecast,
  triggerForecastCalibrationSeed,
  fetchRecommendations,
  applyOptimizationAction,
  triggerScan,
  fetchScanStatus,
  fetchLatestScan,
  runSimulation,
  fetchHistory,
  fetchAuditLogs,
  fetchAWSStatus
} from "./services/api";

import {
  StorageSummary,
  SystemInfo,
  PerformanceCurrent,
  RiskSummary,
  ForecastResponse,
  OptimizationRecommendationItem,
  ScanSummary,
  SimulationResult,
  AuditLogItem,
  BackendHealthStatus,
  AWSConnectionStatus
} from "./types";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [backendHealth, setBackendHealth] = useState<BackendHealthStatus | null>(null);
  const [awsStatus, setAwsStatus] = useState<AWSConnectionStatus | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Core Data
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [performance, setPerformance] = useState<PerformanceCurrent | null>(null);
  const [risks, setRisks] = useState<RiskSummary | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [recommendations, setRecommendations] = useState<OptimizationRecommendationItem[]>([]);
  const [scanResult, setScanResult] = useState<ScanSummary | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [currentSimulation, setCurrentSimulation] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);

  // Safety Confirmation Modal
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [selectedRec, setSelectedRec] = useState<OptimizationRecommendationItem | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  const isRefreshingRef = React.useRef(false);

  // AWS status fetcher (called on load, on refresh, and every 60s)
  const refreshAWS = useCallback(async () => {
    try {
      const s = await fetchAWSStatus();
      setAwsStatus(s);
      return s;
    } catch {
      setAwsStatus((prev) => (prev ? { ...prev, connected: false, status: "DISCONNECTED" } : null));
      return null;
    }
  }, []);

  // Local telemetry fetcher (called every 5s - non-blocking fast Win32 queries)
  const refreshLocal = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      // 1. Backend health probe
      fetchHealth()
        .then((h) => {
          setBackendHealth(h);
          setIsConnected(h?.status === "healthy");
        })
        .catch(() => {
          setIsConnected(false);
        });

      // 2. Local telemetry probes
      const [storageData, perfData, riskData, recData] = await Promise.all([
        fetchStorageSummary().catch(() => null),
        fetchPerformanceCurrent().catch(() => null),
        fetchRisks().catch(() => null),
        fetchRecommendations().catch(() => [])
      ]);

      if (storageData) setStorage(storageData);
      if (perfData) setPerformance(perfData);
      if (riskData) setRisks(riskData);
      if (recData) setRecommendations(recData);

      const now = new Date();
      setLastUpdated(now.toLocaleTimeString());
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // Unified refresh for manual button click
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshLocal(),
        refreshAWS()
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshLocal, refreshAWS]);

  // Initial load & decoupled polling loops
  useEffect(() => {
    fetchSystemInfo().then(setSystemInfo).catch(() => {});
    fetchForecast().then(setForecast).catch(() => {});
    fetchLatestScan().then(setScanResult).catch(() => {});
    fetchHistory(24).then(setHistoryData).catch(() => {});
    fetchAuditLogs(50).then(setAuditLogs).catch(() => {});

    // Initial triggers
    refreshLocal();
    refreshAWS();

    // 5-second live telemetry interval for local hardware
    const localInterval = setInterval(() => {
      refreshLocal();
    }, 5000);

    // 60-second polling for external AWS status
    const awsInterval = setInterval(() => {
      refreshAWS();
    }, 60000);

    return () => {
      clearInterval(localInterval);
      clearInterval(awsInterval);
    };
  }, [refreshLocal, refreshAWS]);

  // Handle Scan Trigger
  const handleStartScan = async (path: string) => {
    setIsScanning(true);
    try {
      await triggerScan(path);
      // Poll scan status until completed
      const pollTimer = setInterval(async () => {
        const status = await fetchScanStatus();
        if (!status.is_scanning) {
          clearInterval(pollTimer);
          setIsScanning(false);
          const latest = await fetchLatestScan();
          setScanResult(latest);
          // Refresh recommendations after scan
          fetchRecommendations().then(setRecommendations);
          fetchAuditLogs().then(setAuditLogs);
        }
      }, 1500);
    } catch (err) {
      setIsScanning(false);
      alert("Failed to initiate scan: " + (err as any).message);
    }
  };

  // Handle Simulation Run
  const handleRunSimulation = async (params: any) => {
    setIsSimulating(true);
    try {
      const res = await runSimulation(params);
      setCurrentSimulation(res);
      fetchAuditLogs().then(setAuditLogs);
    } catch (err) {
      alert("Simulation error: " + (err as any).message);
    } finally {
      setIsSimulating(false);
    }
  };

  // Handle Calibration Seed for ML
  const handleTriggerCalibration = async () => {
    setIsCalibrating(true);
    try {
      await triggerForecastCalibrationSeed();
      const updated = await fetchForecast();
      setForecast(updated);
      fetchAuditLogs().then(setAuditLogs);
    } catch (err) {
      alert("Calibration failed: " + (err as any).message);
    } finally {
      setIsCalibrating(false);
    }
  };

  // Modal Execution
  const handleConfirmAction = async () => {
    if (!selectedRec) return;
    setIsProcessingAction(true);
    try {
      const res = await applyOptimizationAction(
        selectedRec.id,
        true,
        selectedRec.target_paths
      );
      setModalOpen(false);
      setSelectedRec(null);
      // Refresh telemetry & recommendations
      refreshAll();
      fetchRecommendations().then(setRecommendations);
      fetchAuditLogs().then(setAuditLogs);
      alert(res.message);
    } catch (err) {
      alert("Action execution failed: " + (err as any).message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        alertCount={risks?.active_alerts_count || 0}
        recommendationCount={recommendations.filter(r => r.status === "PENDING").length}
      />

      {/* Main View Area */}
      <div className="main-content">
        <Navbar
          systemInfo={systemInfo}
          isConnected={isConnected}
          backendHealth={backendHealth}
          awsStatus={awsStatus}
          lastUpdated={lastUpdated}
          onRefresh={refreshAll}
          isRefreshing={isRefreshing}
          onNavigate={setActiveTab}
        />

        <main style={{ flex: 1, paddingBottom: "40px" }}>
          {activeTab === "overview" && (
            <OverviewDashboard
              storage={storage}
              performance={performance}
              risks={risks}
              forecast={forecast}
              recommendations={recommendations}
              onNavigate={setActiveTab}
            />
          )}

          <Suspense fallback={<ModuleFallback />}>
            {activeTab === "monitoring" && (
              <StorageMonitoring
                drives={storage?.drives || []}
                onRefresh={refreshAll}
                isRefreshing={isRefreshing}
              />
            )}

            {activeTab === "aws_storage" && (
              <AWSCloudStorage />
            )}

            {activeTab === "analyzer" && (
              <StorageAnalyzer
                scanResult={scanResult}
                isScanning={isScanning}
                onStartScan={handleStartScan}
                onRequestCleanup={(recId, paths, benefit) => {
                  setSelectedRec({
                    id: recId,
                    timestamp: new Date().toISOString(),
                    drive_name: scanResult?.target_path || "C:",
                    category: recId === 1 ? "TEMP_FILES" : "DUPLICATES",
                    issue: `User cleanup proposal for ${paths.length} items.`,
                    expected_benefit: benefit,
                    estimated_recovery_bytes: 0,
                    estimated_recovery_formatted: benefit,
                    risk_level: "LOW",
                    recommended_action: "Review paths and confirm safe removal.",
                    target_paths: paths,
                    status: "PENDING"
                  });
                  setModalOpen(true);
                }}
              />
            )}

            {activeTab === "forecasting" && (
              <MLForecasting />
            )}

            {activeTab === "capacity" && (
              <CapacityAnalytics />
            )}

            {activeTab === "databases" && (
              <DatabaseIntelligence />
            )}

            {activeTab === "security" && (
              <SecurityCenter />
            )}

            {activeTab === "privacy" && (
              <PrivacyGuard />
            )}

            {activeTab === "risks" && (
              <RiskManagement
                risks={risks}
                drives={storage?.drives || []}
                onNavigateToOptimization={() => setActiveTab("optimization")}
              />
            )}

            {activeTab === "performance" && (
              <SystemPerformance
                performance={performance}
                onRefresh={refreshAll}
                isRefreshing={isRefreshing}
              />
            )}

            {activeTab === "optimization" && (
              <OptimizationRecommendations
                recommendations={recommendations}
                auditLogs={auditLogs}
                onRequestAction={(rec) => {
                  setSelectedRec(rec);
                  setModalOpen(true);
                }}
                onRefresh={() => fetchRecommendations().then(setRecommendations)}
              />
            )}

            {activeTab === "digital_twin" && (
              <DigitalTwinSimulation
                drives={storage?.drives || []}
                currentSimulation={currentSimulation}
                onRunSimulation={handleRunSimulation}
                isRunning={isSimulating}
              />
            )}

            {activeTab === "reports" && (
              <HistoricalReports
                historyData={historyData}
                onTimeRangeChange={(hrs) => fetchHistory(hrs).then(setHistoryData)}
              />
            )}

            {activeTab === "settings" && (
              <SettingsPage />
            )}

            {activeTab === "incidents" && (
              <IncidentManagement />
            )}

            {activeTab === "notifications" && (
              <NotificationCenter onNavigateToIncident={() => setActiveTab("incidents")} />
            )}

            {activeTab === "system_updates" && (
              <SystemUpdates />
            )}
          </Suspense>
        </main>
      </div>

      {/* Confirmation Safety Modal */}
      {selectedRec && (
        <ConfirmModal
          isOpen={modalOpen}
          title={`Confirm Safety Action: ${selectedRec.category.replace("_", " ")}`}
          message={`You are about to execute a safe cleanup operation. ${selectedRec.recommended_action}`}
          riskLevel={selectedRec.risk_level}
          expectedRecovery={selectedRec.estimated_recovery_formatted}
          filePaths={selectedRec.target_paths}
          onConfirm={handleConfirmAction}
          onCancel={() => {
            setModalOpen(false);
            setSelectedRec(null);
          }}
          isProcessing={isProcessingAction}
        />
      )}
    </div>
  );
};

export default App;
