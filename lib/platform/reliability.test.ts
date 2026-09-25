import { describe, expect, it } from 'vitest';
import { evaluateDeploymentContract } from './deployment-contract';
import { buildPlatformHealthSnapshot } from './health';
import { readPlatformManifest } from './manifest';
import { dispatchWorkflow } from './workflow-dispatcher';
import { currentWorkflowTraceIds, failWorkflowStage, finishWorkflowStage, noteWorkflowRetry, noteWorkflowWarning, runWorkflowTraceScope, startWorkflowStage } from './workflow-trace';

describe('Sartho platform reliability foundation', () => {
  it('normalizes manifest identity without leaking secrets', () => {
    const manifest = readPlatformManifest({
      npm_package_version: '0.1.0',
      VERCEL_GIT_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
      VERCEL_ENV: 'preview',
      BUILD_TIMESTAMP: '2026-09-25T10:00:00.000Z',
      SUPABASE_SERVICE_ROLE_KEY: 'must-not-appear',
    });

    expect(manifest.appName).toBe('sartho-ai-cp');
    expect(manifest.gitShaShort).toBe('0123456');
    expect(manifest.deploymentEnvironment).toBe('preview');
    expect(JSON.stringify(manifest)).not.toContain('must-not-appear');
  });

  it('aggregates deployment checks into READY, DEGRADED and NOT_READY', () => {
    expect(evaluateDeploymentContract({
      generatedAt: '2026-09-25T00:00:00.000Z',
      checks: [
        { component: 'application', status: 'READY', required: true, reason: 'ok' },
        { component: 'search', status: 'DEGRADED', required: false, reason: 'missing optional key' },
      ],
    }).status).toBe('DEGRADED');

    expect(evaluateDeploymentContract({
      checks: [
        { component: 'application', status: 'READY', required: true, reason: 'ok' },
        { component: 'schema', status: 'NOT_READY', required: true, reason: 'missing required schema' },
      ],
    }).status).toBe('NOT_READY');
  });

  it('records workflow stages, warnings, retries and recovery', async () => {
    let seenIds: ReturnType<typeof currentWorkflowTraceIds> = null;
    const outcome = await runWorkflowTraceScope('resume-analysis', async () => {
      seenIds = currentWorkflowTraceIds();
      const stage = startWorkflowStage('load candidate profile');
      noteWorkflowWarning(stage, 'profile cache miss\nwith newline');
      noteWorkflowRetry(stage);
      finishWorkflowStage(stage, { recovery: 'loaded from durable store' });
      return 'ok';
    }, {
      workflowId: 'workflow-1',
      traceId: 'trace-1',
      now: () => 1_000,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw outcome.error;
    expect(outcome.result).toBe('ok');
    expect(seenIds).toEqual({ workflowId: 'workflow-1', traceId: 'trace-1' });
    expect(outcome.trace.status).toBe('succeeded');
    expect(outcome.trace.stages[0].status).toBe('recovered');
    expect(outcome.trace.stages[0].warnings[0]).toBe('profile cache miss with newline');
    expect(outcome.trace.stages[0].retries).toBe(1);
  });

  it('marks failed workflow stages by safe error class only', async () => {
    const outcome = await runWorkflowTraceScope('apply-workflow', async () => {
      const stage = startWorkflowStage('submit');
      failWorkflowStage(stage, new TypeError('token secret should not appear'));
      throw new TypeError('token secret should not appear');
    }, { workflowId: 'workflow-2', traceId: 'trace-2', now: () => 2_000 });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.trace.status).toBe('failed');
    expect(outcome.trace.stages[0].failure).toBe('TypeError');
    expect(JSON.stringify(outcome.trace)).not.toContain('token secret');
  });

  it('dispatches immediate workflows and explicitly rejects fake queues', async () => {
    const completed = await dispatchWorkflow({ workflowName: 'job-match', workflowId: 'wf', traceId: 'tr' }, () => 42);
    expect(completed.status).toBe('completed');
    expect(completed.result).toBe(42);
    expect(completed.trace?.stages[0].name).toBe('dispatch:immediate');

    const queued = await dispatchWorkflow({ workflowName: 'job-match', mode: 'queued', workflowId: 'wf2', traceId: 'tr2' }, () => 42);
    expect(queued.status).toBe('rejected');
    expect(queued.reason).toBe('queue_backend_not_configured');
    expect(queued.trace).toBeNull();
  });

  it('builds cockpit-ready platform health snapshots', () => {
    const health = buildPlatformHealthSnapshot({
      env: {
        npm_package_version: '0.1.0',
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
        GOOGLE_GENERATIVE_AI_API_KEY: 'configured',
      },
      durableSchemaPresent: true,
      now: () => Date.parse('2026-09-25T00:00:00.000Z'),
    });

    expect(health.generatedAt).toBe('2026-09-25T00:00:00.000Z');
    expect(health.manifest.appName).toBe('sartho-ai-cp');
    expect(health.contract.checks.map((check) => check.component)).toContain('dispatcher');
    expect(health.contract.summary.requiredNotReady).toBe(0);
  });
});
