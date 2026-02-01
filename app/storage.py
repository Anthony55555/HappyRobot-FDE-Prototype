import os
import sqlite3
import json
from datetime import datetime
from pathlib import Path

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "events.db")))


def init_db():
    """Initialize SQLite database with all tables."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Events table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            call_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload TEXT,
            timestamp TEXT NOT NULL
        )
    """)
    
    # Carrier profiles table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS carrier_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mc_number TEXT UNIQUE NOT NULL,
            dot_number TEXT,
            legal_name TEXT,
            physical_city TEXT,
            physical_state TEXT,
            home_lat REAL,
            home_lng REAL,
            equipment_type TEXT,
            min_temp REAL,
            max_temp REAL,
            origin_radius_miles INTEGER DEFAULT 50,
            dest_radius_miles INTEGER DEFAULT 50,
            updated_at TEXT NOT NULL
        )
    """)
    
    # Call search preferences table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS call_search_prefs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            call_id TEXT UNIQUE NOT NULL,
            mc_number TEXT,
            origin_city TEXT,
            origin_state TEXT,
            destination_city TEXT,
            destination_state TEXT,
            pickup_date TEXT,
            departure_date TEXT,
            latest_departure_date TEXT,
            equipment_type TEXT,
            weight_capacity INTEGER,
            origin_lat REAL,
            origin_lng REAL,
            origin_radius_miles INTEGER,
            dest_lat REAL,
            dest_lng REAL,
            dest_radius_miles INTEGER,
            min_temp REAL,
            max_temp REAL,
            notes TEXT,
            updated_at TEXT NOT NULL
        )
    """)
    
    # Add new columns to existing tables (safe migration)
    for column_def in [
        ("departure_date", "TEXT"),
        ("latest_departure_date", "TEXT"),
        ("weight_capacity", "INTEGER"),
        ("notes", "TEXT"),
        ("min_temp", "REAL"),
        ("max_temp", "REAL")
    ]:
        try:
            cursor.execute(f"ALTER TABLE call_search_prefs ADD COLUMN {column_def[0]} {column_def[1]}")
        except Exception:
            pass  # Column already exists
    
    conn.commit()
    conn.close()


def log_event(call_id: str, event_type: str, payload: dict) -> bool:
    """Log an event to the database."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO events (call_id, event_type, payload, timestamp) VALUES (?, ?, ?, ?)",
        (call_id, event_type, json.dumps(payload), datetime.utcnow().isoformat() + "Z"),
    )
    conn.commit()
    conn.close()
    return True


def upsert_carrier_profile(mc_number: str, updates: dict) -> dict:
    """
    Upsert carrier profile.
    Only updates provided fields (keeps existing user-entered data).
    Returns the full carrier profile row.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Check if carrier exists
    cursor.execute("SELECT * FROM carrier_profiles WHERE mc_number = ?", (mc_number,))
    existing = cursor.fetchone()
    
    updates["updated_at"] = datetime.utcnow().isoformat()
    
    if existing:
        # Update only provided fields
        set_clauses = []
        params = []
        for key, value in updates.items():
            if value is not None or key == "updated_at":
                set_clauses.append(f"{key} = ?")
                params.append(value)
        
        if set_clauses:
            params.append(mc_number)
            sql = f"UPDATE carrier_profiles SET {', '.join(set_clauses)} WHERE mc_number = ?"
            cursor.execute(sql, params)
    else:
        # Insert new carrier
        updates["mc_number"] = mc_number
        columns = list(updates.keys())
        placeholders = ["?" for _ in columns]
        sql = f"INSERT INTO carrier_profiles ({', '.join(columns)}) VALUES ({', '.join(placeholders)})"
        cursor.execute(sql, [updates[col] for col in columns])
    
    conn.commit()
    
    # Return updated row
    cursor.execute("SELECT * FROM carrier_profiles WHERE mc_number = ?", (mc_number,))
    row = cursor.fetchone()
    conn.close()
    
    return dict(row) if row else {}


def get_carrier_profile(mc_number: str) -> dict:
    """Get carrier profile by MC number."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM carrier_profiles WHERE mc_number = ?", (mc_number,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_call_search_prefs(call_id: str, updates: dict) -> dict:
    """
    Upsert call search preferences.
    Only updates provided fields.
    Returns the full call_search_prefs row.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Check if call prefs exist
    cursor.execute("SELECT * FROM call_search_prefs WHERE call_id = ?", (call_id,))
    existing = cursor.fetchone()
    
    updates["updated_at"] = datetime.utcnow().isoformat()
    
    if existing:
        # Update only provided fields
        set_clauses = []
        params = []
        for key, value in updates.items():
            if value is not None or key == "updated_at":
                set_clauses.append(f"{key} = ?")
                params.append(value)
        
        if set_clauses:
            params.append(call_id)
            sql = f"UPDATE call_search_prefs SET {', '.join(set_clauses)} WHERE call_id = ?"
            cursor.execute(sql, params)
    else:
        # Insert new call prefs
        updates["call_id"] = call_id
        columns = list(updates.keys())
        placeholders = ["?" for _ in columns]
        sql = f"INSERT INTO call_search_prefs ({', '.join(columns)}) VALUES ({', '.join(placeholders)})"
        cursor.execute(sql, [updates[col] for col in columns])
    
    conn.commit()
    
    # Return updated row
    cursor.execute("SELECT * FROM call_search_prefs WHERE call_id = ?", (call_id,))
    row = cursor.fetchone()
    conn.close()
    
    return dict(row) if row else {}


def get_call_search_prefs(call_id: str) -> dict:
    """Get call search preferences by call_id."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM call_search_prefs WHERE call_id = ?", (call_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_distinct_call_ids():
    """Return all distinct call_id values from events, most recent first. Excludes empty/unknown."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT call_id FROM events
        WHERE call_id IS NOT NULL AND TRIM(call_id) != '' AND call_id != 'unknown'
        GROUP BY call_id
        ORDER BY MAX(id) DESC
    """)
    out = [row[0] for row in cursor.fetchall()]
    conn.close()
    return out


def get_events_by_call_id(call_id: str):
    """Return all events for a call_id: list of dicts with event_type, payload, timestamp."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
        SELECT event_type, payload, timestamp
        FROM events
        WHERE call_id = ?
        ORDER BY id ASC
    """, (call_id,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {"event_type": r["event_type"], "payload": r["payload"], "timestamp": r["timestamp"]}
        for r in rows
    ]


# Initialize DB on module import
init_db()
