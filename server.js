const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Configuration
const config = {
    apiId: parseInt(process.env.API_ID) || 38615833,
    apiHash: process.env.API_HASH || '8047316cc392015459b592cd5e2f719a',
    sourceGroup: process.env.SOURCE_GROUP || 'ceeVIPpolycarp22334455',
    targetGroup: process.env.TARGET_GROUP || '+JyAcm_mp4GplN2Q5',
    posterUsername: process.env.POSTER_USERNAME || 'policeesupport'
};

// App state
let isForwarding = false;
let forwardedCount = 0;
let lastForwardedTime = null;

// Ensure session directory exists
const sessionDir = path.join(__dirname, 'telegram_session');
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// API Routes

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Get config
app.get('/api/config', (req, res) => {
    res.json({
        apiId: config.apiId,
        sourceGroup: config.sourceGroup,
        targetGroup: config.targetGroup,
        posterUsername: config.posterUsername,
        serviceStatus: isForwarding ? 'running' : 'stopped',
        forwardedCount: forwardedCount,
        hasSession: false
    });
});

// Check auth status
app.get('/api/auth/status', (req, res) => {
    res.json({ 
        authenticated: false,
        isRunning: isForwarding 
    });
});

// Start forwarding (simulated)
app.post('/api/start', async (req, res) => {
    try {
        isForwarding = true;
        
        res.json({
            success: true,
            message: 'Forwarding service started (simulated)',
            isRunning: true,
            forwardedCount: forwardedCount
        });
    } catch (error) {
        console.error('Error starting service:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Stop forwarding
app.post('/api/stop', (req, res) => {
    try {
        isForwarding = false;
        
        res.json({
            success: true,
            message: 'Forwarding service stopped',
            isRunning: false
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get status
app.get('/api/status', (req, res) => {
    res.json({
        isRunning: isForwarding,
        forwardedCount: forwardedCount,
        lastForwarded: lastForwardedTime,
        uptime: process.uptime()
    });
});

// Send OTP (simulated)
app.post('/api/send-otp', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        // Validate phone number format
        if (!phoneNumber.match(/^\+\d{10,15}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number format. Use format: +1234567890'
            });
        }

        console.log(`Simulated OTP sent to ${phoneNumber}`);
        
        // Simulate OTP sending
        const sessionId = Date.now().toString();
        
        res.json({
            success: true,
            message: 'Simulated: OTP would be sent to your Telegram app',
            sessionId: sessionId,
            note: 'This is a simulation. In production, real OTP would be sent.'
        });
        
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Verify OTP (simulated)
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { otpCode, sessionId } = req.body;
        
        if (!otpCode || !sessionId) {
            return res.status(400).json({
                success: false,
                error: 'OTP code and session ID are required'
            });
        }

        console.log(`Simulated OTP verification for code: ${otpCode}`);
        
        // Simulate successful verification
        res.json({
            success: true,
            message: 'Simulated: Login successful!',
            requiresPassword: false
        });
        
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Verify 2FA Password (simulated)
app.post('/api/verify-password', async (req, res) => {
    try {
        const { password, sessionId } = req.body;
        
        if (!password || !sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Password and session ID are required'
            });
        }

        console.log(`Simulated password verification`);
        
        // Simulate successful verification
        res.json({
            success: true,
            message: 'Simulated: Login successful with 2FA!'
        });
    } catch (error) {
        console.error('Error verifying password:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test endpoint
app.post('/api/test', async (req, res) => {
    try {
        // Simulate successful test
        forwardedCount++;
        lastForwardedTime = new Date();
        
        res.json({
            success: true,
            message: 'Test completed successfully (simulated)',
            forwardedCount: forwardedCount,
            testSignal: {
                pattern: "🔔 NEW SIGNAL!",
                trade: "EUR/CAD",
                direction: "SELL"
            }
        });
    } catch (error) {
        console.error('Test error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Telegram Auto Forwarder',
        version: '1.0.0',
        isRunning: isForwarding,
        uptime: process.uptime()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
========================================
Telegram Auto Forwarder
========================================
Server running on port: ${PORT}
API ID: ${config.apiId}
Source: ${config.sourceGroup}
Target: ${config.targetGroup}
Poster: ${config.posterUsername}
========================================
    `);
});
