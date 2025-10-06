#!/usr/bin/env node
/**
 * iWatcher Partner - Simple AWS Infrastructure
 * Deploys n8n on EC2 with Docker (much simpler than ECS)
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SimpleIWatcherStack } from './lib/simple-iwatcher-stack';

const app = new cdk.App();

new SimpleIWatcherStack(app, 'SimpleIWatcherStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
  },

  // Simplified configuration
  config: {
    appName: 'iwatcher-partner',
    environment: 'production',
    notificationPhoneNumber: process.env.NOTIFICATION_PHONE_NUMBER || '+14259001926',
  }
});