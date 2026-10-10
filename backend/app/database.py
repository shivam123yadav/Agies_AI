import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.collection import Collection

from app.config import is_production_env, validate_mongodb_uri

logger = logging.getLogger("agiesai.sentinel.database")

# In production, validate_mongodb_uri strictly enforces non-empty URI, credentials, and TLS
MONGODB_URI = validate_mongodb_uri(os.getenv("MONGODB_URI"))
MONGODB_DB = os.getenv("MONGODB_DB", "agiesai_sentinel")

client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=3000)
db = client[MONGODB_DB]

incidents_collection = db["incidents"]
audit_logs_collection = db["audit_logs"]
policies_collection = db["policies"]
employees_collection = db["employees"]
detection_rules_collection = db["detection_rules"]
extension_pairing_codes_collection = db["extension_pairing_codes"]
login_rate_limits_collection = db["login_rate_limits"]
admin_sessions_collection = db["admin_sessions"]

# ---------------------------------------------------------------------------
# Index Specifications: (Collection, KeysSpecification, OptionsDict)
# ---------------------------------------------------------------------------

# Critical indexes enforce security uniqueness, rate limiting, and core integrity
CRITICAL_INDEX_SPECS: List[Tuple[Collection, List[Tuple[str, int]], Dict[str, Any]]] = [
    # 1. Admin session token hash uniqueness (Session authentication & revocation)
    (admin_sessions_collection, [("session_id_hash", ASCENDING)], {"unique": True}),
    # 2. Login rate limit key uniqueness (Atomic counter per IP / account)
    (login_rate_limits_collection, [("key", ASCENDING)], {"unique": True}),
    # 3. Extension pairing code hash (Single-use redemption lookup)
    (extension_pairing_codes_collection, [("code_hash", ASCENDING)], {}),
    # 4. Employee ID and email unique identity constraints
    (employees_collection, [("employee_id", ASCENDING)], {"unique": True}),
    (employees_collection, [("email", ASCENDING)], {"unique": True}),
    # 5. Policy ID uniqueness
    (policies_collection, [("policy_id", ASCENDING)], {"unique": True}),
    # 6. Detection rule ID uniqueness
    (detection_rules_collection, [("rule_id", ASCENDING)], {"unique": True}),
    # 7. Incident ID uniqueness
    (incidents_collection, [("incident_id", ASCENDING)], {"unique": True}),
]

# Non-critical indexes optimize secondary queries and background TTL cleanup
NON_CRITICAL_INDEX_SPECS: List[Tuple[Collection, List[Tuple[str, int]], Dict[str, Any]]] = [
    (admin_sessions_collection, [("admin_email", ASCENDING)], {}),
    (admin_sessions_collection, [("expires_at", ASCENDING)], {"expireAfterSeconds": 0}),
    (login_rate_limits_collection, [("expires_at", ASCENDING)], {"expireAfterSeconds": 0}),
    (extension_pairing_codes_collection, [("employee_id", ASCENDING)], {}),
    (extension_pairing_codes_collection, [("used", ASCENDING)], {}),
    (extension_pairing_codes_collection, [("expires_at", ASCENDING)], {}),
    (incidents_collection, [("timestamp", DESCENDING)], {}),
    (incidents_collection, [("employee_id", ASCENDING)], {}),
    (audit_logs_collection, [("timestamp", DESCENDING)], {}),
    (audit_logs_collection, [("incident_id", ASCENDING)], {}),
    (policies_collection, [("status", ASCENDING)], {}),
    (detection_rules_collection, [("status", ASCENDING)], {}),
]

_CRITICAL_INDEXES_INITIALIZED = False
_INDEX_INITIALIZATION_ERROR: Optional[str] = None


def ensure_critical_indexes() -> None:
    """Create all critical security and data integrity indexes.

    Raises RuntimeError if any critical index fails to create.
    Does NOT silently swallow critical failures.
    """
    global _CRITICAL_INDEXES_INITIALIZED, _INDEX_INITIALIZATION_ERROR
    failed_indexes = []

    for coll, keys, kwargs in CRITICAL_INDEX_SPECS:
        try:
            coll.create_index(keys, **kwargs)
        except Exception as exc:
            logger.error(
                "Critical index creation failed for collection '%s', keys %s: %s",
                coll.name,
                keys,
                exc,
            )
            failed_indexes.append(f"{coll.name}.{keys}")

    if failed_indexes:
        _CRITICAL_INDEXES_INITIALIZED = False
        _INDEX_INITIALIZATION_ERROR = f"Failed critical indexes: {', '.join(failed_indexes)}"
        raise RuntimeError(
            f"Database readiness failure: could not create critical indexes: {', '.join(failed_indexes)}"
        )

    _CRITICAL_INDEXES_INITIALIZED = True
    _INDEX_INITIALIZATION_ERROR = None


def ensure_non_critical_indexes() -> None:
    """Create non-critical query optimization and background TTL indexes.

    Logs warnings if any non-critical index fails, but does not abort startup.
    """
    for coll, keys, kwargs in NON_CRITICAL_INDEX_SPECS:
        try:
            coll.create_index(keys, **kwargs)
        except Exception as exc:
            logger.warning(
                "Non-critical index creation deferred or failed for collection '%s', keys %s: %s",
                coll.name,
                keys,
                exc,
            )


def ensure_database_indexes() -> None:
    """Initialize all database indexes, strictly verifying critical indexes."""
    ensure_critical_indexes()
    ensure_non_critical_indexes()


def are_critical_indexes_ready() -> bool:
    """Return whether all critical indexes have been verified and created."""
    return _CRITICAL_INDEXES_INITIALIZED


def get_index_initialization_error() -> Optional[str]:
    """Return error message from critical index initialization if failed."""
    return _INDEX_INITIALIZATION_ERROR


def check_database() -> bool:
    """Ping database to verify live connectivity."""
    try:
        client.admin.command("ping")
        return True
    except Exception:
        return False


def is_database_ready() -> bool:
    """Determine whether database is fully connected AND critical indexes are ready."""
    return are_critical_indexes_ready() and check_database()


# Attempt index initialization on module import
try:
    ensure_database_indexes()
except Exception as _e:
    if is_production_env():
        # In production, critical index failure halts initialization immediately
        raise
    else:
        logger.warning("Database indexes initialization deferred in development: %s", _e)
