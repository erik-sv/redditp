// This node server is not required, you can use index.html directly off
// the file system or a static host but you just have to use a question mark e.g.:
// http://localhost:8080/index.html?/r/gifs

var http = require('http');
var path = require('path');

var express = require('express');

var app = express();

const isProd = process.env.NODE_ENV === 'production';

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

const axios = require('axios');

const publicFolder = [
    '.well-known',
    'css',
    'images',
    'js'
];

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

app.set('port', process.env.PORT || 3600);

var server = http.createServer(app);

app.get('/*', function (req, res) {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(app.get('port'), function () {
    console.log(`Server running in ${isProd ? 'production' : 'development'} mode on port ${app.get('port')}`);
});