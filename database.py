import os
import pymysql
import pymysql.cursors


def get_connection():
    return pymysql.connect(
        host=os.environ.get('DB_HOST', 'localhost'),
        port=int(os.environ.get('DB_PORT', '3306')),
        user=os.environ.get('DB_USER', 'root'),
        password=os.environ.get('DB_PASSWORD', ''),
        database=os.environ.get('DB_NAME', 'ai_coach'),
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
    )


def init_db():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ai_coach_sessions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    session_id VARCHAR(36) UNIQUE NOT NULL,
                    user_id VARCHAR(36) NOT NULL,
                    user_name VARCHAR(255) DEFAULT NULL,
                    email VARCHAR(255) DEFAULT NULL,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_user_id (user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
            # Add columns for existing tables that predate this schema
            for col, definition in [
                ('user_name', 'VARCHAR(255) DEFAULT NULL'),
                ('email', 'VARCHAR(255) DEFAULT NULL'),
            ]:
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_coach_sessions' AND COLUMN_NAME = %s",
                    (col,),
                )
                if cur.fetchone()['cnt'] == 0:
                    cur.execute(f"ALTER TABLE ai_coach_sessions ADD COLUMN {col} {definition}")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ai_coach_messages (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    session_id VARCHAR(36) NOT NULL,
                    user_id VARCHAR(36) NOT NULL,
                    role ENUM('user', 'assistant') NOT NULL,
                    content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_user_id (user_id),
                    INDEX idx_session_id (session_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
        conn.commit()
    finally:
        conn.close()


def create_chat_session(session_id: str, user_id: str, user_name: str = None, email: str = None):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ai_coach_sessions (session_id, user_id, user_name, email) VALUES (%s, %s, %s, %s)",
                (session_id, user_id, user_name, email),
            )
        conn.commit()
    finally:
        conn.close()


def save_message(session_id: str, user_id: str, role: str, content: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ai_coach_messages (session_id, user_id, role, content) VALUES (%s, %s, %s, %s)",
                (session_id, user_id, role, content),
            )
        conn.commit()
    finally:
        conn.close()


def get_user_history(user_id: str, limit: int = 20) -> list:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT role, content, created_at
                FROM ai_coach_messages
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (user_id, limit),
            )
            rows = cur.fetchall()
            return list(reversed(rows))
    finally:
        conn.close()


def has_previous_sessions(user_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM ai_coach_messages WHERE user_id = %s", (user_id,)
            )
            row = cur.fetchone()
            return row['cnt'] > 0
    finally:
        conn.close()


def get_session_highlights(user_id: str, max_sessions: int = 5) -> list:
    """
    For each of the user's recent sessions returns the opening topic (first user
    message) and the closing takeaway (last assistant message). Used to build a
    concise history summary for the AI prompt rather than replaying raw messages.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT session_id, DATE(MIN(created_at)) AS session_date
                FROM ai_coach_messages
                WHERE user_id = %s
                GROUP BY session_id
                ORDER BY MIN(created_at) DESC
                LIMIT %s
                """,
                (user_id, max_sessions),
            )
            sessions = cur.fetchall()

            highlights = []
            for s in sessions:
                sid = s['session_id']
                date = str(s['session_date'])

                cur.execute(
                    """
                    SELECT content FROM ai_coach_messages
                    WHERE session_id = %s AND role = 'user'
                    ORDER BY created_at ASC LIMIT 1
                    """,
                    (sid,),
                )
                first_user = cur.fetchone()
                if not first_user:
                    continue

                cur.execute(
                    """
                    SELECT content FROM ai_coach_messages
                    WHERE session_id = %s AND role = 'assistant'
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (sid,),
                )
                last_assistant = cur.fetchone()

                highlights.append({
                    'date': date,
                    'topic': first_user['content'][:250],
                    'takeaway': last_assistant['content'][:350] if last_assistant else '',
                })

            return list(reversed(highlights))  # oldest first
    finally:
        conn.close()
