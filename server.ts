import express from 'express';
import Database from 'better-sqlite3';
import { resolve } from 'path';

const app = express();
const port = 3001;

app.use(express.json({ limit: '50mb' }));

// Initialize DB
const dbPath = resolve(process.cwd(), 'database.sqlite');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    persona TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    idx INTEGER NOT NULL,
    FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

// GET /api/sessions -> Returns all sessions without messages (for sidebar)
app.get('/api/sessions', (req, res) => {
    try {
        const sessions = db.prepare('SELECT * FROM sessions ORDER BY createdAt DESC').all();
        res.json(sessions);
    } catch (e: any) {
        res.status(500).json({ error: e.toString() });
    }
});

// GET /api/sessions/:id -> Returns full session with messages
app.get('/api/sessions/:id', (req, res) => {
    try {
        const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id) as any;
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const messages = db.prepare('SELECT role, text FROM messages WHERE sessionId = ? ORDER BY idx ASC').all(session.id) as any[];

        session.messages = messages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));

        res.json(session);
    } catch (e: any) {
        res.status(500).json({ error: e.toString() });
    }
});

// POST /api/sessions -> Create a new empty session
app.post('/api/sessions', (req, res) => {
    try {
        const { id, title, persona, createdAt } = req.body;
        db.prepare('INSERT INTO sessions (id, title, persona, createdAt) VALUES (?, ?, ?, ?)')
            .run(id, title || 'New Chat', persona || 'assistant', createdAt || Date.now());
        res.json({ success: true, id });
    } catch (e: any) {
        res.status(500).json({ error: e.toString() });
    }
});

// PUT /api/sessions/:id -> Update session (title or add messages)
app.put('/api/sessions/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { title, messages } = req.body;

        const transaction = db.transaction(() => {
            if (title) {
                db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, id);
            }
            if (messages && Array.isArray(messages)) {
                // To keep it simple, we just delete old and re-insert all messages
                db.prepare('DELETE FROM messages WHERE sessionId = ?').run(id);
                const insertMsg = db.prepare('INSERT INTO messages (sessionId, role, text, idx) VALUES (?, ?, ?, ?)');
                messages.forEach((m: any, idx: number) => {
                    insertMsg.run(id, m.role, m.parts[0].text, idx);
                });
            }
        });

        transaction();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.toString() });
    }
});

// DELETE /api/sessions/:id
app.delete('/api/sessions/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.toString() });
    }
});

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
});
