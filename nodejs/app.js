const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = process.env.PORT || 8080;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Path to blocked users file
const BLOCKED_USERS_FILE = path.join(__dirname, 'data', 'blocked_users.json');

// Initialize blocked users file if it doesn't exist
async function initBlockedUsersFile() {
    try {
        await fs.access(BLOCKED_USERS_FILE);
    } catch {
        await fs.writeFile(BLOCKED_USERS_FILE, JSON.stringify({ blockedUsers: [] }));
    }
}

// Get blocked users
app.get('/api/blocked-users', async (req, res) => {
    try {
        const data = await fs.readFile(BLOCKED_USERS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading blocked users:', error);
        res.status(500).json({ error: 'Failed to get blocked users' });
    }
});

// Add blocked user
app.post('/api/blocked-users', async (req, res) => {
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
        }
        
        res.json(blockedUsers);
    } catch (error) {
        console.error('Error adding blocked user:', error);
        res.status(500).json({ error: 'Failed to add blocked user' });
    }
});

// Remove blocked user
app.delete('/api/blocked-users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const data = await fs.readFile(BLOCKED_USERS_FILE, 'utf8');
        const blockedUsers = JSON.parse(data);
        
        blockedUsers.blockedUsers = blockedUsers.blockedUsers.filter(user => user !== username);
        await fs.writeFile(BLOCKED_USERS_FILE, JSON.stringify(blockedUsers, null, 2));
        
        res.json(blockedUsers);
    } catch (error) {
        console.error('Error removing blocked user:', error);
        res.status(500).json({ error: 'Failed to remove blocked user' });
    }
});

// Always respond with the html, except for the above exceptions.
// Because it's a single page app.
app.get('/*', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});

// Initialize blocked users file and start server
initBlockedUsersFile().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}).catch(console.error);
