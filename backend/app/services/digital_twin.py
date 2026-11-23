"""
Digital Twin Storage Simulation Service
"""
import math
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from app.services.storage_monitor import storage_monitor
from app.models.database import SimulationResult, AuditLog
from app.database.session import SessionLocal

class DigitalTwinService:
    def __init__(self):
        pass

    def run_simulation(
        self,
        drive_name: str,
        monthly_growth_rate_percent: float = 0.0,
        removed_unnecessary_files_gb: float = 0.0,
        capacity_expansion_gb: float = 0.0,
        continuation_days: int = 90,
        scenario_title: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Simulate storage scenarios on a digital twin representation of the selected drive.
        Computes projected capacity, usage %, runway timeline, and risk level shift.
        """
        drives = storage_monitor.get_all_drives()
        matched = next((d for d in drives if drive_name in d["device"] or drive_name in d["mountpoint"]), None)
        if not matched and drives:
            matched = drives[0]

        if not matched:
            raise ValueError(f"Drive {drive_name} not found.")

        current_total = matched["total_bytes"]
        current_used = matched["used_bytes"]
        current_free = matched["free_bytes"]
        current_pct = matched["usage_percent"]
        actual_drive = matched["device"]

        # Current risk classification
        current_risk = "LOW"
        if current_pct >= 90.0:
            current_risk = "CRITICAL"
        elif current_pct >= 80.0:
            current_risk = "HIGH"
        elif current_pct >= 65.0:
            current_risk = "MODERATE"

        # Apply interventions to digital twin model
        sim_total = current_total + (capacity_expansion_gb * (1024 ** 3))
        # Deduct removed files
        initial_sim_used = max(0.0, current_used - (removed_unnecessary_files_gb * (1024 ** 3)))

        # Growth calculation
        # Monthly growth percentage compounded or applied linearly over continuation_days
        monthly_factor = 1.0 + (monthly_growth_rate_percent / 100.0)
        daily_growth_factor = (monthly_factor ** (1.0 / 30.0)) - 1.0 if monthly_factor > 0 else 0.0

        timeline = []
        now = datetime.utcnow()
        running_used = initial_sim_used
        exhaustion_day: Optional[int] = None

        step_days = max(1, continuation_days // 10)
        for d in range(0, continuation_days + 1, step_days):
            date_label = (now + timedelta(days=d)).strftime("%Y-%m-%d")
            # Projected used at day d
            if monthly_growth_rate_percent != 0.0:
                running_used = initial_sim_used * ((1.0 + daily_growth_factor) ** d)
            else:
                running_used = initial_sim_used

            running_used_capped = min(sim_total, running_used)
            pct = (running_used_capped / sim_total * 100.0) if sim_total > 0 else 0.0
            free_gb = max(0.0, sim_total - running_used_capped) / (1024 ** 3)

            timeline.append({
                "day": d,
                "date": date_label,
                "projected_used_gb": round(running_used_capped / (1024 ** 3), 2),
                "projected_free_gb": round(free_gb, 2),
                "projected_usage_percent": round(pct, 2)
            })

            if running_used >= sim_total and exhaustion_day is None:
                exhaustion_day = d

        projected_used_final = min(sim_total, running_used)
        projected_free_final = max(0.0, sim_total - projected_used_final)
        projected_pct_final = (projected_used_final / sim_total * 100.0) if sim_total > 0 else 0.0

        # Projected risk classification
        projected_risk = "LOW"
        if projected_pct_final >= 90.0:
            projected_risk = "CRITICAL"
        elif projected_pct_final >= 80.0:
            projected_risk = "HIGH"
        elif projected_pct_final >= 65.0:
            projected_risk = "MODERATE"

        # Days to exhaustion
        days_to_exhaustion = None
        exhaustion_date_str = "Safe (> 1 year)"
        if exhaustion_day is not None:
            days_to_exhaustion = float(exhaustion_day)
            exhaustion_date_str = (now + timedelta(days=exhaustion_day)).strftime("%Y-%m-%d")
        elif monthly_growth_rate_percent > 0:
            # Estimate mathematically
            free_target = sim_total - initial_sim_used
            if free_target > 0 and daily_growth_factor > 0:
                days_calc = math.log(sim_total / max(initial_sim_used, 1.0)) / math.log(1.0 + daily_growth_factor)
                if days_calc <= 365:
                    days_to_exhaustion = round(days_calc, 1)
                    exhaustion_date_str = (now + timedelta(days=int(days_calc))).strftime("%Y-%m-%d")

        # Summary notes
        notes = []
        if removed_unnecessary_files_gb > 0:
            notes.append(f"Purging {removed_unnecessary_files_gb:.1f} GB recovers instant headroom and reduces risk immediately.")
        if capacity_expansion_gb > 0:
            notes.append(f"Adding {capacity_expansion_gb:.1f} GB partition capacity expands total volume to {sim_total / (1024 ** 3):.1f} GB.")
        if monthly_growth_rate_percent > 0:
            notes.append(f"At +{monthly_growth_rate_percent:.1f}% monthly compound growth, usage trends to {projected_pct_final:.1f}% by day {continuation_days}.")
        else:
            notes.append("Growth rate held static. Baseline retention maintained.")

        if current_risk != projected_risk:
            risk_summary = f"Risk rating transitions from {current_risk} -> {projected_risk} under this simulated condition."
        else:
            risk_summary = f"Risk rating remains {current_risk} throughout the simulated period."

        title = scenario_title or f"Custom Simulation on {actual_drive}"

        result_payload = {
            "scenario_name": title,
            "drive_name": actual_drive,
            "current_total_bytes": current_total,
            "current_used_bytes": current_used,
            "current_free_bytes": current_free,
            "current_usage_percent": current_pct,
            "current_risk": current_risk,

            "projected_total_bytes": sim_total,
            "projected_used_bytes": projected_used_final,
            "projected_free_bytes": projected_free_final,
            "projected_usage_percent": round(projected_pct_final, 2),
            "projected_risk": projected_risk,

            "days_to_exhaustion": days_to_exhaustion,
            "estimated_exhaustion_date": exhaustion_date_str,
            "risk_change_summary": risk_summary,
            "simulation_notes": notes,
            "timeline_projection": timeline
        }

        # Persist simulation result to SQLite
        db = SessionLocal()
        try:
            entry = SimulationResult(
                scenario_name=title,
                drive_name=actual_drive,
                input_params_json=json.dumps({
                    "monthly_growth": monthly_growth_rate_percent,
                    "removed_gb": removed_unnecessary_files_gb,
                    "expansion_gb": capacity_expansion_gb,
                    "days": continuation_days
                }),
                projected_usage_percent=projected_pct_final,
                projected_free_bytes=projected_free_final,
                days_to_exhaustion=days_to_exhaustion,
                risk_before=current_risk,
                risk_after=projected_risk,
                summary_text=risk_summary
            )
            db.add(entry)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[DigitalTwin] Error saving: {e}")
        finally:
            db.close()

        return result_payload

digital_twin_service = DigitalTwinService()
