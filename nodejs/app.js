const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = process.env.PORT || 3600;

// Debug logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Middleware to parse JSON bodies
app.use(express.json());

// CORS middleware for local development
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Path to blocked users file
const BLOCKED_USERS_FILE = path.join(__dirname, 'data', 'blocked_users.json');

// Initialize blocked users file if it doesn't exist
async function initBlockedUsersFile() {
    try {
        await fs.access(BLOCKED_USERS_FILE);
        console.log('Blocked users file exists at:', BLOCKED_USERS_FILE);
    } catch {
        console.log('Creating blocked users file at:', BLOCKED_USERS_FILE);
        const dir = path.dirname(BLOCKED_USERS_FILE);
        try {
            await fs.mkdir(dir, { recursive: true });
            console.log('Created data directory at:', dir);
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;
        }
        await fs.writeFile(BLOCKED_USERS_FILE, JSON.stringify({ blockedUsers: [] }));
        console.log('Initialized empty blocked users file');
    }
}

// API Routes - Define these BEFORE static file handling
const apiRouter = express.Router();

apiRouter.get('/blocked-users', async (req, res) => {
    console.log('GET /api/blocked-users called');
    try {
        const data = await fs.readFile(BLOCKED_USERS_FILE, 'utf8');
        console.log('Sending blocked users:', data);
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading blocked users:', error);
        res.status(500).json({ error: 'Failed to get blocked users' });
    }
});

apiRouter.post('/blocked-users', async (req, res) => {
    console.log('POST /api/blocked-users called with body:', req.body);
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const data = await fs.readFile(BLOCKED_USERS_FILE, 'utf8');
        const blockedUsers = JSON.parse(data);
        
        if (!blockedUsers.blockedUsers.includes(username)) {
            blockedUsers.blockedUsers.push(username);
            await fs.writeFile(BLOCKED_USERS_FILE, JSON.stringify(blockedUsers, null, 2));
            console.log('Added blocked user:', username);
        }
        
        res.json(blockedUsers);
    } catch (error) {
        console.error('Error adding blocked user:', error);
        res.status(500).json({ error: 'Failed to add blocked user' });
    }
});

apiRouter.delete('/blocked-users/:username', async (req, res) => {
    console.log('DELETE /api/blocked-users/:username called with username:', req.params.username);
    try {
        const { username } = req.params;
        const data = await fs.readFile(BLOCKED_USERS_FILE, 'utf8');
        const blockedUsers = JSON.parse(data);
        
        blockedUsers.blockedUsers = blockedUsers.blockedUsers.filter(user => user !== username);
        await fs.writeFile(BLOCKED_USERS_FILE, JSON.stringify(blockedUsers, null, 2));
        console.log('Removed blocked user:', username);
        
        res.json(blockedUsers);
    } catch (error) {
        console.error('Error removing blocked user:', error);
        res.status(500).json({ error: 'Failed to remove blocked user' });
    }
});

// Mount API routes
app.use('/api', apiRouter);

// Serve static files AFTER API routes
app.use(express.static(path.join(__dirname, '..')));

// Catch-all route for SPA - this should be LAST
app.get('*', function(req, res) {
    console.log('Catch-all route hit for:', req.url);
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Initialize blocked users file and start server
initBlockedUsersFile().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
        console.log('API endpoints:');
        console.log(`  GET    http://localhost:${port}/api/blocked-users`);
        console.log(`  POST   http://localhost:${port}/api/blocked-users`);
        console.log(`  DELETE http://localhost:${port}/api/blocked-users/:username`);
    });
}).catch(error => {
    console.error('Failed to initialize server:', error);
});
