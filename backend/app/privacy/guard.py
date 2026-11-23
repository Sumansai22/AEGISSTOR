"""
Privacy Guard Subsystem – Enterprise Compliance & Data Minimization
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List
from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.models.database import PrivacyPolicy, StorageTelemetry, DatabaseTelemetry, AuditLog

class PrivacyGuardService:
    def get_policy(self, org_id: int = 1) -> Dict[str, Any]:
        """Fetch active privacy policy for tenant."""
        db: Session = SessionLocal()
        try:
            p = db.query(PrivacyPolicy).filter(PrivacyPolicy.org_id == org_id).first()
            if not p:
                return {
                    "data_minimization_mode": True,
                    "mask_identifiers": True,
                    "retention_days": 30,
                    "enforce_tenant_isolation": True,
                    "credential_encryption_active": True,
                    "audit_level": "DETAILED",
                    "status": "COMPLIANT"
                }
            return {
                "data_minimization_mode": p.data_minimization_mode,
                "mask_identifiers": p.mask_identifiers,
                "retention_days": p.retention_days,
                "enforce_tenant_isolation": p.enforce_tenant_isolation,
                "credential_encryption_active": p.credential_encryption_active,
                "audit_level": p.audit_level,
                "status": "COMPLIANT"
            }
        finally:
            db.close()

    def update_policy(self, org_id: int, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update privacy controls and log to audit trail."""
        db: Session = SessionLocal()
        try:
            p = db.query(PrivacyPolicy).filter(PrivacyPolicy.org_id == org_id).first()
            if not p:
                p = PrivacyPolicy(org_id=org_id)
                db.add(p)

            if "data_minimization_mode" in updates:
                p.data_minimization_mode = bool(updates["data_minimization_mode"])
            if "mask_identifiers" in updates:
                p.mask_identifiers = bool(updates["mask_identifiers"])
            if "retention_days" in updates:
                p.retention_days = int(updates["retention_days"])
            if "audit_level" in updates:
                p.audit_level = str(updates["audit_level"])

            p.updated_at = datetime.utcnow()
            db.add(AuditLog(
                org_id=org_id,
                action_type="PRIVACY_POLICY_UPDATE",
                resource="PrivacyGuard",
                description=f"Privacy policy updated: Minimization={p.data_minimization_mode}, Retention={p.retention_days}d",
                status="SUCCESS"
            ))
            db.commit()
            return self.get_policy(org_id)
        finally:
            db.close()

    def enforce_retention_purge(self, org_id: int = 1) -> Dict[str, int]:
        """Safely purge telemetry records older than retention limit."""
        policy = self.get_policy(org_id)
        retention_days = policy.get("retention_days", 30)
        cutoff = datetime.utcnow() - timedelta(days=retention_days)

        db: Session = SessionLocal()
        purged = {"storage_records": 0, "database_records": 0}
        try:
            res_storage = db.query(StorageTelemetry).filter(
                StorageTelemetry.org_id == org_id,
                StorageTelemetry.timestamp < cutoff
            ).delete()

            res_db = db.query(DatabaseTelemetry).filter(
                DatabaseTelemetry.org_id == org_id,
                DatabaseTelemetry.timestamp < cutoff
            ).delete()

            db.commit()
            purged["storage_records"] = res_storage
            purged["database_records"] = res_db
            return purged
        except Exception as e:
            db.rollback()
            print(f"[PrivacyGuard] Purge error: {e}")
            return purged
        finally:
            db.close()

privacy_guard = PrivacyGuardService()
