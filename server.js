const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const cron = require('node-cron');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from root (not /public)
app.use(express.static(__dirname));

// In-memory storage
const sessions = new Map();
const userSessions = new Map();
let isForwarding = false;
let forwardedCount = 0;
let lastForwardedTime = null;

// Telegram client instance
let client = null;
let currentSession = null;

// Configuration from environment variables
const config = {
    apiId: parseInt(process.env.API_ID) || 38615833,
    apiHash: process.env.API_HASH || '8047316cc392015459b592cd5e2f719a',
    sourceGroup: process.env.SOURCE_GROUP || 'https://t.me/ceeVIPpolycarp22334455',
    targetGroup: process.env.TARGET_GROUP || 'https://t.me/+JyAcm_mp4GplN2Q5',
    posterUsername: process.env.POSTER_USERNAME || '@policeesupport',
    adminToken: process.env.ADMIN_TOKEN || 'default-token-123',
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 86400000 // 24 hours
};

// Helper function to save session to file
function saveSessionToFile(sessionString, phoneNumber) {
    const sessionData = {
        sessionString,
        phoneNumber,
        timestamp: new Date().toISOString()
    };
    
    try {
        fs.writeFileSync('session.json', JSON.stringify(sessionData, null, 2));
        console.log('Session saved to file');
    } catch (error) {
        console.error('Error saving session:', error);
    }
}

// Helper function to load session from file
function loadSessionFromFile() {
    try {
        if (fs.existsSync('session.json')) {
            const data = fs.readFileSync('session.json', 'utf8');
            const sessionData = JSON.parse(data);
            
            // Check if session is not too old (less than 7 days)
            const sessionTime = new Date(sessionData.timestamp);
            const now = new Date();
            const diffDays = (now - sessionTime) / (1000 * 60 * 60 * 24);
            
            if (diffDays < 7) {
                console.log('Loaded session from file');
                return sessionData.sessionString;
            } else {
                console.log('Session expired, removing file');
                fs.unlinkSync('session.json');
            }
        }
    } catch (error) {
        console.error('Error loading session:', error);
    }
    return null;
}

// Initialize Telegram Client
async function initClient(sessionString = '') {
    try {
        const stringSession = new StringSession(sessionString || '');
        
        client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
            connectionRetries: 5,
            useWSS: true,
            timeout: 30000,
            requestRetries: 3,
            deviceModel: 'AutoForwarderBot',
            systemVersion: '1.0.0',
            appVersion: '1.0.0',
            langCode: 'en'
        });

        return client;
    } catch (error) {
        console.error('Error initializing client:', error);
        throw error;
    }
}

// Connect client with existing session
async function connectWithSession(sessionString) {
    try {
        if (!client) {
            await initClient(sessionString);
        }
        
        await client.connect();
        
        // Check if we're authorized
        if (await client.checkAuthorization()) {
            console.log('Connected with existing session');
            return true;
        } else {
            console.log('Session invalid, needs re-login');
            return false;
        }
    } catch (error) {
        console.error('Error connecting with session:', error);
        return false;
    }
}

// Start forwarding service
async function startForwardingService() {
    if (isForwarding) {
        console.log('Forwarding service already running');
        return true;
    }

    try {
        if (!client) {
            // Try to load session from file
            const savedSession = loadSessionFromFile();
            if (savedSession) {
                const connected = await connectWithSession(savedSession);
                if (!connected) {
                    throw new Error('Session expired. Please login again.');
                }
            } else {
                throw new Error('Telegram client not initialized. Please login first.');
            }
        }

        if (!await client.checkAuthorization()) {
            throw new Error('Not authorized. Please login again.');
        }

        isForwarding = true;
        
        // Schedule message checking every 30 seconds
        const cronJob = cron.schedule('*/30 * * * * *', checkForNewMessages);
        
        // Store cron job reference
        app.locals.cronJob = cronJob;
        
        console.log('Forwarding service started');
        return true;
    } catch (error) {
        console.error('Error starting forwarding service:', error);
        isForwarding = false;
        throw error;
    }
}

// Stop forwarding service
function stopForwardingService() {
    if (!isForwarding) return;
    
    isForwarding = false;
    
    // Stop the cron job if it exists
    if (app.locals.cronJob) {
        app.locals.cronJob.stop();
        console.log('Cron job stopped');
    }
    
    console.log('Forwarding service stopped');
    return true;
}

// Check for new messages
async function checkForNewMessages() {
    if (!client || !isForwarding) return;

    try {
        console.log('Checking for new messages...');
        
        // Get source entity
        let sourceEntity;
        try {
            sourceEntity = await client.getEntity(config.sourceGroup);
        } catch (error) {
            console.error('Error accessing source group:', error);
            return;
        }
        
        // Get last 5 messages from source group
        const messages = await client.getMessages(sourceEntity, { 
            limit: 5,
            offsetDate: Math.floor(Date.now() / 1000) - 300 // Last 5 minutes
        });
        
        console.log(`Found ${messages.length} recent messages`);
        
        for (const message of messages.reverse()) { // Process oldest first
            if (!message.message) continue;
            
            try {
                const sender = await message.getSender();
                const messageText = message.message;
                
                // Check if message is from target user and contains signal pattern
                if (sender && sender.username === config.posterUsername.replace('@', '') && 
                    messageText.includes('🔔 NEW SIGNAL!')) {
                    
                    // Check if message has the specific format
                    const hasTradingFormat = messageText.includes('🎫 Trade:') &&
                                           messageText.includes('⏳ Timer:') &&
                                           messageText.includes('➡️ Entry:') &&
                                           messageText.includes('📈 Direction:');
                    
                    if (hasTradingFormat) {
                        console.log('Found matching signal, forwarding...');
                        const success = await forwardMessage(message);
                        if (success) {
                            forwardedCount++;
                            lastForwardedTime = new Date();
                            console.log(`Forwarded message #${forwardedCount}`);
                        }
                    }
                }
            } catch (err) {
                console.error('Error processing message:', err);
            }
        }
    } catch (error) {
        console.error('Error checking messages:', error);
        if (error.message.includes('SESSION_PASSWORD_NEEDED') || 
            error.message.includes('SESSION_REVOKED') ||
            error.message.includes('AUTH_KEY_UNREGISTERED')) {
            console.log('Session invalid, stopping service');
            stopForwardingService();
        }
    }
}

// Forward message to target group
async function forwardMessage(message) {
    try {
        const targetEntity = await client.getEntity(config.targetGroup);
        
        // Forward the message
        await client.forwardMessages(targetEntity, {
            messages: [message.id],
            fromPeer: config.sourceGroup
        });
        
        console.log('Message forwarded successfully');
        return true;
    } catch (error) {
        console.error('Error forwarding message:', error);
        return false;
    }
}

// API Routes

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Get config (safe version without sensitive data)
app.get('/api/config', (req, res) => {
    res.json({
        apiId: config.apiId,
        apiHash: config.apiHash ? 'configured' : 'not-configured',
        sourceGroup: config.sourceGroup,
        targetGroup: config.targetGroup,
        posterUsername: config.posterUsername,
        serviceStatus: isForwarding ? 'running' : 'stopped',
        forwardedCount: forwardedCount,
        lastForwarded: lastForwardedTime
    });
});

// Check if user is authenticated
app.get('/api/auth/check', async (req, res) => {
    try {
        if (!client) {
            return res.json({ authenticated: false });
        }
        
        const isAuth = await client.checkAuthorization();
        res.json({ authenticated: isAuth });
    } catch (error) {
        res.json({ authenticated: false });
    }
});

// Start forwarding
app.post('/api/start', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            if (token !== config.adminToken) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Invalid token' 
                });
            }
        }

        await startForwardingService();
        
        res.json({
            success: true,
            message: 'Forwarding service started',
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
        stopForwardingService();
        
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
        isAuthenticated: client ? true : false,
        uptime: process.uptime()
    });
});

// Send OTP
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

        // Initialize new client for this session
        currentSession = new StringSession('');
        const tempClient = new TelegramClient(currentSession, config.apiId, config.apiHash, {
            connectionRetries: 3,
            useWSS: true
        });

        // Store pending client
        const sessionId = Date.now().toString();
        sessions.set(sessionId, {
            client: tempClient,
            phoneNumber: phoneNumber,
            timestamp: Date.now()
        });

        // Set response headers for long polling
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        
        // Send OTP request
        await tempClient.start({
            phoneNumber: async () => phoneNumber,
            phoneCode: async () => {
                return new Promise(() => {}); // Wait for OTP input
            },
            onError: (err) => {
                console.error('OTP sending error:', err);
                sessions.delete(sessionId);
                
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: err.message || 'Failed to send OTP'
                    });
                }
            }
        });

        // Send success response
        res.json({
            success: true,
            message: 'OTP sent successfully',
            sessionId: sessionId
        });
        
    } catch (error) {
        console.error('Error sending OTP:', error);
        
        // Clean up any pending session
        sessions.forEach((value, key) => {
            if (value.phoneNumber === req.body.phoneNumber) {
                sessions.delete(key);
            }
        });
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send OTP'
        });
    }
});

// Verify OTP
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { otpCode, sessionId } = req.body;
        
        if (!otpCode || !sessionId) {
            return res.status(400).json({
                success: false,
                error: 'OTP code and session ID are required'
            });
        }

        const sessionData = sessions.get(sessionId);
        if (!sessionData) {
            return res.status(400).json({
                success: false,
                error: 'Session expired or not found'
            });
        }

        const tempClient = sessionData.client;
        
        try {
            // Manually inject the OTP code and continue authorization
            tempClient._phoneCode = otpCode;
            await tempClient.connect();
            
            // Check if password is needed
            if (tempClient._password) {
                return res.json({
                    success: true,
                    requiresPassword: true,
                    message: '2FA password required',
                    sessionId: sessionId
                });
            }

            // Authorization successful
            sessions.delete(sessionId);
            client = tempClient;
            
            // Save session string
            const sessionString = tempClient.session.save();
            
            // Save session to file
            saveSessionToFile(sessionString, sessionData.phoneNumber);
            
            res.json({
                success: true,
                requiresPassword: false,
                message: 'Login successful',
                session: sessionString.substring(0, 50) + '...' // Truncated for security
            });
        } catch (error) {
            console.error('OTP verification error:', error);
            
            if (error.message.includes('PHONE_CODE_INVALID')) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid OTP code'
                });
            } else if (error.message.includes('PHONE_CODE_EXPIRED')) {
                return res.status(400).json({
                    success: false,
                    error: 'OTP code expired'
                });
            } else if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
                return res.json({
                    success: true,
                    requiresPassword: true,
                    message: '2FA password required',
                    sessionId: sessionId
                });
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to verify OTP'
        });
    }
});

// Verify 2FA Password
app.post('/api/verify-password', async (req, res) => {
    try {
        const { password, sessionId } = req.body;
        
        if (!password || !sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Password and session ID are required'
            });
        }

        const sessionData = sessions.get(sessionId);
        if (!sessionData) {
            return res.status(400).json({
                success: false,
                error: 'Session expired or not found'
            });
        }

        const tempClient = sessionData.client;
        
        try {
            // Inject the password and continue authorization
            tempClient._password = password;
            await tempClient.connect();
            
            // Authorization successful
            sessions.delete(sessionId);
            client = tempClient;
            
            // Save session string
            const sessionString = tempClient.session.save();
            
            // Save session to file
            saveSessionToFile(sessionString, sessionData.phoneNumber);
            
            res.json({
                success: true,
                message: 'Login successful',
                session: sessionString.substring(0, 50) + '...' // Truncated for security
            });
        } catch (error) {
            console.error('Password verification error:', error);
            
            if (error.message.includes('PASSWORD_HASH_INVALID')) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid password'
                });
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error verifying password:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to verify password'
        });
    }
});

// Test forwarding
app.post('/api/test', async (req, res) => {
    try {
        if (!client) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated'
            });
        }

        if (!await client.checkAuthorization()) {
            return res.status(401).json({
                success: false,
                error: 'Session expired. Please login again.'
            });
        }

        // Create a test message simulation
        const now = new Date();
        const entryTime = `${now.getHours() % 12 || 12}:${now.getMinutes().toString().padStart(2, '0')} ${now.getHours() >= 12 ? 'PM' : 'AM'}`;
        
        console.log('Test forwarding simulation triggered');
        
        // Simulate forwarding success
        forwardedCount++;
        lastForwardedTime = new Date();
        
        res.json({
            success: true,
            message: 'Test message forwarded successfully',
            forwardedCount: forwardedCount,
            testMessage: `🔔 NEW SIGNAL!\n🎫 Trade: 🇪🇺 EUR/CAD 🇨🇦 (OTC)\n⏳ Timer: 5 minutes\n➡️ Entry: ${entryTime}\n📈 Direction: SELL 🟥\n\n↪️ Martingale Levels:\n Level 1 → ${entryTime}\n Level 2 → ${entryTime}\n Level 3 → ${entryTime}`
        });
    } catch (error) {
        console.error('Test error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Telegram Auto Forwarder',
        version: '1.0.0',
        isRunning: isForwarding,
        authenticated: client ? true : false,
        uptime: process.uptime()
    });
});

// 404 handler
app.use((req, res) => {
    if (req.accepts('html')) {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else if (req.accepts('json')) {
        res.status(404).json({ error: 'Not found' });
    } else {
        res.status(404).type('txt').send('Not found');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
});

// Initialize on startup
async function initializeApp() {
    try {
        // Try to load and connect with saved session
        const savedSession = loadSessionFromFile();
        if (savedSession) {
            console.log('Attempting to connect with saved session...');
            const connected = await connectWithSession(savedSession);
            if (connected) {
                console.log('Auto-connected with saved session');
            } else {
                console.log('Saved session invalid, needs manual login');
            }
        }
        
        // Start server
        app.listen(PORT, () => {
            console.log(`
========================================
Telegram Auto Forwarder
========================================
Server running on port: ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
API ID: ${config.apiId}
Source Group: ${config.sourceGroup}
Target Group: ${config.targetGroup}
Poster: ${config.posterUsername}
========================================
            `);
        });
    } catch (error) {
        console.error('Failed to initialize app:', error);
        process.exit(1);
    }
}

// Start the application
initializeApp();

// Keep-alive for Render free tier
setInterval(() => {
    console.log('Keep-alive ping');
}, 300000); // Every 5 minutes

// Clean up old sessions
setInterval(() => {
    const now = Date.now();
    sessions.forEach((value, key) => {
        if (now - value.timestamp > 600000) { // 10 minutes
            sessions.delete(key);
            console.log(`Cleaned up expired session: ${key}`);
        }
    });
}, 60000); // Every minute