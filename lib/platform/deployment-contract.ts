export const DEPLOYMENT_CONTRACT_VERSION = 'sartho-deployment-contract-2026-09-25.1';

export type DeploymentReadiness = 'READY' | 'DEGRADED' | 'NOT_READY';

export type DeploymentCheck = {
  component: string;
  status: DeploymentReadiness;
  required: boolean;
  reason: string;
  facts?: Record<string, string | number | boolean | null>;
};

export type DeploymentContract = {
  version: typeof DEPLOYMENT_CONTRACT_VERSION;
  status: DeploymentReadiness;
  generatedAt: string;
  checks: DeploymentCheck[];
  summary: {
    ready: number;
    degraded: number;
    notReady: number;
    requiredNotReady: number;
  };
};

function safeLabel(value: string, fallback: string): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._:/-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
  return cleaned || fallback;
}

function safeReason(value: string): string {
  return String(value || 'unspecified')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240) || 'unspecified';
}

function safeFacts(facts?: Record<string, string | number | boolean | null>): Record<string, string | number | boolean | null> | undefined {
  if (!facts) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(facts).slice(0, 20)) {
    const safeKey = safeLabel(key, 'fact');
    if (typeof value === 'string') out[safeKey] = value.slice(0, 120);
    else if (typeof value === 'number') out[safeKey] = Number.isFinite(value) ? value : null;
    else if (typeof value === 'boolean' || value === null) out[safeKey] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function deploymentCheck(input: DeploymentCheck): DeploymentCheck {
  const facts = safeFacts(input.facts);
  return {
    component: safeLabel(input.component, 'component'),
    status: input.status,
    required: Boolean(input.required),
    reason: safeReason(input.reason),
    ...(facts ? { facts } : {}),
  };
}

export function evaluateDeploymentContract(input: {
  checks: DeploymentCheck[];
  generatedAt?: string;
}): DeploymentContract {
  const checks = input.checks.map(deploymentCheck);
  const summary = {
    ready: checks.filter((check) => check.status === 'READY').length,
    degraded: checks.filter((check) => check.status === 'DEGRADED').length,
    notReady: checks.filter((check) => check.status === 'NOT_READY').length,
    requiredNotReady: checks.filter((check) => check.required && check.status === 'NOT_READY').length,
  };

  let status: DeploymentReadiness = 'READY';
  if (!checks.length || summary.requiredNotReady > 0) {
    status = 'NOT_READY';
  } else if (summary.degraded > 0 || summary.notReady > 0) {
    status = 'DEGRADED';
  }

  return {
    version: DEPLOYMENT_CONTRACT_VERSION,
    status,
    generatedAt: input.generatedAt || new Date().toISOString(),
    checks,
    summary,
  };
}
