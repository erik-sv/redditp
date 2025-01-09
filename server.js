// This node server is not required, you can use index.html directly off
// the file system or a static host but you just have to use a question mark e.g.:
// http://localhost:8080/index.html?/r/gifs

var http = require('http');
var path = require('path');
var express = require('express');
var fs = require('fs').promises;
var app = express();

const isProd = process.env.NODE_ENV === 'production';

// Middleware to parse JSON bodies
app.use(express.json());

// Security headers
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  });
  next();
});

// CORS middleware for local development
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!isProd && origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const axios = require('axios');

// Path to blocked users file
const BLOCKED_USERS_FILE = path.join(__dirname, 'data', 'blocked_users.json');

// Initialize blocked users file if it doesn't exist
async function initBlockedUsersFile() {
    try {
        const dir = path.dirname(BLOCKED_USERS_FILE);
        console.log('Creating data directory if needed:', dir);
        await fs.mkdir(dir, { recursive: true });
        
        try {
            await fs.access(BLOCKED_USERS_FILE);
            console.log('Blocked users file exists at:', BLOCKED_USERS_FILE);
        } catch {
            console.log('Creating blocked users file at:', BLOCKED_USERS_FILE);
            await fs.writeFile(BLOCKED_USERS_FILE, JSON.stringify({ blockedUsers: [] }));
        }
    } catch (error) {
        console.error('Error initializing blocked users file:', error);
        throw error;
    }
}

// API Routes for blocked users
app.get('/api/blocked-users', async (req, res) => {
    try {
        const data = await fs.readFile(BLOCKED_USERS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading blocked users:', error);
        res.status(500).json({ error: 'Failed to get blocked users' });
    }
});

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

// Proxy endpoint for Reddit JSON requests
app.get('/api/reddit/*', async (req, res) => {
  try {
    const redditPath = req.params[0];
    const url = `https://old.reddit.com/${redditPath}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'redditp/1.0.0'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Reddit API error:', error.message);
    res.status(error.response?.status || 500).json({
      error: 'Error fetching data from Reddit'
    });
  }
});

const publicFolder = [
    '.well-known',
    'css',
    'images',
    'js'
];

// Serve static files
for (let name of publicFolder) {
    if (isProd) {
        app.use('/' + name, express.static(path.join(__dirname, name), {
            maxAge: '1y',
            etag: true,
            lastModified: true
        }));
    } else {
        app.use('/' + name, express.static(path.join(__dirname, name)));
    }
}

app.set('port', process.env.PORT || 3600);

var server = http.createServer(app);

// Catch-all route - should be last
app.get('/*', function (req, res) {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize blocked users file and start server
initBlockedUsersFile().then(() => {
    server.listen(app.get('port'), function () {
        console.log(`Server running in ${isProd ? 'production' : 'development'} mode on port ${app.get('port')}`);
    });
}).catch(error => {
    console.error('Failed to initialize server:', error);
});