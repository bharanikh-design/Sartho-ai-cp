import {
  deploymentCheck,
  evaluateDeploymentContract,
  type DeploymentCheck,
  type DeploymentContract,
  type DeploymentReadiness,
} from './deployment-contract';
import { publicPlatformManifest, readPlatformManifest, type PlatformManifest } from './manifest';
import { workflowDispatcherHealth, type WorkflowDispatcherHealth } from './workflow-dispatcher';

export const PLATFORM_HEALTH_VERSION = 'sartho-platform-health-2026-09-25.1';

type EnvReader = Record<string, string | undefined>;

export type PlatformHealthSnapshot = {
  version: typeof PLATFORM_HEALTH_VERSION;
  generatedAt: string;
  status: DeploymentReadiness;
  manifest: PlatformManifest;
  contract: DeploymentContract;
  dispatcher: WorkflowDispatcherHealth;
};

function hasAnyEnv(env: EnvReader, keys: string[]): boolean {
  return keys.some((key) => Boolean(String(env[key] || '').trim()));
}

function boolFact(value: boolean): 'yes' | 'no' {
  return value ? 'yes' : 'no';
}

function migrationStatus(present: boolean | null | undefined): DeploymentReadiness {
  if (present === true) return 'READY';
  if (present === false) return 'NOT_READY';
  return 'DEGRADED';
}

function aiStatus(input: { env: EnvReader; aiReady?: boolean | null }): DeploymentReadiness {
  if (input.aiReady === true) return 'READY';
  if (input.aiReady === false) return 'DEGRADED';
  return hasAnyEnv(input.env, ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY']) ? 'READY' : 'DEGRADED';
}

function searchStatus(env: EnvReader): DeploymentReadiness {
  return hasAnyEnv(env, ['SERPAPI_KEY', 'SERPAPI_API_KEY', 'JSEARCH_RAPIDAPI_KEY', 'RAPIDAPI_KEY', 'ADZUNA_APP_ID', 'ADZUNA_APP_KEY'])
    ? 'READY'
    : 'DEGRADED';
}

function storageStatus(env: EnvReader): DeploymentReadiness {
  return hasAnyEnv(env, ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'])
    && hasAnyEnv(env, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'])
    ? 'READY'
    : 'DEGRADED';
}

export function buildPlatformHealthSnapshot(input: {
  env?: EnvReader;
  manifest?: PlatformManifest;
  now?: () => number;
  aiReady?: boolean | null;
  durableSchemaPresent?: boolean | null;
  notificationsConfigured?: boolean;
  queueConfigured?: boolean;
} = {}): PlatformHealthSnapshot {
  const env = input.env || process.env;
  const now = input.now || Date.now;
  const generatedAt = new Date(now()).toISOString();
  const manifest = publicPlatformManifest(input.manifest || readPlatformManifest(env));
  const dispatcher = workflowDispatcherHealth();
  const notificationsConfigured = Boolean(input.notificationsConfigured || hasAnyEnv(env, ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'SLACK_BOT_TOKEN']));
  const queueConfigured = Boolean(input.queueConfigured);
  const storeConfigured = storageStatus(env) === 'READY';

  const aiReadiness = aiStatus({ env, aiReady: input.aiReady });
  const searchReadiness = searchStatus(env);

  const checks: DeploymentCheck[] = [
    deploymentCheck({
      component: 'application',
      status: 'READY',
      required: true,
      reason: 'Sartho server bundle loaded and can build a platform health snapshot.',
      facts: { app: manifest.appName },
    }),
    deploymentCheck({
      component: 'version',
      status: manifest.appVersion && manifest.appVersion !== '0.0.0' ? 'READY' : 'DEGRADED',
      required: false,
      reason: manifest.appVersion && manifest.appVersion !== '0.0.0'
        ? 'Application version is present.'
        : 'Application version is missing; falling back to default.',
      facts: { appVersion: manifest.appVersion, gitSha: manifest.gitShaShort },
    }),
    deploymentCheck({
      component: 'environment',
      status: manifest.deploymentEnvironment === 'unknown' ? 'DEGRADED' : 'READY',
      required: false,
      reason: manifest.deploymentEnvironment === 'unknown'
        ? 'Deployment environment is not declared.'
        : 'Deployment environment is declared.',
      facts: { environment: manifest.deploymentEnvironment },
    }),
    deploymentCheck({
      component: 'schema',
      status: manifest.schemaVersion && manifest.requiredMigrationVersion ? 'READY' : 'NOT_READY',
      required: true,
      reason: 'Platform schema and required migration identifiers are declared by the manifest.',
      facts: { schemaVersion: manifest.schemaVersion, requiredMigrationVersion: manifest.requiredMigrationVersion },
    }),
    deploymentCheck({
      component: 'migrations',
      status: migrationStatus(input.durableSchemaPresent),
      required: true,
      reason: input.durableSchemaPresent === true
        ? 'Required durable schema probe reported present.'
        : input.durableSchemaPresent === false
          ? 'Required durable schema probe reported missing.'
          : 'Required durable schema has not been probed by this snapshot.',
    }),
    deploymentCheck({
      component: 'database',
      status: storeConfigured ? 'READY' : 'DEGRADED',
      required: false,
      reason: storeConfigured ? 'Database/storage environment is configured.' : 'Database/storage environment is not fully configured in this runtime.',
      facts: { configured: boolFact(storeConfigured) },
    }),
    deploymentCheck({
      component: 'ai',
      status: aiReadiness,
      required: false,
      reason: aiReadiness === 'READY' ? 'At least one AI provider route is declared healthy or configured.' : 'AI route was not proven healthy in this snapshot.',
    }),
    deploymentCheck({
      component: 'search',
      status: searchReadiness,
      required: false,
      reason: searchReadiness === 'READY' ? 'At least one search provider is configured.' : 'No search provider key was detected in this runtime.',
    }),
    deploymentCheck({
      component: 'notifications',
      status: notificationsConfigured ? 'READY' : 'DEGRADED',
      required: false,
      reason: notificationsConfigured ? 'Notification provider is configured.' : 'Notification provider is not configured; Sartho can operate without proactive notifications.',
    }),
    deploymentCheck({
      component: 'workflow_trace',
      status: 'READY',
      required: true,
      reason: 'Workflow trace foundation is loaded.',
    }),
    deploymentCheck({
      component: 'dispatcher',
      status: dispatcher.status,
      required: true,
      reason: dispatcher.reason,
      facts: { mode: dispatcher.mode, queueConfigured: dispatcher.queueConfigured },
    }),
    deploymentCheck({
      component: 'queue',
      status: queueConfigured ? 'READY' : 'DEGRADED',
      required: false,
      reason: queueConfigured ? 'Queued dispatcher backend is configured.' : 'Queued backend is not configured; dispatcher runs immediate mode only.',
    }),
  ];

  const contract = evaluateDeploymentContract({ checks, generatedAt });
  return {
    version: PLATFORM_HEALTH_VERSION,
    generatedAt,
    status: contract.status,
    manifest,
    contract,
    dispatcher,
  };
}
