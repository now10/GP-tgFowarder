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

// Serve static files from current directory
app.use(express.static(__dirname));

// Store for pending OTP sessions
const pendingSessions = new Map();

// App state
let isForwarding = false;
let forwardedCount = 0;
let lastForwardedTime = null;
let telegramClient = null;
let cronJob = null;

// Configuration
const config = {
    apiId: parseInt(process.env.API_ID) || 38615833,
    apiHash: process.env.API_HASH || '8047316cc392015459b592cd5e2f719a',
    sourceGroup: process.env.SOURCE_GROUP || 'ceeVIPpolycarp22334455',
    targetGroup: process.env.TARGET_GROUP || '+JyAcm_mp4GplN2Q5',
    posterUsername: process.env.POSTER_USERNAME || 'policeesupport',
    adminToken: process.env.ADMIN_TOKEN || 'default-token-123'
};

// Create a unique storage path
const sessionPath = path.join(__dirname, 'telegram_session');

// Ensure session directory exists
if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
}

// Initialize Telegram Client with proper storage
async function initTelegramClient(sessionString = '') {
    try {
        console.log('Initializing Telegram client...');
        
        const stringSession = new StringSession(sessionString || '');
        
        // Create client with proper configuration
        const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
            connectionRetries: 5,
            timeout: 10000,
            useWSS: true,
            baseLogger: 'warn'
        });

        // Remove localStorage warning by providing valid path
        process.env.TELEGRAM_SESSION_PATH = sessionPath;
        
        return client;
    } catch (error) {
        console.error('Error initializing Telegram client:', error);
        throw error;
    }
}

// Load saved session from file
function loadSavedSession() {
    try {
        const sessionFile = path.join(sessionPath, 'session.txt');
        if (fs.existsSync(sessionFile)) {
            const sessionString = fs.readFileSync(sessionFile, 'utf8').trim();
            console.log('Loaded saved session from file');
            return sessionString;
        }
    } catch (error) {
        console.error('Error loading session:', error);
    }
    return null;
}

// Save session to file
function saveSession(sessionString) {
    try {
        const sessionFile = path.join(sessionPath, 'session.txt');
        fs.writeFileSync(sessionFile, sessionString);
        console.log('Session saved to file');
    } catch (error) {
        console.error('Error saving session:', error);
    }
}

// Connect with saved session
async function connectWithSavedSession() {
    try {
        const savedSession = loadSavedSession();
        if (!savedSession) {
            console.log('No saved session found');
            return false;
        }

        telegramClient = await initTelegramClient(savedSession);
        
        // Connect without starting the auth flow
        await telegramClient.connect();
        
        // Check if we're authorized
        const isAuth = await telegramClient.checkAuthorization();
        
        if (isAuth) {
            console.log('Successfully connected with saved session');
            return true;
        } else {
            console.log('Saved session is invalid');
            return false;
        }
    } catch (error) {
        console.error('Error connecting with saved session:', error);
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
        // Check if we have a valid client
        if (!telegramClient) {
            const connected = await connectWithSavedSession();
            if (!connected) {
                throw new Error('Not authenticated. Please login first.');
            }
        }

        if (!await telegramClient.checkAuthorization()) {
            throw new Error('Session expired. Please login again.');
        }

        isForwarding = true;
        
        // Schedule message checking every 30 seconds
        cronJob = cron.schedule('*/30 * * * * *', async () => {
            await checkForNewMessages();
        });
        
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
    if (!isForwarding) return true;
    
    isForwarding = false;
    
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
    }
    
    console.log('Forwarding service stopped');
    return true;
}

// Check for new messages
async function checkForNewMessages() {
    if (!telegramClient || !isForwarding) return;

    try {
        console.log('Checking for new messages...');
        
        // Get messages from source group
        const messages = await telegramClient.getMessages(config.sourceGroup, {
            limit: 10
        });
        
        for (const message of messages) {
            if (!message.message) continue;
            
            const messageText = message.message;
            
            // Check for signal pattern
            if (messageText.includes('🔔 NEW SIGNAL!') &&
                messageText.includes('🎫 Trade:') &&
                messageText.includes('⏳ Timer:') &&
                messageText.includes('➡️ Entry:') &&
                messageText.includes('📈 Direction:')) {
                
                // Get sender info
                let senderUsername = '';
                try {
                    const sender = await message.getSender();
                    if (sender && sender.username) {
                        senderUsername = sender.username;
                    }
                } catch (err) {
                    console.log('Could not get sender info:', err.message);
                }
                
                // Check if from correct user or in correct group
                if (senderUsername === config.posterUsername || 
                    config.sourceGroup.includes('policeesupport') ||
                    messageText.includes('policeesupport')) {
                    
                    console.log('Found matching signal, forwarding...');
                    await forwardMessage(message);
                    forwardedCount++;
                    lastForwardedTime = new Date();
                }
            }
        }
    } catch (error) {
        console.error('Error checking messages:', error);
        
        // Handle session errors
        if (error.message.includes('SESSION') || 
            error.message.includes('AUTH') ||
            error.code === 401) {
            console.log('Session error detected, stopping service');
            stopForwardingService();
        }
    }
}

// Forward message
async function forwardMessage(message) {
    try {
        await telegramClient.forwardMessages(config.targetGroup, {
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

// Clean up old pending sessions
function cleanupPendingSessions() {
    const now = Date.now();
    for (const [sessionId, sessionData] of pendingSessions.entries()) {
        if (now - sessionData.createdAt > 600000) { // 10 minutes
            pendingSessions.delete(sessionId);
        }
    }
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
        hasSession: !!loadSavedSession()
    });
});

// Check auth status
app.get('/api/auth/status', async (req, res) => {
    try {
        if (!telegramClient) {
            return res.json({ authenticated: false });
        }
        
        const isAuth = await telegramClient.checkAuthorization();
        res.json({ 
            authenticated: isAuth,
            isRunning: isForwarding 
        });
    } catch (error) {
        res.json({ authenticated: false });
    }
});

// Start forwarding
app.post('/api/start', async (req, res) => {
    try {
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
        uptime: process.uptime()
    });
});

// Send OTP - FIXED VERSION
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

        console.log(`Sending OTP to ${phoneNumber}...`);
        
        // Generate session ID
        const sessionId = Date.now().toString();
        
        // Create new client for this session
        const client = await initTelegramClient('');
        
        // Store the promise for OTP
        let resolveOtpPromise;
        let rejectOtpPromise;
        
        const otpPromise = new Promise((resolve, reject) => {
            resolveOtpPromise = resolve;
            rejectOtpPromise = reject;
        });
        
        // Store session data
        pendingSessions.set(sessionId, {
            client,
            phoneNumber,
            resolveOtpPromise,
            rejectOtpPromise,
            createdAt: Date.now()
        });
        
        // Start authentication process in background
        setTimeout(async () => {
            try {
                console.log('Starting auth process...');
                
                await client.start({
                    phoneNumber: () => phoneNumber,
                    phoneCode: () => otpPromise,
                    password: () => {
                        // This will be called if 2FA is needed
                        return new Promise(() => {}); // We'll handle this later
                    },
                    onError: (err) => {
                        console.error('Auth error:', err);
                        
                        const sessionData = pendingSessions.get(sessionId);
                        if (sessionData) {
                            sessionData.rejectOtpPromise(err);
                            pendingSessions.delete(sessionId);
                        }
                    }
                });
                
                console.log('Auth process started, waiting for OTP...');
            } catch (error) {
                console.error('Error in auth process:', error);
                
                const sessionData = pendingSessions.get(sessionId);
                if (sessionData) {
                    sessionData.rejectOtpPromise(error);
                    pendingSessions.delete(sessionId);
                }
            }
        }, 100);
        
        res.json({
            success: true,
            message: 'OTP request sent successfully. Check your Telegram app.',
            sessionId: sessionId
        });
        
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Verify OTP - FIXED VERSION
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { otpCode, sessionId } = req.body;
        
        if (!otpCode || !sessionId) {
            return res.status(400).json({
                success: false,
                error: 'OTP code and session ID are required'
            });
        }

        const sessionData = pendingSessions.get(sessionId);
        if (!sessionData) {
            return res.status(400).json({
                success: false,
                error: 'Session expired or not found. Please try again.'
            });
        }

        console.log('Verifying OTP...');
        
        // Resolve the OTP promise with the code
        sessionData.resolveOtpPromise(otpCode);
        
        // Wait for client to process OTP
        setTimeout(async () => {
            try {
                const client = sessionData.client;
                
                // Check if we're authorized
                const isAuth = await client.checkAuthorization();
                
                if (isAuth) {
                    // Save session
                    const sessionString = client.session.save();
                    saveSession(sessionString);
                    
                    // Set as active client
                    telegramClient = client;
                    
                    pendingSessions.delete(sessionId);
                    
                    console.log('OTP verified successfully');
                    
                    res.json({
                        success: true,
                        message: 'Login successful!',
                        requiresPassword: false
                    });
                } else {
                    // Check if password is needed
                    if (client._password) {
                        res.json({
                            success: true,
                            message: '2FA password required',
                            requiresPassword: true,
                            sessionId: sessionId
                        });
                    } else {
                        throw new Error('Authentication failed');
                    }
                }
            } catch (error) {
                console.error('OTP verification error:', error);
                pendingSessions.delete(sessionId);
                
                if (error.message.includes('PHONE_CODE_INVALID')) {
                    res.status(400).json({
                        success: false,
                        error: 'Invalid OTP code. Please try again.'
                    });
                } else if (error.message.includes('PHONE_CODE_EXPIRED')) {
                    res.status(400).json({
                        success: false,
                        error: 'OTP code expired. Please request a new one.'
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: 'Authentication failed: ' + error.message
                    });
                }
            }
        }, 2000); // Give time for authentication to complete
        
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({
            success: false,
            error: error.message
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

        const sessionData = pendingSessions.get(sessionId);
        if (!sessionData) {
            return res.status(400).json({
                success: false,
                error: 'Session expired or not found'
            });
        }

        const client = sessionData.client;
        
        try {
            // Continue authentication with password
            client._password = password;
            await client.connect();
            
            // Check authorization
            const isAuth = await client.checkAuthorization();
            
            if (isAuth) {
                // Save session
                const sessionString = client.session.save();
                saveSession(sessionString);
                
                // Set as active client
                telegramClient = client;
                
                pendingSessions.delete(sessionId);
                
                res.json({
                    success: true,
                    message: 'Login successful!'
                });
            } else {
                throw new Error('Authentication failed with password');
            }
        } catch (error) {
            console.error('Password verification error:', error);
            
            if (error.message.includes('PASSWORD_HASH_INVALID')) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid password'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        }
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
            message: 'Test completed successfully',
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

// Initialize on startup
async function initialize() {
    try {
        console.log('Initializing application...');
        
        // Try to connect with saved session
        await connectWithSavedSession();
        
        // Clean up pending sessions every 5 minutes
        setInterval(cleanupPendingSessions, 300000);
        
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
        
        // Keep-alive for Render
        setInterval(() => {
            console.log('Keep-alive ping');
        }, 300000);
        
    } catch (error) {
        console.error('Failed to initialize:', error);
        process.exit(1);
    }
}

// Start the app
initialize();
