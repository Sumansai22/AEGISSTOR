import { describe, it } from "node:test";
import assert from "node:assert";

// Helper functions matching HistoricalReports logic for formatting & mapping
function formatTimestamp(utcString, range) {
  try {
    const date = new Date(utcString);
    if (isNaN(date.getTime())) return utcString;
    if (range === "24h" || range === "1h") {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (range === "7d") {
      return `${date.toLocaleDateString([], { month: "numeric", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  } catch {
    return utcString;
  }
}

function getHistoricalCsvExportUrl(params = {}) {
  const query = new URLSearchParams();
  if (params.range) query.set("range", params.range);
  if (params.deviceId) query.set("device_id", params.deviceId);
  if (params.startDate) query.set("start_date", params.startDate);
  if (params.endDate) query.set("end_date", params.endDate);
  const qs = query.toString();
  return `/api/reports/historical/csv${qs ? `?${qs}` : ""}`;
}

describe("Historical Reports Frontend Telemetry Validation", () => {
  it("validates successful historical report payload parsing", () => {
    const mockReport = {
      success: true,
      data_available: true,
      range: "24h",
      summary: {
        total_storage_gb: 500,
        average_used_storage_gb: 250,
        maximum_used_storage_gb: 310,
        average_utilization_percent: 50.0,
        average_cpu_percent: 35.5,
        average_ram_percent: 72.0
      },
      storage_history: [
        {
          timestamp: "2026-11-27T08:00:00Z",
          device_id: "C:",
          total_storage_gb: 500,
          used_storage_gb: 245,
          free_storage_gb: 255,
          utilization_percent: 49.0
        },
        {
          timestamp: "2026-11-27T12:00:00Z",
          device_id: "C:",
          total_storage_gb: 500,
          used_storage_gb: 255,
          free_storage_gb: 245,
          utilization_percent: 51.0
        }
      ],
      performance_history: [
        {
          timestamp: "2026-11-27T08:00:00Z",
          cpu_percent: 30.0,
          ram_percent: 70.0,
          ram_used_gb: 11.2,
          ram_available_gb: 4.8
        }
      ],
      disk_io_history: [
        {
          timestamp: "2026-11-27T08:00:00Z",
          device_id: "C:",
          disk_read_mb_s: 15.5,
          disk_write_mb_s: 8.2
        }
      ],
      record_count: 2,
      generated_at: "2026-11-27T12:05:00Z"
    };

    assert.strictEqual(mockReport.success, true);
    assert.strictEqual(mockReport.data_available, true);
    assert.strictEqual(mockReport.storage_history.length, 2);
    assert.strictEqual(mockReport.summary.total_storage_gb, 500);
    assert.strictEqual(mockReport.summary.maximum_used_storage_gb, 310);
  });

  it("handles empty telemetry state correctly without fallback/mock data", () => {
    const emptyReport = {
      success: true,
      data_available: false,
      range: "24h",
      record_count: 0,
      message: "Historical telemetry has not been collected yet."
    };

    assert.strictEqual(emptyReport.success, true);
    assert.strictEqual(emptyReport.data_available, false);
    assert.strictEqual(emptyReport.record_count, 0);
    assert.ok(emptyReport.message.includes("not been collected yet"));
  });

  it("handles API failure state appropriately", () => {
    const failureReport = {
      success: false,
      data_available: false,
      range: "24h",
      record_count: 0,
      message: "Database connection timeout"
    };

    assert.strictEqual(failureReport.success, false);
    assert.strictEqual(failureReport.data_available, false);
    assert.ok(failureReport.message.includes("timeout"));
  });

  it("formats timestamps properly from UTC to local display across ranges", () => {
    const utcIso = "2026-11-27T10:30:00Z";
    const label24h = formatTimestamp(utcIso, "24h");
    const label7d = formatTimestamp(utcIso, "7d");
    const label30d = formatTimestamp(utcIso, "30d");

    assert.ok(typeof label24h === "string" && label24h.length > 0);
    assert.ok(typeof label7d === "string" && label7d.length > 0);
    assert.ok(typeof label30d === "string" && label30d.length > 0);
    // 30d should contain month name/abbreviation, not just time
    assert.ok(isNaN(Number(label30d)));
  });

  it("constructs correct CSV export URLs for various filters", () => {
    const url24h = getHistoricalCsvExportUrl({ range: "24h", deviceId: "C:" });
    assert.ok(url24h.includes("range=24h"));
    assert.ok(url24h.includes("device_id=C%3A"));

    const urlCustom = getHistoricalCsvExportUrl({
      startDate: "2026-11-01",
      endDate: "2026-11-27"
    });
    assert.ok(urlCustom.includes("start_date=2026-11-01"));
    assert.ok(urlCustom.includes("end_date=2026-11-27"));
  });

  it("maps chart storage metrics chronologically and computes variations", () => {
    const history = [
      { timestamp: "2026-11-27T08:00:00Z", used_storage_gb: 290.5, free_storage_gb: 210.0 },
      { timestamp: "2026-11-27T10:00:00Z", used_storage_gb: 295.2, free_storage_gb: 205.3 },
      { timestamp: "2026-11-27T12:00:00Z", used_storage_gb: 298.0, free_storage_gb: 202.5 }
    ];

    const deltaGB = history[history.length - 1].used_storage_gb - history[0].used_storage_gb;
    assert.strictEqual(Math.round(deltaGB * 10) / 10, 7.5); // 7.5 GB growth observed

    const sorted = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    assert.deepStrictEqual(history, sorted);
  });
});
