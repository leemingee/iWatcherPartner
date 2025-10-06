# 🎙️ iWatcher Partner - AWS Cloud Deployment

Complete Infrastructure as Code deployment for multilingual audio transcription system with speaker diarization.

## 🎯 **What This Deploys**

### **End-to-End Automation:**
- **Trigger:** Upload audio file to Google Drive → **Output:** Notion page + Google Drive markdown
- **Processing:** AssemblyAI transcription + OpenAI enhancement + Speaker diarization
- **Notifications:** SMS alerts for completion/errors
- **Scale:** Optimized for ~10 recordings/week (low cost, high reliability)

### **Infrastructure Components:**
- **🚀 ECS Fargate:** n8n workflow automation (1-2 instances)
- **🗄️ RDS Aurora Serverless:** PostgreSQL database (auto-scaling)
- **📡 Application Load Balancer:** Webhook endpoints with SSL
- **📂 EFS:** Temporary file storage for audio processing
- **🔐 Secrets Manager:** Secure API key management
- **📨 SNS:** Text message notifications
- **📊 CloudWatch:** Monitoring and logging

---

## 🚀 **Quick Start Deployment**

### **Prerequisites:**
1. **AWS Account** with CLI configured (`aws configure`)
2. **Node.js 18+** and npm installed
3. **Phone number** for SMS notifications
4. **API Keys** in `.env` file (see Configuration section)

### **One-Command Deployment:**
```bash
cd infrastructure
chmod +x scripts/deploy.sh
NOTIFICATION_PHONE_NUMBER="+1234567890" ./scripts/deploy.sh
```

**⏱️ Deployment Time:** ~15-20 minutes

---

## 📋 **Detailed Setup Guide**

### **Step 1: Configuration**

Create `.env` file in project root with your API keys:
```bash
# Required API Keys
ASSEMBLYAI_API_KEY=your_assemblyai_key_here
OPENAI_API_KEY=your_openai_key_here
NOTION_API_TOKEN=your_notion_token_here
NOTION_DATABASE_ID=your_notion_database_id

# Google Drive (from your existing setup)
GOOGLE_DRIVE_COMPLETED_FOLDER_ID=your_completed_folder_id
```

### **Step 2: Deploy Infrastructure**

```bash
cd infrastructure

# Install dependencies
npm install

# Configure your phone number for notifications
export NOTIFICATION_PHONE_NUMBER="+1234567890"

# Deploy to AWS
npm run deploy
```

### **Step 3: Configure API Keys**

After deployment, upload your API keys to AWS Secrets Manager:
```bash
npm run update-api-keys
```

### **Step 4: Import n8n Workflow**

1. Access n8n admin interface (URL provided after deployment)
2. Navigate to "Workflows" → "Import from file"
3. Upload: `n8n-workflows/iwatcher-transcription-workflow.json`
4. Configure credentials for each service:
   - AssemblyAI API
   - OpenAI API
   - Notion API
   - Google Drive OAuth
   - AWS credentials

### **Step 5: Configure Google Drive Webhook**

Update your Google Drive webhook to point to the new AWS endpoint:
- **Webhook URL:** `http://your-alb-dns/webhook/iwatcher-webhook`
- **Trigger:** File uploads to "Audio-Transcriptions/New" folder

---

## 🔧 **Architecture Details**

### **Processing Flow:**
```
Google Drive Upload → ALB → n8n → AssemblyAI → OpenAI → Dual Delivery
                                    ↓
                              SMS Notification
```

### **Workflow Steps:**
1. **Webhook Trigger:** Receives Google Drive upload notification
2. **Input Validation:** Checks file_id and filename format
3. **Metadata Extraction:** Determines speaker count from filename
4. **Audio Download:** Fetches file from Google Drive
5. **Transcription:** AssemblyAI with speaker diarization
6. **Speaker Formatting:** Creates timestamp annotations
7. **AI Processing:** OpenAI GPT-4 content enhancement
8. **Markdown Creation:** Generates formatted transcript
9. **Dual Delivery:**
   - Creates Notion database page
   - Uploads markdown to Google Drive
10. **File Management:** Moves original to "Completed" folder
11. **Notification:** Sends SMS with processing summary

### **Naming Convention Support:**
- `Recording_2.m4a` → 1 speaker
- `Recording_with_max.m4a` → 2 speakers
- `Recording_with_max_richard_felix.m4a` → 4 speakers

---

## 💰 **Cost Optimization**

**Monthly Cost Estimate (~10 recordings/week):**
- **ECS Fargate:** ~$15-25/month (1-2 instances, auto-scaling)
- **RDS Aurora Serverless:** ~$5-10/month (auto-pause enabled)
- **Load Balancer:** ~$16/month (standard ALB)
- **EFS:** ~$1/month (minimal storage)
- **Other Services:** ~$3/month (CloudWatch, Secrets Manager, SNS)

**Total: ~$40-55/month**

**Cost Savings Features:**
- Aurora auto-pause after 10 minutes idle
- ECS auto-scaling based on CPU usage
- EFS lifecycle policies (30-day archive)
- CloudWatch log retention (7 days)

---

## 🔍 **Monitoring & Troubleshooting**

### **Access Points:**
- **n8n Interface:** `http://your-alb-dns`
- **Webhook Endpoint:** `http://your-alb-dns/webhook/iwatcher-webhook`
- **CloudWatch Logs:** AWS Console → CloudWatch → Log Groups

### **Common Issues:**

**1. Webhook Not Receiving Requests:**
- Check Google Drive webhook URL configuration
- Verify ALB security groups allow HTTP traffic
- Check n8n workflow is active

**2. Transcription Failures:**
- Verify AssemblyAI API key in Secrets Manager
- Check audio file format (M4A/MP3 supported)
- Review CloudWatch logs for detailed errors

**3. Notion/Google Drive Delivery Failures:**
- Verify API credentials in n8n
- Check folder permissions in Google Drive
- Ensure Notion database permissions

### **Monitoring Commands:**
```bash
# Check deployment status
npm run cdk diff

# View recent logs
aws logs tail iwatcher-partner-n8n-logs --follow

# Check service health
aws ecs describe-services --cluster IWatcherCluster --services N8nService
```

---

## 🔄 **Maintenance & Updates**

### **Update n8n Workflow:**
1. Export updated workflow from n8n interface
2. Save to `n8n-workflows/` directory
3. Version control changes

### **Update Infrastructure:**
1. Modify CDK code in `lib/iwatcher-partner-stack.ts`
2. Deploy changes: `npm run deploy`
3. Monitor deployment in AWS Console

### **Update API Keys:**
```bash
# Update .env file with new keys
npm run update-api-keys
```

### **Scale Resources:**
Modify `cdk-app.ts` configuration:
```typescript
n8nMinCapacity: 1,     // Minimum instances
n8nMaxCapacity: 3,     // Maximum instances
databaseMaxCapacity: 2 // Aurora units
```

---

## 🛡️ **Security Features**

- **✅ Secrets Manager:** All API keys encrypted at rest
- **✅ VPC Isolation:** Private subnets for all processing
- **✅ IAM Roles:** Least privilege access policies
- **✅ Security Groups:** Restrictive network access
- **✅ EFS Encryption:** File system encryption in transit/rest
- **✅ Aurora Encryption:** Database encryption enabled

---

## 📞 **Support & Next Steps**

### **Testing the System:**
1. Upload an audio file to your Google Drive "New" folder
2. Check SMS notification for completion
3. Verify Notion page creation
4. Confirm markdown file in "Completed" folder

### **Production Readiness:**
- **✅ Infrastructure as Code:** Complete CDK deployment
- **✅ Auto-scaling:** CPU-based scaling configured
- **✅ Monitoring:** CloudWatch dashboards and alarms
- **✅ Error Handling:** Comprehensive error responses
- **✅ Backup Strategy:** RDS automated backups enabled

### **Future Enhancements:**
- SSL/HTTPS with custom domain
- Additional notification channels (Slack, Discord)
- Batch processing for multiple files
- Advanced analytics dashboard
- Multi-region deployment

---

## 📁 **Project Structure**
```
infrastructure/
├── cdk-app.ts                     # CDK application entry point
├── lib/iwatcher-partner-stack.ts  # Main infrastructure stack
├── scripts/
│   ├── deploy.sh                  # Automated deployment script
│   └── update-secrets.js          # API key management
├── n8n-workflows/
│   └── iwatcher-transcription-workflow.json  # Complete n8n workflow
├── package.json                   # Node.js dependencies
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This documentation
```

**🎉 Your multilingual audio transcription system is now production-ready on AWS!**