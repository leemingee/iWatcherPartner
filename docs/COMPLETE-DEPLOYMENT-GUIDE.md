# Complete Deployment Guide - iWatcher on AWS

**End-to-end guide for deploying iWatcher from scratch.** Follow these steps to replicate the exact production setup.

---

## 📋 Prerequisites

Before starting, gather these credentials:

### 1. API Keys Needed
- ✅ **AssemblyAI API Key** - Get at https://www.assemblyai.com/
- ✅ **OpenAI API Key** - Get at https://platform.openai.com/api-keys
- ✅ **Notion API Token** - Get at https://www.notion.so/my-integrations
- ✅ **Notion Database ID** - From your Notion database URL
- ✅ **Google OAuth Credentials** - From https://console.cloud.google.com

### 2. AWS Account Setup
- ✅ AWS account with admin access
- ✅ AWS CLI installed and configured (`aws configure`)
- ✅ Session Manager Plugin installed:
  ```bash
  # macOS
  brew install --cask session-manager-plugin

  # Linux
  # Follow: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html
  ```

### 3. Domain (Optional but Recommended)
- ✅ Domain or subdomain for HTTPS (e.g., `iwatcher.even-study.us`)
- ✅ DNS provider (FreeDNS, Route 53, Cloudflare, etc.)

---

## 🚀 Deployment Steps

### Phase 1: AWS Infrastructure Setup (30 minutes)

#### Option A: Simple EC2 (Recommended for Testing)

```bash
cd infrastructure
npm install

# Deploy simple stack
NOTIFICATION_PHONE_NUMBER="+1234567890" \
npx cdk deploy SimpleIWatcherStack --require-approval never
```

**What this creates:**
- EC2 t3.small instance (Amazon Linux 2)
- Security Group (allows HTTP/HTTPS)
- IAM Role with SSM access
- CloudWatch monitoring
- SNS topic for alerts

**Expected output:**
```
✅ SimpleIWatcherStack

Outputs:
SimpleIWatcherStack.EC2InstanceId = i-XXXXXXXXXXXXX
SimpleIWatcherStack.PublicIP = XX.XX.XX.XX
SimpleIWatcherStack.SSMCommand = aws ssm start-session --target i-XXXXXXXXXXXXX
```

**Save these values** - you'll need them later!

#### Option B: Production ECS (For High Availability)

See `AWS-DEPLOYMENT-PLAN.md` for full ECS setup with RDS, ALB, and auto-scaling.

---

### Phase 2: Connect to EC2 via SSM (5 minutes)

```bash
# Get your instance ID from CDK output
export INSTANCE_ID="i-XXXXXXXXXXXXX"  # Replace with your ID

# Connect via SSM
aws ssm start-session --target $INSTANCE_ID
```

You're now inside the EC2 instance! 🎉

---

### Phase 3: Install Docker and Start n8n (10 minutes)

```bash
# Check if Docker is running (should already be installed by CDK)
sudo service docker status || sudo service docker start

# Create persistent storage directory
sudo mkdir -p /home/ec2-user/.n8n
sudo chown -R 1000:1000 /home/ec2-user/.n8n

# Set your API keys (replace with actual values)
export ASSEMBLYAI_API_KEY="your_assemblyai_key_here"
export OPENAI_API_KEY="your_openai_key_here"
export NOTION_API_TOKEN="your_notion_token_here"
export NOTION_DATABASE_ID="your_notion_db_id_here"

# Start n8n container
sudo docker run -d --name n8n --restart unless-stopped \
  -p 80:5678 \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  -e N8N_ENCRYPTION_KEY=iwatcher-n8n-secret-key-2025 \
  -e N8N_SECURE_COOKIE=false \
  -e WEBHOOK_URL=http://localhost:8888 \
  -e ASSEMBLYAI_API_KEY=$ASSEMBLYAI_API_KEY \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e NOTION_API_TOKEN=$NOTION_API_TOKEN \
  -e NOTION_DATABASE_ID=$NOTION_DATABASE_ID \
  n8nio/n8n:latest

# Verify container is running
sudo docker ps | grep n8n

# Check logs
sudo docker logs n8n
```

**Expected output:**
```
Editor is now accessible via: http://localhost:5678
```

---

### Phase 4: Create n8n Admin Account (5 minutes)

From your **local machine**, create SSM tunnel to access n8n UI:

```bash
# Replace with your instance ID
aws ssm start-session \
  --target i-XXXXXXXXXXXXX \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["80"],"localPortNumber":["8888"]}'
```

Open browser: **http://localhost:8888**

1. Create admin account:
   - Email: your-email@example.com
   - Password: (choose strong password)

2. Login with credentials

**Keep this terminal open** - you'll need the tunnel for Google OAuth setup!

---

### Phase 5: Import Workflow (5 minutes)

From your local machine (in the iWatcherPartner directory):

```bash
# Set environment variables
export N8N_URL="http://localhost:8888"
export N8N_API_KEY="your_api_key_here"  # Get from n8n UI: Settings → API

# Import workflow
python3 import-workflow.py
```

**To get n8n API key:**
1. In n8n UI: Settings → API
2. Click "Create an API key"
3. Copy the key
4. Export: `export N8N_API_KEY="your_key_here"`

**Expected output:**
```
✅ Workflow imported successfully
   ID: wnIjK1IldabGCoUh
   Name: iWatcher - Google Drive Auto Trigger
```

**Activate the workflow** in n8n UI or via script:
```bash
python3 setup.py
```

---

### Phase 6: Configure Google Drive OAuth (15 minutes)

**This is the critical step** that requires the SSM tunnel.

#### 6.1: Create Google OAuth Credentials

1. Go to https://console.cloud.google.com
2. Create new project or select existing
3. Enable **Google Drive API**
4. Create **OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Name: `iWatcher n8n`
   - Authorized redirect URIs:
     ```
     http://localhost:8888/rest/oauth2-credential/callback
     ```
5. Download credentials (optional) or copy Client ID and Secret

#### 6.2: Add Google Drive Credential in n8n

**Make sure SSM tunnel is still running!**

1. In n8n UI (http://localhost:8888):
   - Go to **Settings** → **Credentials**
   - Click **Add Credential**
   - Search for **Google Drive OAuth2 API**

2. Fill in:
   - **Client ID:** (from Google Console)
   - **Client Secret:** (from Google Console)
   - **Scope:** Leave default

3. Click **Sign in with Google**
   - Google OAuth popup opens
   - Select your Google account
   - Grant permissions
   - Redirect back to n8n ✅

4. Save credential with name: `Google Drive OAuth`

**Why the tunnel works:**
- Google accepts `localhost` redirect URIs without HTTPS
- SSM tunnel makes AWS n8n appear as `localhost:8888`
- OAuth flow completes successfully
- Credential persists in n8n database (stored in volume)

---

### Phase 7: Create Google Drive Folders (5 minutes)

In your Google Drive, create this folder structure:

```
iWatcher/
├── New/          ← Drop audio files here
├── Completed/    ← Processed files moved here
└── Failed/       ← Failed files moved here
```

**Get folder IDs** (from URL when inside each folder):
- URL format: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
- Copy each folder ID

**Update workflow in n8n:**
1. Open workflow in n8n editor
2. Find "Google Drive Trigger" node
3. Set folder to monitor: `New` folder ID
4. Find "Move to Completed" node
5. Set destination folder: `Completed` folder ID
6. Find "Move to Failed" node
7. Set destination folder: `Failed` folder ID
8. Click **Save** (Ctrl/Cmd + S)

---

### Phase 8: Test the Complete Pipeline (10 minutes)

#### 8.1: Activate Workflow

In n8n UI:
- Open the iWatcher workflow
- Toggle **Active** switch to ON
- Workflow should show "Listening..."

#### 8.2: Upload Test Audio

1. Drop a short audio file (M4A, MP3, WAV) into Google Drive "New" folder
2. Wait 1-2 minutes (workflow polls every minute)

#### 8.3: Monitor Execution

**Option A: n8n UI**
- Go to **Executions** tab
- Watch for new execution
- Click to see details

**Option B: Local script**
```bash
python3 test-complete-pipeline.py
```

Expected flow:
```
[00:01] Workflow triggered
[00:02] File downloaded from Google Drive
[00:03] Uploaded to AssemblyAI
[02:15] Transcription completed (with speaker diarization)
[02:20] Sent to OpenAI GPT-5 for processing
[02:45] AI summary generated
[02:46] Saved to Notion database (chunked)
[02:47] Saved to Google Drive as .txt (full transcript)
[02:48] Original file moved to "Completed" folder
✅ Workflow execution successful
```

#### 8.4: Verify Outputs

**Notion Database:**
- Check for new entry
- Should have: Title, Date, AI Summary, Transcript chunks

**Google Drive "Completed" folder:**
- Original audio file
- New `.txt` file with full transcript

**If successful:** 🎉 Your deployment works!

---

### Phase 9: Set Up HTTPS with Custom Domain (30 minutes)

**This step makes your deployment production-ready.**

Follow the complete guide: **`HTTPS-DOMAIN-SETUP.md`**

Quick summary for `n8n.yourdomain.com`:

```bash
# On EC2 instance (via SSM)

# 1. Install nginx and certbot
sudo yum install -y nginx
# ... (see HTTPS-DOMAIN-SETUP.md for full commands)

# 2. Obtain SSL certificate
sudo certbot certonly --standalone -d n8n.yourdomain.com

# 3. Configure nginx reverse proxy
sudo tee /etc/nginx/conf.d/n8n.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name n8n.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name n8n.yourdomain.com;
    ssl_certificate /etc/letsencrypt/live/n8n.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8n.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5678;
        proxy_set_header Host $host;
        # ... (see full config in HTTPS-DOMAIN-SETUP.md)
    }
}
EOF

# 4. Start nginx
sudo nginx -t
sudo service nginx start

# 5. Restart n8n with HTTPS webhook URL
sudo docker stop n8n
sudo docker rm n8n
sudo docker run -d --name n8n --restart unless-stopped \
  -p 127.0.0.1:5678:5678 \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  -e WEBHOOK_URL=https://n8n.yourdomain.com \
  -e ASSEMBLYAI_API_KEY=$ASSEMBLYAI_API_KEY \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e NOTION_API_TOKEN=$NOTION_API_TOKEN \
  -e NOTION_DATABASE_ID=$NOTION_DATABASE_ID \
  n8nio/n8n:latest
```

**Update Google OAuth:**
1. Add HTTPS redirect URI in Google Console:
   ```
   https://n8n.yourdomain.com/rest/oauth2-credential/callback
   ```
2. Delete old OAuth credential in n8n
3. Create new credential (no tunnel needed - HTTPS works directly!)

**Access your production instance:** https://n8n.yourdomain.com ✅

---

## 📊 Deployment Checklist

Use this to verify complete setup:

### Infrastructure
- [ ] EC2 instance running (check AWS Console)
- [ ] Security group allows HTTP (80) and HTTPS (443)
- [ ] Instance has SSM role attached
- [ ] Docker installed and running

### n8n Container
- [ ] Container running: `sudo docker ps | grep n8n`
- [ ] Persistent volume mounted: `-v /home/ec2-user/.n8n:/home/node/.n8n`
- [ ] All environment variables set (ASSEMBLYAI, OPENAI, NOTION)
- [ ] Container restarts on failure: `--restart unless-stopped`

### Workflow
- [ ] Workflow imported via `import-workflow.py`
- [ ] Workflow activated (toggle ON in UI)
- [ ] Google Drive OAuth configured
- [ ] Google Drive folders created (New, Completed, Failed)
- [ ] Folder IDs updated in workflow nodes

### HTTPS (Production)
- [ ] Domain points to EC2 public IP
- [ ] SSL certificate obtained from Let's Encrypt
- [ ] nginx configured and running
- [ ] HTTPS accessible in browser
- [ ] HTTP redirects to HTTPS
- [ ] Google OAuth updated with HTTPS redirect URI

### Testing
- [ ] Test audio file uploaded to "New" folder
- [ ] Workflow executed successfully
- [ ] Output saved to Notion
- [ ] Transcript saved to Google Drive "Completed"
- [ ] Original file moved from "New" to "Completed"

---

## 🔧 Common Issues & Solutions

### Issue: "Cannot connect to Docker daemon"

**Cause:** Docker not running

**Solution:**
```bash
sudo service docker start
sleep 5
sudo docker ps
```

---

### Issue: "Permission denied on .n8n folder"

**Cause:** Wrong ownership on volume mount

**Solution:**
```bash
sudo chown -R 1000:1000 /home/ec2-user/.n8n
sudo docker restart n8n
```

---

### Issue: "Google OAuth redirect_uri error"

**Cause:** Using public IP instead of localhost or HTTPS

**Solutions:**

**For initial setup (before HTTPS):**
- Use SSM tunnel: `aws ssm start-session ... --parameters '{"portNumber":["80"],"localPortNumber":["8888"]}'`
- Access via `http://localhost:8888`
- Set redirect URI: `http://localhost:8888/rest/oauth2-credential/callback`

**For production (with HTTPS):**
- Access via `https://iwatcher.even-study.us`
- Set redirect URI: `https://iwatcher.even-study.us/rest/oauth2-credential/callback`

---

### Issue: "Workflow not triggering"

**Possible causes:**
1. Workflow not activated (check toggle)
2. Polling interval (waits up to 1 minute)
3. Google Drive credential expired
4. Wrong folder ID in trigger node

**Debug:**
```bash
# Check workflow executions
python3 test-complete-pipeline.py

# Check n8n logs
sudo docker logs -f n8n

# Verify workflow is active
curl -H "X-N8N-API-KEY: $N8N_API_KEY" \
  http://localhost:8888/api/v1/workflows
```

---

### Issue: "API key 401 Unauthorized"

**Cause:** API key expired or regenerated after container restart

**Solution:**
- API keys persist with volume mount (no longer an issue)
- If key still invalid, regenerate in n8n UI: Settings → API

---

## 📚 Reference Documentation

For detailed information, see:

1. **`AWS-DEPLOYMENT-PLAN.md`** - Full AWS architecture options (EC2, ECS, RDS)
2. **`HTTPS-DOMAIN-SETUP.md`** - Complete HTTPS setup guide with Let's Encrypt
3. **`DEPLOYMENT-LEARNINGS.md`** - All rabbit holes and solutions
4. **`WORKFLOW-SUMMARY.md`** - Workflow design and features
5. **`README.md`** - Project overview and quick start

---

## 💰 Cost Estimate

**Simple EC2 Setup (Recommended for single user):**
- EC2 t3.small: ~$15/month
- EBS storage (30GB): ~$2/month
- **Total AWS: ~$17/month**

**API Usage (for 40 hours of audio/month):**
- AssemblyAI: ~$15 (40 hours × $0.37/hour)
- OpenAI GPT-5: ~$2 (40 transcripts × $0.05)
- Notion: Free
- Google Drive: Free (15GB)
- **Total APIs: ~$17/month**

**Grand Total: ~$34/month** for complete production setup

---

## 🎉 Success!

You now have a production-ready iWatcher deployment:

✅ **Automated:** Workflow triggers on new audio files
✅ **Secure:** HTTPS with valid SSL certificate
✅ **Reliable:** Auto-restart on failure, persistent storage
✅ **Professional:** Custom domain (iwatcher.even-study.us)
✅ **AI-Powered:** Speaker diarization + GPT-5 processing
✅ **Dual Output:** Notion database + Google Drive

**Next Steps:**
1. Upload audio files to test
2. Monitor executions and costs
3. Customize workflow for your needs
4. Share the URL with your team

---

## 🆘 Need Help?

If you encounter issues:

1. **Check logs:**
   ```bash
   sudo docker logs -f n8n
   sudo tail -f /var/log/nginx/error.log
   ```

2. **Run health check:**
   ```bash
   python3 test-complete-pipeline.py
   ```

3. **Review documentation:**
   - See `DEPLOYMENT-LEARNINGS.md` for common rabbit holes
   - See `HTTPS-DOMAIN-SETUP.md` for SSL troubleshooting

4. **Open GitHub issue** with:
   - What step you're on
   - Error message
   - Relevant logs

---

**🚀 Ready to deploy? Start with Phase 1!**
