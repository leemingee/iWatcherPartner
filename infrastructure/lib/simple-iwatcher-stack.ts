import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface SimpleIWatcherStackProps extends cdk.StackProps {
  config: {
    appName: string;
    environment: string;
    notificationPhoneNumber: string;
  };
}

export class SimpleIWatcherStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SimpleIWatcherStackProps) {
    super(scope, id, props);

    const { config } = props;

    // =============================================================================
    // VPC - Simple Public Setup
    // =============================================================================

    const vpc = new ec2.Vpc(this, 'SimpleVPC', {
      maxAzs: 2,
      natGateways: 0, // No NAT needed for public subnet
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // =============================================================================
    // Secrets Manager for API Keys
    // =============================================================================

    const apiKeysSecret = new secretsmanager.Secret(this, 'APIKeysSecret', {
      secretName: `${config.appName}-api-keys`,
      description: 'API keys for iWatcher Partner integrations',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'placeholder',
        excludeCharacters: '"@/\\\\',
      },
    });

    // =============================================================================
    // RDS Database - Same as before
    // =============================================================================

    const databaseCredentials = rds.Credentials.fromGeneratedSecret('n8nuser', {
      secretName: `${config.appName}-database-credentials`,
    });

    const database = new rds.DatabaseInstance(this, 'N8nDatabase', {
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      credentials: databaseCredentials,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC, // Simpler networking
      },
      allocatedStorage: 20,
      storageType: rds.StorageType.GP2,
      deletionProtection: false,
      databaseName: 'n8n',
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: false,
      multiAz: false,
      publiclyAccessible: false, // Still secure
    });

    // =============================================================================
    // Security Groups
    // =============================================================================

    // Security group for EC2 instance
    const ec2SecurityGroup = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
      vpc,
      description: 'Security group for n8n EC2 instance',
      allowAllOutbound: true,
    });

    // Allow HTTP access from internet
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP access'
    );

    // Allow SSH access (for debugging)
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access'
    );

    // Allow n8n port
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5678),
      'Allow n8n access'
    );

    // Allow database access from EC2
    database.connections.allowFrom(ec2SecurityGroup, ec2.Port.tcp(5432));

    // =============================================================================
    // IAM Role for EC2
    // =============================================================================

    const ec2Role = new iam.Role(this, 'EC2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Grant access to secrets
    apiKeysSecret.grantRead(ec2Role);
    database.secret!.grantRead(ec2Role);

    // =============================================================================
    // User Data Script
    // =============================================================================

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      // Update system
      'yum update -y',

      // Install Docker
      'yum install -y docker',
      'systemctl start docker',
      'systemctl enable docker',
      'usermod -a -G docker ec2-user',

      // Install AWS CLI v2
      'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"',
      'unzip awscliv2.zip',
      './aws/install',

      // Create n8n data directory
      'mkdir -p /opt/n8n/data',
      'chown ec2-user:ec2-user /opt/n8n/data',

      // Get database credentials
      `DB_SECRET=$(aws secretsmanager get-secret-value --secret-id ${database.secret!.secretArn} --region ${this.region} --query SecretString --output text)`,
      'DB_HOST=$(echo $DB_SECRET | jq -r .host)',
      'DB_PORT=$(echo $DB_SECRET | jq -r .port)',
      'DB_NAME=$(echo $DB_SECRET | jq -r .dbname)',
      'DB_USER=$(echo $DB_SECRET | jq -r .username)',
      'DB_PASS=$(echo $DB_SECRET | jq -r .password)',

      // Create n8n environment file
      'cat > /opt/n8n/.env << EOF',
      'N8N_HOST=0.0.0.0',
      'N8N_PORT=5678',
      'N8N_PROTOCOL=http',
      'WEBHOOK_URL=http://INSTANCE_IP:5678/',
      '',
      '# Database configuration',
      'DB_TYPE=postgresdb',
      'DB_POSTGRESDB_HOST=$DB_HOST',
      'DB_POSTGRESDB_PORT=$DB_PORT',
      'DB_POSTGRESDB_DATABASE=$DB_NAME',
      'DB_POSTGRESDB_USER=$DB_USER',
      'DB_POSTGRESDB_PASSWORD=$DB_PASS',
      '',
      '# Security',
      'N8N_BASIC_AUTH_ACTIVE=false',
      'N8N_JWT_AUTH_ACTIVE=false',
      'N8N_ENCRYPTION_KEY=iWatcherPartnerEncryptionKey2025',
      '',
      '# API settings',
      'N8N_API_ENABLED=true',
      'N8N_DISABLE_UI=false',
      'N8N_LOG_LEVEL=info',
      'N8N_COMMUNITY_PACKAGES_ENABLED=true',
      'N8N_USER_FOLDER=/data',
      'EOF',

      // Replace placeholder with actual IP
      'INSTANCE_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)',
      'sed -i "s/INSTANCE_IP/$INSTANCE_IP/g" /opt/n8n/.env',

      // Start n8n container
      'docker run -d \\',
      '  --name n8n \\',
      '  --restart unless-stopped \\',
      '  -p 5678:5678 \\',
      '  -p 80:5678 \\',
      '  --env-file /opt/n8n/.env \\',
      '  -v /opt/n8n/data:/data \\',
      '  n8nio/n8n:latest',

      // Create startup script for auto-restart
      'cat > /etc/systemd/system/n8n.service << EOF',
      '[Unit]',
      'Description=n8n workflow automation',
      'After=docker.service',
      'Requires=docker.service',
      '',
      '[Service]',
      'Type=oneshot',
      'RemainAfterExit=true',
      'ExecStart=/usr/bin/docker start n8n',
      'ExecStop=/usr/bin/docker stop n8n',
      'TimeoutStartSec=0',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOF',

      'systemctl enable n8n.service',

      // Log completion
      'echo "n8n installation completed at $(date)" > /var/log/n8n-setup.log'
    );

    // =============================================================================
    // EC2 Instance
    // =============================================================================

    const instance = new ec2.Instance(this, 'N8nInstance', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.latestAmazonLinux(),
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
      userData: userData,
      keyName: undefined, // No SSH key needed (use SSM for access)
    });

    // =============================================================================
    // SNS Topic for Notifications
    // =============================================================================

    const notificationTopic = new sns.Topic(this, 'ProcessingNotifications', {
      topicName: `${config.appName}-notifications`,
      displayName: 'iWatcher Partner Processing Notifications',
    });

    // Add SMS subscription
    notificationTopic.addSubscription(
      new (require('aws-cdk-lib/aws-sns-subscriptions')).SmsSubscription(config.notificationPhoneNumber)
    );

    // =============================================================================
    // Outputs
    // =============================================================================

    new cdk.CfnOutput(this, 'InstancePublicIP', {
      value: instance.instancePublicIp,
      description: 'EC2 instance public IP address',
      exportName: `${config.appName}-instance-ip`,
    });

    new cdk.CfnOutput(this, 'N8nAdminURL', {
      value: `http://${instance.instancePublicIp}`,
      description: 'n8n Admin Interface URL',
      exportName: `${config.appName}-admin-url`,
    });

    new cdk.CfnOutput(this, 'N8nWebhookURL', {
      value: `http://${instance.instancePublicIp}/webhook/iwatcher-webhook`,
      description: 'n8n Webhook URL for Google Drive integration',
      exportName: `${config.appName}-webhook-url`,
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.instanceEndpoint.hostname,
      description: 'RDS PostgreSQL Instance Endpoint',
      exportName: `${config.appName}-database-endpoint`,
    });

    new cdk.CfnOutput(this, 'NotificationTopicArn', {
      value: notificationTopic.topicArn,
      description: 'SNS Topic ARN for notifications',
      exportName: `${config.appName}-notification-topic`,
    });

    new cdk.CfnOutput(this, 'ApiKeysSecretArn', {
      value: apiKeysSecret.secretArn,
      description: 'Secrets Manager ARN for API keys',
      exportName: `${config.appName}-api-keys-secret`,
    });

    new cdk.CfnOutput(this, 'SSMConnectCommand', {
      value: `aws ssm start-session --target ${instance.instanceId}`,
      description: 'Command to connect to instance via SSM',
      exportName: `${config.appName}-ssm-command`,
    });
  }
}