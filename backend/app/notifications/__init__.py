"""
AEGISSTOR Enterprise Notification & Incident Management Subsystem
"""
from app.notifications.engine import notification_engine
from app.notifications.dispatcher import dispatcher
from app.notifications.event_processor import event_processor
from app.notifications.templates import template_engine
from app.notifications.preferences import preferences_manager
from app.notifications.escalation import escalation_engine
from app.notifications.deduplication import deduplication_engine

__all__ = [
    "notification_engine",
    "dispatcher",
    "event_processor",
    "template_engine",
    "preferences_manager",
    "escalation_engine",
    "deduplication_engine"
]
