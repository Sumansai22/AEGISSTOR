"""
Enterprise Database Telemetry Collector Service
"""
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.models.database import DatabaseConnection, DatabaseTelemetry, AuditLog, RiskAlert
from app.security.crypto import decrypt_credential
from app.connectors.factory import get_connector

class DatabaseCollectorService:
    def collect_all_active_databases(self, org_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Run telemetry collection across all active enterprise database connections."""
        db: Session = SessionLocal()
        results = []
        try:
            query = db.query(DatabaseConnection).filter(DatabaseConnection.is_active == True)
            if org_id:
                query = query.filter(DatabaseConnection.org_id == org_id)
            connections = query.all()

            for conn_model in connections:
                try:
                    plain_pw = decrypt_credential(conn_model.encrypted_password)
                    connector = get_connector(
                        db_type=conn_model.db_type,
                        host=conn_model.host,
                        port=conn_model.port,
                        database=conn_model.database_name,
                        username=conn_model.username,
                        password=plain_pw,
                        ssl_mode=conn_model.ssl_mode
                    )

                    storage_meta = connector.collect_storage_metadata()
                    perf_meta = connector.collect_performance_metadata()

                    # Calculate daily growth relative to previous record
                    prev_rec = (
                        db.query(DatabaseTelemetry)
                        .filter(DatabaseTelemetry.db_connection_id == conn_model.id)
                        .order_by(DatabaseTelemetry.timestamp.desc())
                        .first()
                    )
                    growth_rate = 0.0
                    if prev_rec:
                        time_diff = (datetime.utcnow() - prev_rec.timestamp).total_seconds()
                        if time_diff > 0:
                            growth_rate = max(0.0, (storage_meta["total_size_bytes"] - prev_rec.total_size_bytes) / (time_diff / 86400.0))

                    telemetry_entry = DatabaseTelemetry(
                        org_id=conn_model.org_id,
                        db_connection_id=conn_model.id,
                        timestamp=datetime.utcnow(),
                        total_size_bytes=storage_meta["total_size_bytes"],
                        data_size_bytes=storage_meta["data_size_bytes"],
                        index_size_bytes=storage_meta["index_size_bytes"],
                        table_count=storage_meta["table_count"],
                        active_connections=perf_meta["active_connections"],
                        query_latency_ms=perf_meta["query_latency_ms"],
                        read_throughput_mb_s=perf_meta["read_throughput_mb_s"],
                        write_throughput_mb_s=perf_meta["write_throughput_mb_s"],
                        growth_rate_daily_bytes=growth_rate,
                        top_tables_json=json.dumps(storage_meta.get("top_tables", []))
                    )
                    db.add(telemetry_entry)
                    conn_model.last_sync_at = datetime.utcnow()
                    conn_model.status_message = "Telemetry Synced"

                    # Check index bloat ratio (>40% index ratio triggers advisory)
                    if storage_meta["total_size_bytes"] > 0 and (storage_meta["index_size_bytes"] / storage_meta["total_size_bytes"]) > 0.40:
                        db.add(RiskAlert(
                            org_id=conn_model.org_id,
                            drive_name=f"DB: {conn_model.name}",
                            risk_level="MODERATE",
                            title=f"High Database Index Overhead on {conn_model.name}",
                            reason=f"Indexes consume over 40% of total database footprint ({storage_meta['index_size_bytes'] / (1024**3):.1f} GB).",
                            recommended_action="Execute database index reindexing or drop unused secondary index structures.",
                            is_resolved=False
                        ))

                    results.append({
                        "connection_id": conn_model.id,
                        "name": conn_model.name,
                        "status": "SUCCESS",
                        "total_gb": round(storage_meta["total_size_bytes"] / (1024 ** 3), 2),
                        "query_latency_ms": perf_meta["query_latency_ms"]
                    })
                except Exception as e:
                    conn_model.status_message = f"Collection Warning: {str(e)[:100]}"
                    results.append({
                        "connection_id": conn_model.id,
                        "name": conn_model.name,
                        "status": "ERROR",
                        "error": str(e)
                    })

            db.commit()
            return results
        except Exception as e:
            db.rollback()
            print(f"[DatabaseCollectorService] Error: {e}")
            return []
        finally:
            db.close()

database_collector = DatabaseCollectorService()
