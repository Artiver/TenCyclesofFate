import logging
from urllib.parse import urlparse

from ..core import db
from ..core.config import settings
from ..core.security import get_password_hash, verify_password

logger = logging.getLogger(__name__)


def _row_to_dict(cursor, row) -> dict | None:
    """Converts a DB row (sqlite3.Row, dict, or tuple) to a plain dict."""
    if row is None:
        return None
    if isinstance(row, dict):
        return row
    if hasattr(row, "keys"):  # sqlite3.Row
        return dict(row)
    # MySQL tuple cursor: use column names from cursor.description
    columns = [col[0] for col in cursor.description]
    return dict(zip(columns, row))


def _placeholder() -> str:
    """Returns the SQL placeholder for the configured database (mysql=%s, sqlite=?)."""
    scheme = urlparse(settings.DATABASE_URL).scheme
    return "?" if scheme == "sqlite" else "%s"


def get_user_by_username(username: str) -> dict | None:
    """Fetches a user from the database by username."""
    conn = db.get_db_connection()
    if not conn:
        return None
    ph = _placeholder()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT id, username, password_hash, created_at FROM users WHERE username = {ph}",
            (username,)
        )
        user = _row_to_dict(cursor, cursor.fetchone())
        return user
    except Exception as e:
        logger.error(f"Failed to fetch user '{username}': {e}", exc_info=True)
        return None
    finally:
        conn.close()


def create_user(username: str, password: str) -> dict | None:
    """Creates a new user in the database. Returns the created user dict or None on error."""
    password_hash = get_password_hash(password)
    conn = db.get_db_connection()
    if not conn:
        return None
    ph = _placeholder()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"INSERT INTO users (username, password_hash) VALUES ({ph}, {ph})",
            (username, password_hash)
        )
        conn.commit()
        user_id = cursor.lastrowid
        return {"id": user_id, "username": username}
    except Exception as e:
        logger.error(f"Failed to create user '{username}': {e}", exc_info=True)
        if conn:
            conn.rollback()
        return None
    finally:
        if conn:
            conn.close()


def authenticate_user(username: str, password: str) -> dict | None:
    """Verifies username/password and returns the user dict if valid."""
    user = get_user_by_username(username)
    if not user:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return user


def delete_user(user_id: int) -> bool:
    """Deletes a user and their associated redemption codes. Returns True on success."""
    conn = db.get_db_connection()
    if not conn:
        return False
    ph = _placeholder()
    try:
        cursor = conn.cursor()
        cursor.execute(f"DELETE FROM users WHERE id = {ph}", (user_id,))
        deleted = cursor.rowcount > 0

        # Best-effort: the redemptions table only exists on MySQL; tolerate its absence.
        try:
            cursor.execute(f"DELETE FROM redemptions WHERE user_id = {ph}", (user_id,))
        except Exception as e:
            logger.warning(f"Failed to delete redemptions for user '{user_id}': {e}")

        conn.commit()
        if not deleted:
            logger.warning(f"delete_user: user '{user_id}' not found")
        else:
            logger.info(f"User '{user_id}' deleted")
        return deleted
    except Exception as e:
        logger.error(f"Failed to delete user '{user_id}': {e}", exc_info=True)
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()
