#!/bin/bash
echo "========================================="
echo "🚀 Starting Telegram Signal Forwarder"
echo "========================================="
echo "Python Version: $(python --version)"
echo "Current Directory: $(pwd)"
echo "Environment: $RENDER"
echo "========================================="

# Install dependencies if needed
if [ -f "requirements.txt" ]; then
    echo "📦 Installing Python dependencies..."
    pip install -r requirements.txt
fi

# Run the application
echo "🤖 Starting signal forwarder..."
python app.py

echo "========================================="
echo "👋 Signal forwarder stopped"
echo "========================================="
