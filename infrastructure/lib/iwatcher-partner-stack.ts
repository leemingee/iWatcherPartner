import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface IWatcherPartnerStackProps extends cdk.StackProps {
  config: {
    appName: string;
    environment: string;
    n8nMinCapacity: number;
    n8nMaxCapacity: number;
    n8nDesiredCapacity: number;
    databaseMinCapacity: number;
    databaseMaxCapacity: number;
    notificationPhoneNumber: string;
    processingTimeout: number;
    retryAttempts: number;
  };
}

export class IWatcherPartnerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IWatcherPartnerStackProps) {
    super(scope, id, props);

    const { config } = props;

    // =============================================================================
    // VPC and Networking
    // =============================================================================

    const vpc = new ec2.Vpc(this, 'IWatcherVPC', {
      maxAzs: 2,
      natGateways: 1, // Cost optimization for low volume
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
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
        excludeCharacters: '"@/\\',
      },
    });

    // =============================================================================
    // RDS Aurora Serverless for n8n Database
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
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      allocatedStorage: 20,
      storageType: rds.StorageType.GP2,
      deletionProtection: false, // Set to true for production
      databaseName: 'n8n',
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: false,
      multiAz: false, // Single AZ for cost savings
    });

    // =============================================================================
    // EFS for n8n File Storage
    // =============================================================================

    const fileSystem = new efs.FileSystem(this, 'N8nFileSystem', {
      vpc,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
    });

    // =============================================================================
    // ECS Cluster and Task Definition
    // =============================================================================

    const cluster = new ecs.Cluster(this, 'IWatcherCluster', {
      vpc,
      containerInsights: true,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'N8nTaskDefinition', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      volumes: [
        {
          name: 'n8n-data',
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            rootDirectory: '/n8n',
            transitEncryption: 'ENABLED',
          },
        },
      ],
    });

    // Grant necessary permissions to task role
    taskDefinition.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
    );

    // Grant access to secrets
    apiKeysSecret.grantRead(taskDefinition.taskRole);
    database.secret!.grantRead(taskDefinition.taskRole);

    // n8n Container
    const n8nContainer = taskDefinition.addContainer('n8n', {
      image: ecs.ContainerImage.fromRegistry('n8nio/n8n:latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'n8n',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        N8N_HOST: '0.0.0.0',
        N8N_PORT: '5678',
        N8N_PROTOCOL: 'http',
        WEBHOOK_URL: 'https://{{ALB_DNS_NAME}}/', // Will be updated after ALB creation

        // Database configuration
        DB_TYPE: 'postgresdb',

        // Security
        N8N_BASIC_AUTH_ACTIVE: 'false',
        N8N_JWT_AUTH_ACTIVE: 'false',
        N8N_ENCRYPTION_KEY: 'iWatcherPartnerEncryptionKey2025',

        // API settings
        N8N_API_ENABLED: 'true',
        N8N_DISABLE_UI: 'false',

        // Log level
        N8N_LOG_LEVEL: 'info',

        // Community packages
        N8N_COMMUNITY_PACKAGES_ENABLED: 'true',

        // File paths
        N8N_USER_FOLDER: '/data',
      },
      secrets: {
        // Database connection will be set via secrets
        DB_POSTGRESDB_HOST: ecs.Secret.fromSecretsManager(database.secret!, 'host'),
        DB_POSTGRESDB_PORT: ecs.Secret.fromSecretsManager(database.secret!, 'port'),
        DB_POSTGRESDB_DATABASE: ecs.Secret.fromSecretsManager(database.secret!, 'dbname'),
        DB_POSTGRESDB_USER: ecs.Secret.fromSecretsManager(database.secret!, 'username'),
        DB_POSTGRESDB_PASSWORD: ecs.Secret.fromSecretsManager(database.secret!, 'password'),
      },
    });

    // Add mount points to container
    n8nContainer.addMountPoints({
      sourceVolume: 'n8n-data',
      containerPath: '/data',
      readOnly: false,
    });

    n8nContainer.addPortMappings({
      containerPort: 5678,
      protocol: ecs.Protocol.TCP,
    });

    // =============================================================================
    // ECS Service
    // =============================================================================

    const service = new ecs.FargateService(this, 'N8nService', {
      cluster,
      taskDefinition,
      desiredCount: config.n8nDesiredCapacity,
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Allow EFS access
    service.connections.allowTo(fileSystem, ec2.Port.tcp(2049));

    // Allow database access
    service.connections.allowTo(database, ec2.Port.tcp(5432));

    // =============================================================================
    // Application Load Balancer
    // =============================================================================

    const alb = new elbv2.ApplicationLoadBalancer(this, 'IWatcherALB', {
      vpc,
      internetFacing: true,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    const listener = alb.addListener('WebListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    const targetGroup = listener.addTargets('N8nTargets', {
      port: 5678,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service.loadBalancerTarget({
        containerName: 'n8n',
        containerPort: 5678,
      })],
      healthCheck: {
        path: '/healthz',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
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
    // Auto Scaling
    // =============================================================================

    const scalableTarget = service.autoScaleTaskCount({
      minCapacity: config.n8nMinCapacity,
      maxCapacity: config.n8nMaxCapacity,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2),
    });

    // =============================================================================
    // CloudWatch Dashboard
    // =============================================================================

    // const dashboard = new cloudwatch.Dashboard(this, 'IWatcherDashboard', {
    //   dashboardName: `${config.appName}-monitoring`,
    // });

    // =============================================================================
    // Outputs
    // =============================================================================

    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'Load Balancer DNS Name for n8n access',
      exportName: `${config.appName}-alb-dns`,
    });

    new cdk.CfnOutput(this, 'N8nWebhookURL', {
      value: `http://${alb.loadBalancerDnsName}/webhook/iwatcher-webhook`,
      description: 'n8n Webhook URL for Google Drive integration',
      exportName: `${config.appName}-webhook-url`,
    });

    new cdk.CfnOutput(this, 'N8nAdminURL', {
      value: `http://${alb.loadBalancerDnsName}`,
      description: 'n8n Admin Interface URL',
      exportName: `${config.appName}-admin-url`,
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
  }
}