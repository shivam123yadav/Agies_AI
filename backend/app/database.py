import os
from pymongo import MongoClient, ASCENDING, DESCENDING

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "agiesai_sentinel")

client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=3000)
db = client[MONGODB_DB]
incidents_collection = db["incidents"]
audit_logs_collection = db["audit_logs"]
policies_collection = db["policies"]
employees_collection = db["employees"]
detection_rules_collection = db["detection_rules"]

incidents_collection.create_index([("incident_id", ASCENDING)], unique=True)
incidents_collection.create_index([("timestamp", DESCENDING)])
audit_logs_collection.create_index([("timestamp", DESCENDING)])
audit_logs_collection.create_index([("incident_id", ASCENDING)])
incidents_collection.create_index([("employee_id", ASCENDING)])
employees_collection.create_index([("employee_id", ASCENDING)], unique=True)
employees_collection.create_index([("email", ASCENDING)], unique=True)
policies_collection.create_index([("policy_id", ASCENDING)], unique=True)
policies_collection.create_index([("status", ASCENDING)])
detection_rules_collection.create_index([("rule_id", ASCENDING)], unique=True)
detection_rules_collection.create_index([("status", ASCENDING)])


def check_database() -> bool:
    try:
        client.admin.command("ping")
        return True
    except Exception:
        return False
