# Telegram Signal Forwarder

Forwards trading signals with "🔔 NEW SIGNAL!" header from one Telegram group to another.

## 🚀 Quick Deployment to Render.com

### **Step 1: Get Telegram API Credentials**
1. Go to **[https://my.telegram.org](https://my.telegram.org)**
2. Login with your phone number
3. Click **"API Development Tools"**
4. Create an application with:
   - App title: `Signal Forwarder`
   - Short name: `signalforwarder`
   - Platform: `Desktop`
5. Save **api_id** and **api_hash**

### **Step 2: Create GitHub Repository**
1. Create a new repository on GitHub
2. Add all 5 files from this folder:
   - `app.py`
   - `requirements.txt`
   - `runtime.txt`
   - `render.yaml`
   - `.env.example` (rename to `.env` after editing)

### **Step 3: Deploy to Render.com**
1. Go to **[https://render.com](https://render.com)**
2. Sign up/login with GitHub
3. Click **"New +"** → **"Blueprint"**
4. Connect your GitHub repository
5. Render will auto-detect the configuration
6. Click **"Apply"**

### **Step 4: Configure Environment Variables**
In Render dashboard, go to your service → Environment → Add:

| Variable | Your Value | Notes |
|----------|------------|-------|
| `API_ID` | `12345678` | From my.telegram.org |
| `API_HASH` | `a1b2c3d4...` | From my.telegram.org |
| `PHONE_NUMBER` | `+1234567890` | Your phone with country code |
| `SOURCE_GROUP_URL` | `https://t.me/iosassembly` | Your source group |
| `TARGET_GROUP_URL` | `https://t.me/acctdeveloperselling` | Your target group |
| `SOURCE_USERNAME` | `@Systembadgetickverify02` | Optional: Specific user |

### **Step 5: Phone Verification (FIRST TIME ONLY)**
1. After deployment, check **Render logs**
2. You'll see: **"PHONE VERIFICATION REQUIRED"**
3. Check Telegram app for **verification code**
4. Go back to Render → Environment
5. Add new variable: `TELEGRAM_CODE` = `[your code]`
6. Click **"Save Changes"** (service auto-restarts)
7. ✅ Done! Forwarder is now running

## 📁 File Structure
