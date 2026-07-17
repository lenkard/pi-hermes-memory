import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { DatabaseManager } from '../store/db.js';
import {
  authoritativeMemorySnapshot,
  getSemanticStatus,
  rebuildSemanticIndex,
  reconcileSemanticIndex,
  type SemanticIndexOperations,
} from '../semantic/semantic-operations.js';

export interface SemanticCommandOptions {
  dbManager: DatabaseManager;
  enabled: boolean;
  contractVersion: string;
  index: SemanticIndexOperations | null;
  embeddingHealth?: (() => Promise<boolean>) | null;
  scheduleWorker?: () => void;
  cancelWorker?: () => void;
}

function unavailable(ctx: ExtensionCommandContext, operation: string): void {
  ctx.ui.notify(`Semantic ${operation} is unavailable. Configuration or the remote service is not ready.`, 'warning');
}

export function registerSemanticCommands(pi: ExtensionAPI, options: SemanticCommandOptions): void {
  pi.registerCommand('memory-semantic-status', {
    description: 'Show redacted Semantic Recall status',
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const status = await getSemanticStatus(options.dbManager, {
        enabled: options.enabled,
        contractVersion: options.contractVersion,
        index: options.index,
        embeddingHealth: options.embeddingHealth,
      });
      const indexed = status.indexed === null ? 'unavailable' : String(status.indexed);
      const databaseHealth = status.databaseHealthy === null ? 'not configured' : status.databaseHealthy ? 'healthy' : 'unavailable';
      const embeddingHealth = status.embeddingHealthy === null ? 'not configured' : status.embeddingHealthy ? 'healthy' : 'unavailable';
      ctx.ui.notify([
        'Semantic Recall status',
        `Enabled: ${status.enabled ? 'yes' : 'no'}`,
        `Database health: ${databaseHealth}`,
        `Embedding health: ${embeddingHealth}`,
        `Contract: ${status.contractVersion}`,
        `Indexed: ${indexed}`,
        `Pending: ${status.pending}`,
        `Failed: ${status.failed}`,
        `Leased: ${status.leased}`,
        `Last reconciliation: ${status.lastReconciliationAt ?? 'never'}`,
      ].join('\n'), 'info');
    },
  });

  pi.registerCommand('memory-semantic-reconcile', {
    description: 'Preview semantic index drift; pass repair to queue repairs',
    handler: async (args, ctx: ExtensionCommandContext) => {
      if (!options.enabled || !options.index) return unavailable(ctx, 'reconciliation');
      const repair = args.trim() === 'repair';
      try {
        const result = await reconcileSemanticIndex(
          options.dbManager,
          authoritativeMemorySnapshot(options.dbManager),
          options.index,
          { repair, contractVersion: options.contractVersion },
        );
        if (repair && result.queued > 0) options.scheduleWorker?.();
        ctx.ui.notify([
          repair ? 'Semantic reconciliation repair' : 'Semantic reconciliation preview',
          `Missing: ${result.missing}`,
          `Stale: ${result.stale}`,
          `Changed contract: ${result.changedContract}`,
          `Orphaned: ${result.orphaned}`,
          `Queued repairs: ${result.queued}`,
          ...(repair ? [] : ['Run /memory-semantic-reconcile repair to queue repairs.']),
        ].join('\n'), 'info');
      } catch {
        unavailable(ctx, 'reconciliation');
      }
    },
  });

  pi.registerCommand('memory-semantic-cancel', {
    description: 'Cancel semantic background work for this Agent process',
    handler: async (_args, ctx: ExtensionCommandContext) => {
      options.cancelWorker?.();
      ctx.ui.notify('Semantic background work cancelled. Durable pending work is preserved for restart.', 'info');
    },
  });

  pi.registerCommand('memory-semantic-rebuild', {
    description: 'Preview a Derived Index rebuild; pass confirm to execute',
    handler: async (args, ctx: ExtensionCommandContext) => {
      if (!options.enabled || !options.index) return unavailable(ctx, 'rebuild');
      const confirm = args.trim() === 'confirm';
      try {
        const result = await rebuildSemanticIndex(
          options.dbManager,
          authoritativeMemorySnapshot(options.dbManager),
          options.index,
          { confirm, contractVersion: options.contractVersion },
        );
        if (confirm && result.queued > 0) options.scheduleWorker?.();
        ctx.ui.notify([
          confirm ? 'Semantic Derived Index rebuild queued' : 'Semantic Derived Index rebuild preview',
          `Authoritative entries: ${result.authoritative}`,
          `Derived rows to remove: ${result.derived}`,
          `Queued entries: ${result.queued}`,
          ...(confirm ? [] : ['Run /memory-semantic-rebuild confirm to rebuild derived state.']),
        ].join('\n'), 'info');
      } catch {
        unavailable(ctx, 'rebuild');
      }
    },
  });
}
