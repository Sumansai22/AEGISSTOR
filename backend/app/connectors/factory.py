"""
Database Connector Factory
"""
from typing import Dict, Any
from app.connectors.base import BaseDatabaseConnector
from app.connectors.postgres import PostgresConnector
from app.connectors.mysql import MySQLConnector
from app.connectors.sql_server import SQLServerConnector
from app.connectors.oracle import OracleConnector
from app.connectors.sqlite import SQLiteConnector

def get_connector(
    db_type: str,
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
    ssl_mode: str = "prefer"
) -> BaseDatabaseConnector:
    """Return specialized database connector instance based on db_type."""
    db_upper = db_type.upper().strip()
    if db_upper in ["SQLITE", "SQLITE3", "INTERNAL_DB"]:
        return SQLiteConnector(host, port, database, username, password, ssl_mode)
    elif db_upper in ["POSTGRESQL", "POSTGRES", "PG"]:
        return PostgresConnector(host, port, database, username, password, ssl_mode)
    elif db_upper in ["MYSQL", "MARIADB"]:
        return MySQLConnector(host, port, database, username, password, ssl_mode)
    elif db_upper in ["SQL_SERVER", "MSSQL", "SQLSERVER"]:
        return SQLServerConnector(host, port, database, username, password, ssl_mode)
    elif db_upper in ["ORACLE", "ORACLEDB"]:
        return OracleConnector(host, port, database, username, password, ssl_mode)
    else:
        # Default fallback to SQLite if unsupported or local
        return SQLiteConnector(host, port, database, username, password, ssl_mode)
