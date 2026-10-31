const serviceNames = {
  'eutils.ncbi.nlm.nih.gov': 'NCBI', 'api.ncbi.nlm.nih.gov': 'NCBI',
  'rest.uniprot.org': 'UniProt', 'rest.ensembl.org': 'Ensembl',
  'api.genome.ucsc.edu': 'UCSC', 'www.ebi.ac.uk': 'ENA',
  'files.rcsb.org': 'RCSB PDB', 'data.rcsb.org': 'RCSB PDB', 'search.rcsb.org': 'RCSB PDB',
  'alphafold.ebi.ac.uk': 'AlphaFold', 'proksee.ca': 'Proksee'
};

export function externalServiceName(target) {
  try { return serviceNames[new URL(target).hostname] ?? 'The external service'; }
  catch { return 'The external service'; }
}

// Only these locally authored messages reach the UI. Remote error bodies and
// native fetch/JSON exceptions may contain HTML, stack traces or request details.
export class ExternalServiceError extends Error {
  constructor(kind, title, detail) {
    super(`${title}. ${detail}`);
    this.name = 'ExternalServiceError';
    this.kind = kind;
    this.title = title;
    this.detail = detail;
  }
}

export function externalServiceError(target, kind, { retryAfter } = {}) {
  const service = externalServiceName(target);
  const retry = retryAfter ? `Wait at least ${Math.ceil(retryAfter)} seconds before trying again.` : 'Please try again later.';
  const messages = {
    network: [`Could not connect to ${service}`, `Check your internet connection and try again. ${service} may be temporarily unavailable or blocked by your network.`],
    timeout: [`${service} is taking too long to respond`, 'The request timed out. Try again later, or request a smaller record.'],
    unavailable: [`${service} is temporarily unavailable`, retry],
    busy: [`${service} is receiving too many requests`, retry],
    cooldown: ['External requests are temporarily paused', retry],
    missing: [`Record not found in ${service}`, 'No public record was found for this identifier. Check the identifier and selected source.'],
    blocked: [`Access to ${service} was blocked`, 'The service or your network may be restricting access. Check your connection or try again later.'],
    rejected: [`${service} could not complete the request`, 'Check the identifier and selected source, or try again later.'],
    response: [`${service} returned an unexpected response`, 'The service may be undergoing maintenance. Please try again later.']
  };
  const [title, detail] = messages[kind] ?? messages.response;
  return new ExternalServiceError(kind, title, detail);
}

export function externalHttpError(target, status, retryAfter) {
  const kind = status === 429 ? 'busy' : status >= 500 ? 'unavailable'
    : status === 404 ? 'missing' : [401, 403].includes(status) ? 'blocked' : 'rejected';
  return externalServiceError(target, kind, { retryAfter });
}

export function parseExternalJson(text, target) {
  let value;
  try { value = JSON.parse(text); } catch { throw externalServiceError(target, 'response'); }
  if (!value || typeof value !== 'object') throw externalServiceError(target, 'response');
  if (value.error || value.ERROR) throw externalServiceError(target, 'rejected');
  return value;
}
