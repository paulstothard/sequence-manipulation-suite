import { buildHandoff } from '../../core/external-resources/send.js';
import { handoffOptions } from '../../core/external-resources/workflow-options.js';
import { makeToolResult } from '../../core/workflow.js';
// Preparing a handoff never sends data or opens a browser.
export function runSendData(input, options = {}) {
  const plan = buildHandoff(handoffOptions(input, options));
  const result = makeToolResult({ output: `Destination: ${new URL(plan.url).hostname}\n\n${plan.instructions}\n`, download: { filename: 'external-service-handoff.txt', mimeType: 'text/plain' }, recordsProcessed: 1 });
  result.handoff = plan;
  return result;
}
