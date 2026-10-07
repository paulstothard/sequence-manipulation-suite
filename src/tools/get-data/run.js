import { buildRetrieval, createRetrievalClient, retrieveData } from '../../core/external-resources/get.js';
import { retrievalOptions } from '../../core/external-resources/workflow-options.js';

let client;
export async function runGetData(input, options = {}, context = {}) {
  const plan = buildRetrieval(retrievalOptions(input, options));
  if (options.modelId) plan.modelId = options.modelId.trim();
  const result = await retrieveData(plan, context.retrievalClient ?? (client ??= createRetrievalClient()), context.signal);
  if (result.models) throw new Error('AlphaFold returned several models. Choose a model on the Get Data tool page and enter its model ID in this workflow step.');
  if (result.matches) throw new Error('Workflow retrieval needs one accession. Choose a record on the Get Data tool page first.');
  // Empty regional products are explanatory reports, not input for sequence tools.
  if (context.step && result.regionMetadata?.returnedCount === 0 && ['fasta', 'gb', 'gp'].includes(plan.format)) {
    throw new Error('No sequences were retrieved for this region and transcript selection. Check the interval or transcript selection in Get Data.');
  }
  result.streams.primary.download = result.download;
  return result;
}
