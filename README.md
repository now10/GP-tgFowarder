# Telegram Auto Forwarder

A web-based Telegram message forwarder that automatically forwards trading signals from a source group to a target group.

## Features

- Automatic forwarding of trading signals from @policeesupport
- Web-based control panel
- Real-time monitoring and logging
- OTP-based Telegram authentication
- Secure session management
- Optimized for Render.com hosting

## Deployment to Render.com

### 1. One-Click Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### 2. Manual Deployment

1. **Create a new Web Service on Render**
   - Connect your GitHub/GitLab repository
   - Select "Node" as environment
   - Use the following settings:
     - Build Command: `npm install`
     - Start Command: `npm start`
     - Environment: Node 18+

2. **Set Environment Variables**