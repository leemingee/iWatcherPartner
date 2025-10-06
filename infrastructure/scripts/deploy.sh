#!/bin/bash
# iWatcher Partner - AWS Deployment Script
# Automates the complete deployment process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME="IWatcherPartnerStack"
REGION=${AWS_DEFAULT_REGION:-"us-east-1"}
PHONE_NUMBER=${NOTIFICATION_PHONE_NUMBER:-"+1234567890"}

echo -e "${BLUE}🚀 iWatcher Partner - AWS Deployment${NC}"
echo -e "${BLUE}======================================${NC}"

# Check prerequisites
echo -e "\n${YELLOW}📋 Checking prerequisites...${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not installed${NC}"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo -e "${YELLOW}💡 Run: aws configure${NC}"
    exit 1
fi

# Check Node.js and npm
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Get AWS account information
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${BLUE}📊 AWS Account: ${ACCOUNT_ID}${NC}"
echo -e "${BLUE}📊 Region: ${REGION}${NC}"

# Install dependencies
echo -e "\n${YELLOW}📦 Installing dependencies...${NC}"
npm install

# Bootstrap CDK (if needed)
echo -e "\n${YELLOW}🏗️ Bootstrapping CDK...${NC}"
npx cdk bootstrap aws://${ACCOUNT_ID}/${REGION}

# Build the project
echo -e "\n${YELLOW}🔨 Building project...${NC}"
npm run build

# Deploy the stack
echo -e "\n${YELLOW}🚀 Deploying infrastructure...${NC}"
echo -e "${YELLOW}📞 Using notification phone: ${PHONE_NUMBER}${NC}"

export CDK_DEFAULT_ACCOUNT=${ACCOUNT_ID}
export CDK_DEFAULT_REGION=${REGION}

npx cdk deploy ${STACK_NAME} \
    --parameters notificationPhoneNumber=${PHONE_NUMBER} \
    --require-approval never \
    --outputs-file ./deployment-outputs.json

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ Deployment completed successfully!${NC}"

    # Extract outputs
    if [ -f "./deployment-outputs.json" ]; then
        echo -e "\n${BLUE}📋 Deployment Information:${NC}"
        echo -e "${BLUE}=========================${NC}"

        ALB_DNS=$(cat ./deployment-outputs.json | jq -r '.IWatcherPartnerStack.LoadBalancerDNS // empty')
        WEBHOOK_URL=$(cat ./deployment-outputs.json | jq -r '.IWatcherPartnerStack.N8nWebhookURL // empty')
        ADMIN_URL=$(cat ./deployment-outputs.json | jq -r '.IWatcherPartnerStack.N8nAdminURL // empty')

        if [ ! -z "$ALB_DNS" ]; then
            echo -e "${GREEN}🌐 Load Balancer DNS: ${ALB_DNS}${NC}"
        fi

        if [ ! -z "$ADMIN_URL" ]; then
            echo -e "${GREEN}🎛️ n8n Admin Interface: ${ADMIN_URL}${NC}"
        fi

        if [ ! -z "$WEBHOOK_URL" ]; then
            echo -e "${GREEN}🔗 Webhook URL: ${WEBHOOK_URL}${NC}"
        fi

        echo -e "\n${YELLOW}📋 Next Steps:${NC}"
        echo -e "1. Wait 3-5 minutes for services to start"
        echo -e "2. Access n8n admin interface: ${ADMIN_URL}"
        echo -e "3. Configure API keys using: npm run update-api-keys"
        echo -e "4. Import n8n workflow configuration"
        echo -e "5. Configure Google Drive webhook: ${WEBHOOK_URL}"
    fi
else
    echo -e "\n${RED}❌ Deployment failed!${NC}"
    exit 1
fi

echo -e "\n${GREEN}🎉 Deployment process completed!${NC}"