const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all origins (testing purposes)
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname)));

// Testing app route - main testing interface
app.get('/test', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-app.html'));
});

// Handle invite link routes
app.get('/room/:inviteCode', (req, res) => {
    const inviteCode = req.params.inviteCode;
    
    // Validate invite code format
    if (!/^[A-Z0-9]{6}$/i.test(inviteCode)) {
        return res.status(400).sendFile(path.join(__dirname, 'index.html'));
    }
    
    // Serve the main page for all valid invite code formats
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Trinity web server running on port ${port}`);
    console.log(`Visit: http://localhost:${port}`);
    console.log(`Test invite: http://localhost:${port}/room/ABC123`);
});

module.exports = app;