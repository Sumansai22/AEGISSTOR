"""
Notification & Incident Templates Engine
Standardized professional templates with root cause evidence and recommended corrective actions.
"""
from typing import Dict, Any, Tuple

class TemplateEngine:
    @staticmethod
    def render(
        category: str,
        metric_key: str,
        resource: str,
        severity: str,
        current_val: Any,
        threshold_val: Any,
        metadata: Dict[str, Any]
    ) -> Tuple[str, str, str, str]:
        """
        Returns:
            (title, message, root_cause_evidence, recommended_action)
        """
        category_u = category.upper()

        # 1. STORAGE TEMPLATES
        if category_u == "STORAGE":
            if "usage" in metric_key:
                title = f"Storage Utilization Warning: {resource} is at {current_val}%"
                if severity == "EMERGENCY":
                    title = f"CRITICAL STORAGE EXHAUSTION: {resource} has reached {current_val}%"
                msg = f"Volume {resource} has consumed {current_val}% of available capacity, surpassing the safety threshold of {threshold_val}%."
                evidence = f"Current volume measurement: {current_val}% used. Threshold: {threshold_val}%. Free headroom is severely constrained."
                action = "Initiate automated storage scanner, purge temporary application caches, review database index bloat, or attach supplemental volume storage."
                return title, msg, evidence, action

            elif "headroom" in metric_key:
                title = f"Low Disk Headroom: {resource} has only {current_val} GB Free"
                msg = f"Volume {resource} available free space has fallen to {current_val} GB (threshold: {threshold_val} GB)."
                evidence = f"Kernel free bytes check indicates {current_val} GB remaining for OS paging and transaction logs."
                action = "Perform immediate disk cleanup to prevent Windows filesystem lockup or database transaction rollbacks."
                return title, msg, evidence, action

            elif "growth" in metric_key:
                title = f"Rapid Storage Growth Detected on {resource}: +{current_val} GB/day"
                msg = f"Storage growth rate on {resource} surged to {current_val} GB/day, exceeding normal baseline ({threshold_val} GB/day)."
                evidence = f"Differential analysis across consecutive telemetry intervals calculated {current_val} GB 24h delta."
                action = "Inspect directory trees for runaway logging, uncompressed backup archives, or runaway database tables."
                return title, msg, evidence, action

            elif "unavailable" in metric_key:
                title = f"Storage Volume Inaccessible: {resource}"
                msg = f"Volume {resource} is offline, disconnected, or unreadable by system storage APIs."
                evidence = f"Win32 API GetDiskFreeSpaceExW returned accessibility error for volume {resource}."
                action = "Check hardware connectivity, physical NVMe/SATA bus, or Windows volume mount permissions."
                return title, msg, evidence, action

        # 2. DATABASE TEMPLATES
        elif category_u == "DATABASE":
            if "auth" in metric_key:
                title = f"Repeated Database Authentication Failures on {resource}"
                msg = f"{current_val} failed authentication attempts recorded on database connector {resource}."
                evidence = f"Security audit log recorded {current_val} authentication failures within 15 minutes."
                action = "Investigate client IP origin, inspect user connection credentials, and verify if brute-force attempts are underway."
                return title, msg, evidence, action

            elif "unauthorized" in metric_key or "query" in metric_key or "sqli" in metric_key:
                title = f"CRITICAL SECURITY: Suspicious Query Activity on {resource}"
                msg = f"Security guard detected prohibited or SQL injection signatures on {resource}."
                evidence = f"Input pattern matched SQL injection heuristics: {metadata.get('pattern', 'Malicious probe pattern')}."
                action = "Immediately review caller session, restrict database user permissions, and verify parameter binding."
                return title, msg, evidence, action

            elif "availability" in metric_key:
                title = f"Database Connection Failure: {resource}"
                msg = f"AEGISSTOR cannot establish a healthy socket connection to enterprise database {resource}."
                evidence = f"TCP connection ping timed out or refused by host {resource}."
                action = "Check database service process status, network firewall rules, and host listener ports."
                return title, msg, evidence, action

            elif "connections" in metric_key:
                title = f"High Database Connection Pool Saturation on {resource}"
                msg = f"Connection pool utilization has reached {current_val}% (threshold: {threshold_val}%)."
                evidence = f"Active backend connection count is nearing max_connections limit."
                action = "Review connection pooling settings, terminate orphaned idle transactions, and increase connection capacity."
                return title, msg, evidence, action

        # 3. SYSTEM PERFORMANCE TEMPLATES
        elif category_u == "PERFORMANCE":
            if "cpu" in metric_key:
                title = f"High Host CPU Utilization: {current_val}% on {resource}"
                msg = f"Host CPU utilization sustained at {current_val}% (threshold: {threshold_val}%)."
                evidence = f"System performance telemetry recorded {current_val}% aggregate CPU load across cores."
                action = "Review top resource-consuming processes, scale background tasks, or inspect running machine learning training jobs."
                return title, msg, evidence, action

            elif "ram" in metric_key:
                title = f"High Host RAM Utilization: {current_val}% on {resource}"
                msg = f"Physical memory consumption has reached {current_val}% (threshold: {threshold_val}%)."
                evidence = f"Virtual memory manager reports {current_val}% RAM allocated."
                action = "Identify memory-leaking processes, terminate inactive worker pools, or add physical RAM."
                return title, msg, evidence, action

            elif "io" in metric_key or "latency" in metric_key:
                title = f"Elevated Disk I/O Latency: {current_val} ms on {resource}"
                msg = f"Storage I/O queue service time exceeded {threshold_val} ms (current: {current_val} ms)."
                evidence = f"Storage controller reports sustained disk queue depth and I/O latency spike."
                action = "Throttle background scan operations and reschedule heavy analytical database batch queries."
                return title, msg, evidence, action

        # 4. AWS CLOUD STORAGE TEMPLATES
        elif category_u == "AWS":
            if "credentials" in metric_key or "auth" in metric_key:
                title = f"AWS Authentication Session Expired or Disconnected"
                msg = f"AWS CLI profile 'aegisstor' credentials are invalid or session token has expired."
                evidence = f"AWS STS GetCallerIdentity call failed: {metadata.get('error', 'Token expired')}."
                action = "Execute 'aws sso login --profile aegisstor' to refresh temporary browser-based credentials."
                return title, msg, evidence, action

            elif "public" in metric_key:
                title = f"CRITICAL SECURITY: S3 Public Access Protection Altered on {resource}"
                msg = f"Bucket {resource} Block Public Access settings have been modified or disabled."
                evidence = f"boto3 get_public_access_block returned non-enforced protection flags."
                action = "Immediately restore all four Block Public Access flags to prevent unintended public object exposure."
                return title, msg, evidence, action

            elif "encryption" in metric_key:
                title = f"SECURITY ALERT: S3 Server-Side Encryption Configuration Changed on {resource}"
                msg = f"Server-side encryption on bucket {resource} is not compliant with enterprise AES256 standards."
                evidence = f"boto3 get_bucket_encryption check returned non-compliant status."
                action = "Re-enable SSE-S3 AES256 encryption on bucket properties in AWS console."
                return title, msg, evidence, action

            elif "access" in metric_key:
                title = f"AWS S3 API Access Failure on {resource}"
                msg = f"Failed to query bucket metadata for {resource}."
                evidence = f"S3 API client error: {metadata.get('error', 'Access denied or networking error')}."
                action = "Verify IAM role permissions for AccountFullAccessRole and check network outbound routes."
                return title, msg, evidence, action

        # 5. AI FORECASTING TEMPLATES
        elif category_u in ("AI_FORECAST", "FORECASTING"):
            if "exhaustion" in metric_key or "runway" in metric_key:
                title = f"AI Capacity Alert: {resource} Exhaustion Predicted in {current_val} Days"
                msg = f"Machine learning tournament models predict capacity exhaustion for {resource} on {metadata.get('date', 'target date')}."
                evidence = f"Multi-model time-series projection indicates capacity runway will breach 95% in {current_val} days."
                action = "Review predictive capacity runway chart, provision additional storage tiers, or implement automated retention purges."
                return title, msg, evidence, action

            elif "uncertainty" in metric_key:
                title = f"High Forecast Uncertainty Detected on {resource}"
                msg = f"Forecast prediction interval spread expanded by {current_val}%, indicating volatile usage patterns."
                evidence = f"Residual error standard deviation increased across backtesting evaluation windows."
                action = "Collect additional telemetry points or investigate sporadic large-file write spikes."
                return title, msg, evidence, action

            elif "accuracy" in metric_key or "deviation" in metric_key:
                title = f"Forecasting Model Accuracy Drift Detected on {resource}"
                msg = f"Forecast evaluation error sMAPE increased to {current_val}%, exceeding the accuracy baseline."
                evidence = f"Actual consumed bytes diverged from predicted trajectory by {current_val}%."
                action = "Trigger model retraining and tournament benchmark re-evaluation."
                return title, msg, evidence, action

        # Default fallback template
        title = f"System Notification: {category_u} Alert on {resource}"
        msg = f"Alert condition detected for {metric_key}: current value {current_val} breached threshold {threshold_val}."
        evidence = f"Telemetry metric '{metric_key}' evaluated as {current_val}."
        action = "Check system logs and verify operational state in the AEGISSTOR dashboard."
        return title, msg, evidence, action

template_engine = TemplateEngine()
