"""
Abstract Base Database Connector for Enterprise Monitoring
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, List

class BaseDatabaseConnector(ABC):
    def __init__(self, host: str, port: int, database: str, username: str, password: str, ssl_mode: str = "prefer"):
        self.host = host
        self.port = port
        self.database = database
        self.username = username
        self.password = password
        self.ssl_mode = ssl_mode

    @abstractmethod
    def test_connection(self) -> Dict[str, Any]:
        """Test database connectivity with read-only probe."""
        pass

    @abstractmethod
    def collect_storage_metadata(self) -> Dict[str, Any]:
        """
        Collect safe database storage metadata:
        - Total allocated size (bytes)
        - Data size (bytes)
        - Index size (bytes)
        - Reclaimable / free space (bytes)
        - Table count & top table breakdown (name, size, index_size)
        """
        pass

    @abstractmethod
    def collect_performance_metadata(self) -> Dict[str, Any]:
        """
        Collect database engine performance indicators:
        - Query latency (ms)
        - Active connection count
        - Read / write throughput estimates
        """
        pass
