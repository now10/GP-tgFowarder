"""
TELEGRAM SIGNAL FORWARDER
Forwards messages with "🔔 NEW SIGNAL!" header from source to target group
Deployment: Render.com
Author: Signal Forwarder
"""

import os
import asyncio
import logging
import sys
from datetime import datetime
from dotenv import load_dotenv
from telethon import TelegramClient, events

# Load environment variables from .env file
load_dotenv()

# ============================================================================
# CONFIGURATION - EDIT THESE IN RENDER DASHBOARD ENVIRONMENT VARIABLES
# ============================================================================

# Telegram API credentials (from https://my.telegram.org)
API_ID = int(os.getenv('API_ID', ''))
API_HASH = os.getenv('API_HASH', '')
PHONE_NUMBER = os.getenv('PHONE_NUMBER', '')

# Group URLs (get from Telegram group invite links)
SOURCE_GROUP_URL = os.getenv('SOURCE_GROUP_URL', 'https://t.me/iosassembly')
TARGET_GROUP_URL = os.getenv('TARGET_GROUP_URL', 'https://t.me/acctdeveloperselling')

# Specific user to forward from (optional)
SOURCE_USERNAME = os.getenv('SOURCE_USERNAME', '@Systembadgetickverify02')

# Signal configuration
SIGNAL_HEADER = os.getenv('SIGNAL_HEADER', '🔔 NEW SIGNAL!')
ADD_TIMESTAMP = os.getenv('ADD_TIMESTAMP', 'true').lower() == 'true'
SEND_CONFIRMATION = os.getenv('SEND_CONFIRMATION', 'false').lower() == 'true'
FORWARD_DELAY = int(os.getenv('FORWARD_DELAY', '0'))

# ============================================================================
# DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU'RE DOING
# ============================================================================

# Setup logging for Render.com
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)  # Render captures stdout
    ]
)
logger = logging.getLogger(__name__)

class TelegramSignalForwarder:
    """Main class for forwarding Telegram signals."""
    
    def __init__(self):
        self.client = None
        self.source_group = None
        self.target_group = None
        self.source_user = None
        self.is_running = False
        
    def extract_username_from_url(self, url):
        """
        Extract username from Telegram URL.
        
        Examples:
        - https://t.me/iosassembly -> iosassembly
        - https://t.me/joinchat/ABC123 -> joinchat/ABC123
        - @username -> username
        """
        if not url:
            return ""
        
        # Remove protocol
        if url.startswith('https://'):
            url = url[8:]
        elif url.startswith('http://'):
            url = url[7:]
        
        # Remove 't.me/' prefix
        if url.startswith('t.me/'):
            url = url[5:]
        elif url.startswith('@'):
            url = url[1:]
        
        # Remove query parameters and trailing slash
        url = url.split('?')[0].rstrip('/')
        
        return url
    
    async def initialize_telegram_client(self):
        """
        Initialize Telegram client and connect to Telegram.
        
        This function will:
        1. Connect to Telegram using your credentials
        2. Handle first-time phone verification
        3. Get the source and target groups
        4. Find the specific user (if configured)
        """
        logger.info("🚀 INITIALIZING TELEGRAM SIGNAL FORWARDER")
        logger.info("=" * 60)
        
        try:
            # Step 1: Create Telegram client
            logger.info("📱 Creating Telegram client...")
            self.client = TelegramClient(
                'signal_forwarder_session',
                API_ID,
                API_HASH,
                device_model="Signal Forwarder v2.0",
                system_version="Render Cloud",
                app_version="2.0.0",
                connection_retries=10,
                timeout=60,
                request_retries=5,
                auto_reconnect=True
            )
            
            # Step 2: Connect to Telegram
            logger.info("🔗 Connecting to Telegram servers...")
            await self.client.connect()
            
            # Step 3: Check if we need phone verification
            if not await self.client.is_user_authorized():
                logger.info("🔐 FIRST-TIME SETUP DETECTED")
                logger.info("📱 Sending verification code request...")
                await self.client.send_code_request(PHONE_NUMBER)
                
                # Check for verification code in environment
                verification_code = os.getenv('TELEGRAM_CODE')
                
                if verification_code:
                    logger.info("✅ Found verification code in environment variables")
                    logger.info("🔑 Signing in with provided code...")
                    await self.client.sign_in(PHONE_NUMBER, verification_code)
                    logger.info("✅ Successfully logged in!")
                else:
                    logger.info("=" * 60)
                    logger.info("📱 PHONE VERIFICATION REQUIRED")
                    logger.info("=" * 60)
                    logger.info("1️⃣ Check your Telegram app for a verification code")
                    logger.info("2️⃣ Go to Render.com dashboard")
                    logger.info("3️⃣ Find your 'signal-forwarder' service")
                    logger.info("4️⃣ Click 'Environment' tab")
                    logger.info("5️⃣ Add a new environment variable:")
                    logger.info("   - Name: TELEGRAM_CODE")
                    logger.info("   - Value: [the code from Telegram]")
                    logger.info("6️⃣ Click 'Save Changes'")
                    logger.info("7️⃣ Wait for auto-restart (about 30 seconds)")
                    logger.info("=" * 60)
                    logger.info("⏳ Waiting for verification code...")
                    
                    # Wait for code (Render will restart when env var is added)
                    for i in range(180):  # Wait up to 3 minutes
                        await asyncio.sleep(1)
                        if i % 30 == 0:  # Log every 30 seconds
                            logger.info(f"⏱️ Still waiting... ({i+1}/180 seconds)")
                        
                        verification_code = os.getenv('TELEGRAM_CODE')
                        if verification_code:
                            logger.info("✅ Verification code received!")
                            await self.client.sign_in(PHONE_NUMBER, verification_code)
                            break
                    
                    if not verification_code:
                        logger.error("❌ No verification code provided after 3 minutes")
                        logger.info("Please add TELEGRAM_CODE environment variable and redeploy")
                        return False
            else:
                logger.info("✅ Using existing session (already logged in)")
            
            # Step 4: Get user information
            me = await self.client.get_me()
            logger.info(f"👤 Logged in as: {me.first_name} (@{me.username if me.username else 'no_username'})")
            
            # Step 5: Get source group
            logger.info("🔍 Finding source group...")
            source_identifier = self.extract_username_from_url(SOURCE_GROUP_URL)
            logger.info(f"   Looking for: {source_identifier}")
            self.source_group = await self.client.get_entity(source_identifier)
            logger.info(f"✅ Source group found: {self.source_group.title}")
            
            # Step 6: Get target group
            logger.info("🔍 Finding target group...")
            target_identifier = self.extract_username_from_url(TARGET_GROUP_URL)
            logger.info(f"   Looking for: {target_identifier}")
            self.target_group = await self.client.get_entity(target_identifier)
            logger.info(f"✅ Target group found: {self.target_group.title}")
            
            # Step 7: Get specific user (if configured)
            if SOURCE_USERNAME and SOURCE_USERNAME != '@Systembadgetickverify02':
                logger.info(f"🔍 Finding specific user: {SOURCE_USERNAME}")
                try:
                    self.source_user = await self.client.get_entity(SOURCE_USERNAME)
                    user_display = self.source_user.username or self.source_user.first_name or f"User {self.source_user.id}"
                    logger.info(f"✅ Specific user found: {user_display}")
                except Exception as e:
                    logger.warning(f"⚠️ Could not find user {SOURCE_USERNAME}: {e}")
                    logger.info("Will forward signals from any user")
            else:
                logger.info("📢 Will forward signals from ANY user in source group")
            
            logger.info("=" * 60)
            logger.info("✅ INITIALIZATION COMPLETE!")
            logger.info("=" * 60)
            
            return True
            
        except Exception as e:
            logger.error(f"❌ INITIALIZATION FAILED: {e}")
            logger.error("Please check your environment variables:")
            logger.error(f"API_ID: {'✓ Set' if API_ID else '✗ Missing'}")
            logger.error(f"API_HASH: {'✓ Set' if API_HASH else '✗ Missing'}")
            logger.error(f"PHONE_NUMBER: {'✓ Set' if PHONE_NUMBER else '✗ Missing'}")
            logger.error(f"SOURCE_GROUP_URL: {'✓ Set' if SOURCE_GROUP_URL else '✗ Missing'}")
            logger.error(f"TARGET_GROUP_URL: {'✓ Set' if TARGET_GROUP_URL else '✗ Missing'}")
            return False
    
    def is_signal_message(self, message_text):
        """
        Check if a message contains the signal header.
        
        Returns True if message contains "🔔 NEW SIGNAL!" anywhere in the text.
        """
        if not message_text:
            return False
        
        # Check if signal header is in the message
        return SIGNAL_HEADER in message_text
    
    async def forward_signal_message(self, event):
        """
        Process and forward a signal message.
        
        This function:
        1. Checks if message is from the correct user (if specified)
        2. Checks if message contains the signal header
        3. Adds timestamp and formatting
        4. Forwards to target group
        """
        try:
            message = event.message
            
            # Skip edited messages
            if message.edit_date:
                return
            
            # Get sender information
            sender = await message.get_sender()
            if not sender:
                logger.warning("⚠️ Could not get sender information")
                return
            
            # Check if we're filtering by specific user
            if self.source_user:
                if sender.id != self.source_user.id:
                    return  # Not from the specified user
            
            # Get message text
            message_text = message.text or message.message or ""
            if not message_text:
                return  # Skip media-only messages
            
            # Check if this is a signal message
            if not self.is_signal_message(message_text):
                return
            
            # Get sender display name
            sender_name = "Unknown"
            if hasattr(sender, 'username') and sender.username:
                sender_name = f"@{sender.username}"
            elif hasattr(sender, 'first_name') and sender.first_name:
                sender_name = sender.first_name
                if hasattr(sender, 'last_name') and sender.last_name:
                    sender_name += f" {sender.last_name}"
            elif hasattr(sender, 'title'):
                sender_name = sender.title
            
            logger.info("🎯" * 30)
            logger.info(f"📨 NEW SIGNAL DETECTED!")
            logger.info(f"👤 From: {sender_name}")
            logger.info(f"📝 Message preview: {message_text[:150]}...")
            
            # Apply delay if configured
            if FORWARD_DELAY > 0:
                logger.info(f"⏳ Waiting {FORWARD_DELAY} seconds before forwarding...")
                await asyncio.sleep(FORWARD_DELAY)
            
            # Create formatted message
            formatted_message = message_text
            
            # Add timestamp if enabled
            if ADD_TIMESTAMP:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")
                header = f"📡 **SIGNAL FORWARDED**\n"
                header += f"🕒 {timestamp}\n"
                header += f"👤 Source: {sender_name}\n"
                header += f"📊 From: {self.source_group.title}\n"
                header += "━━━━━━━━━━━━━━━━━━\n\n"
                formatted_message = header + message_text
            
            # Forward the message
            logger.info(f"📤 Forwarding to: {self.target_group.title}")
            await self.client.send_message(
                entity=self.target_group,
                message=formatted_message
            )
            
            logger.info(f"✅ SIGNAL FORWARDED SUCCESSFULLY!")
            logger.info("🎯" * 30)
            
            # Send confirmation if enabled
            if SEND_CONFIRMATION:
                try:
                    confirmation_msg = f"✅ Signal forwarded to {self.target_group.title}"
                    await self.client.send_message(
                        entity=self.source_group,
                        message=confirmation_msg,
                        reply_to=message.id
                    )
                    logger.info("✅ Sent confirmation message to source group")
                except Exception as e:
                    logger.warning(f"⚠️ Could not send confirmation: {e}")
            
        except Exception as e:
            logger.error(f"❌ ERROR FORWARDING MESSAGE: {e}")
    
    async def start_forwarding(self):
        """
        Start the signal forwarding service.
        
        This is the main loop that:
        1. Initializes everything
        2. Sets up message handlers
        3. Keeps the service running
        """
        logger.info("=" * 60)
        logger.info("🤖 TELEGRAM SIGNAL FORWARDER v2.0")
        logger.info("=" * 60)
        
        # Validate required environment variables
        required_vars = [
            ('API_ID', API_ID),
            ('API_HASH', API_HASH),
            ('PHONE_NUMBER', PHONE_NUMBER),
            ('SOURCE_GROUP_URL', SOURCE_GROUP_URL),
            ('TARGET_GROUP_URL', TARGET_GROUP_URL)
        ]
        
        missing_vars = [name for name, value in required_vars if not value]
        
        if missing_vars:
            logger.error("❌ MISSING REQUIRED ENVIRONMENT VARIABLES:")
            for var in missing_vars:
                logger.error(f"   - {var}")
            logger.info("💡 Please set these in Render.com dashboard → Environment")
            logger.info("💡 Refer to README.md for setup instructions")
            return
        
        # Display current configuration
        logger.info("⚙️ CURRENT CONFIGURATION:")
        logger.info(f"   Source Group: {SOURCE_GROUP_URL}")
        logger.info(f"   Target Group: {TARGET_GROUP_URL}")
        logger.info(f"   Source User: {SOURCE_USERNAME if SOURCE_USERNAME else 'Any user'}")
        logger.info(f"   Signal Header: '{SIGNAL_HEADER}'")
        logger.info(f"   Add Timestamp: {ADD_TIMESTAMP}")
        logger.info(f"   Send Confirmation: {SEND_CONFIRMATION}")
        logger.info(f"   Forward Delay: {FORWARD_DELAY} seconds")
        logger.info("=" * 60)
        
        # Initialize Telegram client
        if not await self.initialize_telegram_client():
            logger.error("❌ Failed to initialize. Check logs above.")
            return
        
        # Set up message handler
        @self.client.on(events.NewMessage(chats=self.source_group))
        async def message_handler(event):
            await self.forward_signal_message(event)
        
        self.is_running = True
        
        # Send startup notification
        try:
            startup_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")
            startup_msg = (
                f"✅ **SIGNAL FORWARDER STARTED**\n\n"
                f"🕒 Started at: {startup_time}\n"
                f"📡 Status: ACTIVE & MONITORING\n"
                f"🎯 Looking for: '{SIGNAL_HEADER}'\n"
                f"👤 From user: {SOURCE_USERNAME if SOURCE_USERNAME else 'Any user'}\n"
                f"📨 Forwarding to: {self.target_group.title}\n\n"
                f"🔔 Ready to forward signals!"
            )
            
            await self.client.send_message(
                entity=self.target_group,
                message=startup_msg
            )
            logger.info("✅ Startup notification sent to target group")
        except Exception as e:
            logger.warning(f"⚠️ Could not send startup notification: {e}")
        
        logger.info("=" * 60)
        logger.info("📡 NOW LISTENING FOR SIGNALS...")
        logger.info("=" * 60)
        logger.info("The forwarder is actively monitoring:")
        logger.info(f"   👉 {self.source_group.title}")
        logger.info(f"For messages containing:")
        logger.info(f"   👉 '{SIGNAL_HEADER}'")
        if SOURCE_USERNAME:
            logger.info(f"From user:")
            logger.info(f"   👉 {SOURCE_USERNAME}")
        logger.info("=" * 60)
        logger.info("📊 Forwarding to:")
        logger.info(f"   👉 {self.target_group.title}")
        logger.info("=" * 60)
        logger.info("💡 To stop: Go to Render.com → Signal forwarder → Stop")
        logger.info("📋 Logs: Render.com dashboard → Logs")
        logger.info("=" * 60)
        
        # Keep the client running
        try:
            await self.client.run_until_disconnected()
        except asyncio.CancelledError:
            logger.info("🛑 Received shutdown signal")
        except Exception as e:
            logger.error(f"❌ Unexpected error: {e}")
        finally:
            await self.stop_forwarder()
    
    async def stop_forwarder(self):
        """Stop the forwarder gracefully."""
        if not self.is_running:
            return
        
        logger.info("🛑 Stopping signal forwarder...")
        self.is_running = False
        
        if self.client:
            try:
                await self.client.disconnect()
                logger.info("✅ Disconnected from Telegram")
            except Exception as e:
                logger.error(f"❌ Error disconnecting: {e}")
        
        logger.info("👋 Signal forwarder stopped successfully")

async def main():
    """
    Main entry point for the application.
    
    This function:
    1. Creates the forwarder instance
    2. Starts the forwarding service
    3. Handles graceful shutdown
    """
    forwarder = TelegramSignalForwarder()
    
    try:
        await forwarder.start_forwarding()
    except KeyboardInterrupt:
        logger.info("\n🛑 Received keyboard interrupt (for local testing)")
        await forwarder.stop_forwarder()
    except Exception as e:
        logger.error(f"💥 FATAL ERROR: {e}")
        await forwarder.stop_forwarder()

# ============================================================================
# APPLICATION STARTUP
# ============================================================================

if __name__ == "__main__":
    # Check Python version
    if sys.version_info < (3, 7):
        logger.error("❌ Python 3.7 or higher is required")
        logger.error("💡 Please set Python version to 3.11.0 in runtime.txt")
        sys.exit(1)
    
    # Check if running on Render
    is_render = os.getenv('RENDER', 'false').lower() == 'true'
    if is_render:
        logger.info("🌐 Running on Render.com cloud platform")
    
    # Run the application
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n👋 Application stopped by user")
    except Exception as e:
        logger.error(f"💥 Application crashed: {e}")
        sys.exit(1)
