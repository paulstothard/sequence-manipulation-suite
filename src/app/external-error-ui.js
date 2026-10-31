import { externalServiceError } from '../core/external-resources/errors.js';

export function renderExternalError(target, error) {
  // Defensive fallback for unexpected parser/network exceptions at a service UI
  // boundary. Keep ordinary, actionable input-validation messages intact.
  if (error instanceof SyntaxError || error instanceof TypeError) error = externalServiceError('', 'response');
  target.replaceChildren();
  if (error?.name !== 'ExternalServiceError' || !error.title || !error.detail) {
    target.textContent = error?.message || 'The request could not be completed. Please try again.';
    return;
  }
  const feedback = document.createElement('span');
  feedback.className = 'external-feedback';
  const title = document.createElement('strong'); title.textContent = error.title;
  const detail = document.createElement('span'); detail.textContent = error.detail;
  feedback.append(title, detail);
  target.append(feedback);
}
