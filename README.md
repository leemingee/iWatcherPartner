# iWatcher - Automated Audio Transcription Pipeline

Fully automated audio transcription workflow using n8n, AssemblyAI, and OpenAI GPT-5. Upload audio to Google Drive and get AI-powered transcriptions with speaker diarization in Notion + Google Drive.

## 🚀 Features

- **🎙️ Speaker Diarization** - Identifies who said what with timestamps
- **🤖 AI Processing** - GPT-5 powered summaries and key insights
- **📊 Dual Output** - Saves to both Notion database and Google Drive
- **⚡ Auto-Triggered** - Processes new files automatically (checks every minute)
- **🔄 Smart Chunking** - Splits long content into Notion-friendly 2000-char blocks
- **🛡️ Error Handling** - Continues processing even if OpenAI fails
- **☁️ Cloud Deployment** - Runs 24/7 on AWS (no local computer needed)

## 📋 Quick Start

### Local Development

```bash
# 1. Clone repository
git clone <your-repo>
cd iWatcherPartner

# 2. Copy environment template
cp .env.example .env

# 3. Add your API keys to .env
# - ASSEMBLYAI_API_KEY
# - OPENAI_API_KEY
# - NOTION_API_TOKEN
# - NOTION_DATABASE_ID

# 4. Start local n8n (requires Docker)
docker-compose up -d

# 5. Access n8n UI
open http://localhost:5678

# 6. Import workflow
python3 import-workflow.py

# 7. Configure Google Drive OAuth in n8n UI
# Settings → Credentials → Add Google Drive OAuth2 API
```

### AWS Deployment

**📘 Complete Step-by-Step Guide:** See **[docs/COMPLETE-DEPLOYMENT-GUIDE.md](docs/COMPLETE-DEPLOYMENT-GUIDE.md)**

This guide covers everything:
- AWS infrastructure setup
- n8n container configuration
- Workflow import
- Google OAuth setup (with SSM tunnel trick)
- HTTPS setup with custom domain
- Complete testing and verification

Quick deploy (if you know what you're doing):
```bash
cd infrastructure
npm install
NOTIFICATION_PHONE_NUMBER="+1234567890" npx cdk deploy SimpleIWatcherStack
```

For HTTPS setup: **[docs/HTTPS-DOMAIN-SETUP.md](docs/HTTPS-DOMAIN-SETUP.md)**

## 🏗️ Architecture

```
Google Drive "New" Folder
         ↓
    [n8n Trigger]
         ↓
  Download Audio
         ↓
   AssemblyAI API
  (Speaker Diarization)
         ↓
    OpenAI GPT-5
  (AI Summary) ← [Error Handling]
         ↓
   ┌──────┴──────┐
   ↓             ↓
Notion DB    Google Drive
(Chunked)   (Full .txt)
   ↓
Move to "Completed"
```

## 📦 Project Structure

```
iWatcherPartner/
├── iwatcher-gdrive-trigger.json    # Main n8n workflow
├── import-workflow.py              # Workflow deployment script
├── google_credentials.json         # Google OAuth (keep secure!)
├── .env.example                    # Environment template
├── infrastructure/                 # AWS CDK deployment
│   ├── lib/                        # CDK stack definitions
│   ├── n8n-workflows/              # Workflow backups
│   └── cdk-app.ts                  # Main CDK app
└── docs/                           # Documentation
    ├── AWS-DEPLOYMENT-PLAN.md      # AWS deployment guide
    └── WORKFLOW-SUMMARY.md         # Workflow documentation
```

## 🔑 Required API Keys

### 1. AssemblyAI (Transcription)
- Sign up: https://www.assemblyai.com/
- Get API key from dashboard
- Cost: ~$0.37/hour of audio

### 2. OpenAI (AI Processing)
- Sign up: https://platform.openai.com/
- Create API key
- Uses: GPT-5 model (`gpt-5-2025-08-07`)
- Cost: ~$0.05-0.10 per transcript

### 3. Notion (Database Storage)
- Create integration: https://www.notion.so/my-integrations
- Get API token (starts with `ntn_`)
- Share database with integration
- Cost: Free

### 4. Google Drive OAuth
- Create project: https://console.cloud.google.com
- Enable Google Drive API
- Create OAuth 2.0 credentials (Desktop app)
- Download `google_credentials.json`
- Cost: Free

## ⚙️ Workflow Configuration

### Key Features

**1. Google Drive Trigger**
- Monitors "New" folder every minute
- Detects new audio files automatically

**2. Speaker Diarization**
- Identifies multiple speakers
- Adds timestamps to each utterance
- Format: `[MM:SS] Speaker A: text`

**3. OpenAI Processing**
- Model: `gpt-5-2025-08-07`
- No token limits (uses default 128K)
- Error handling: Falls back if API fails

**4. Dual Delivery**
- **Notion**: Chunked into 2000-char blocks
- **Google Drive**: Full transcript as `.txt`

**5. File Management**
- Success: Moves to "Completed" folder
- Failure: Moves to "Failed" folder

## 🔧 Environment Variables

Create `.env` file:

```bash
# AssemblyAI
ASSEMBLYAI_API_KEY=your_key_here

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Notion
NOTION_API_TOKEN=ntn_...
NOTION_DATABASE_ID=your_database_id

# Google Drive (folder IDs)
GOOGLE_DRIVE_NEW_FOLDER_ID=...
GOOGLE_DRIVE_COMPLETED_FOLDER_ID=...
GOOGLE_DRIVE_FAILED_FOLDER_ID=...
```

## 📝 Usage

### 1. Upload Audio
- Drop audio file into Google Drive "New" folder
- Supported formats: M4A, MP3, WAV, AAC

### 2. Wait for Processing
- Workflow triggers within 1 minute
- Transcription takes ~3-10 minutes
- Check Notion database for results

### 3. View Results
- **Notion**: AI summary + chunked transcript
- **Google Drive "Completed"**: Full transcript with metadata
- **Original audio**: Moved to "Completed" folder

## 🎯 Deployment Options

### Option 1: Local Docker (Development)
- Cost: $0
- Setup time: 15 minutes
- Use case: Testing, development

### Option 2: AWS EC2 Simple (Testing)
- Cost: ~$17/month
- Setup time: 30 minutes
- Use case: Single-user testing

### Option 3: AWS ECS (Production) ⭐ Recommended
- Cost: ~$88/month
- Setup time: 2-3 hours
- Use case: Production, high availability
- See: [docs/AWS-DEPLOYMENT-PLAN.md](docs/AWS-DEPLOYMENT-PLAN.md)

## 🛠️ Troubleshooting

### Workflow Not Triggering
```bash
# Check n8n logs
docker logs iwatcher-n8n --tail 50

# Verify workflow is active
curl -H "X-N8N-API-KEY: your_key" \
  http://localhost:5678/api/v1/workflows
```

### Google OAuth Issues
- Delete credential and recreate
- Ensure redirect URI is `http://localhost:5678/rest/oauth2-credential/callback`
- Check Google Cloud Console for authorized redirect URIs

### OpenAI Errors
- Workflow continues even if OpenAI fails
- Check fallback summary in output
- Verify API key and quotas

## 📊 Cost Estimates

**Monthly costs for 40 hours of audio:**
- AssemblyAI: ~$15 (40 hours × $0.37)
- OpenAI: ~$2 (40 transcripts × $0.05)
- AWS (Production): ~$88/month
- **Total: ~$105/month**

**Free tier options:**
- Notion: Free
- Google Drive: Free (15GB)

## 🔐 Security

- **Credentials**: Stored in `.env` and `google_credentials.json` (gitignored)
- **AWS**: Uses Secrets Manager for API keys
- **n8n**: Encrypted credential storage
- **HTTPS**: Recommended for production (see domain setup)

## 📚 Documentation

### For Deployment
- **[Complete Deployment Guide](docs/COMPLETE-DEPLOYMENT-GUIDE.md)** ⭐ **START HERE** - Full step-by-step deployment
- **[HTTPS Domain Setup](docs/HTTPS-DOMAIN-SETUP.md)** - Configure SSL/TLS with Let's Encrypt
- **[AWS Deployment Plan](docs/AWS-DEPLOYMENT-PLAN.md)** - AWS architecture options (EC2, ECS, RDS)
- **[Deployment Learnings](DEPLOYMENT-LEARNINGS.md)** - Lessons learned and rabbit holes

### For Understanding
- **[Workflow Summary](docs/WORKFLOW-SUMMARY.md)** - Detailed workflow documentation
- **[README.md](README.md)** (this file) - Project overview

### Helper Scripts
- **`setup.py`** - Import workflow and verify environment
- **`test-complete-pipeline.py`** - End-to-end testing and monitoring
- **`import-workflow.py`** - Basic workflow import utility

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Test changes locally
4. Submit pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙋 Support

For issues and questions:
1. Check [Troubleshooting](#-troubleshooting) section
2. Review [docs/](docs/) folder
3. Open GitHub issue

---

**Ready to start?** Follow the [Quick Start](#-quick-start) guide above!
