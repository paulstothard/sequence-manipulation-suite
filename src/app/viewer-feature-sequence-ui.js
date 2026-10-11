import { featureSequenceChoices, extractViewerFeatureSequence } from '../core/viewer-feature-sequence.js';
import { formatFastaRecord } from '../core/fasta.js';
import { downloadText } from './file-download.js';
import { makeSafeFileStem } from './canvas-export.js';
import { showCopiedFeedback } from './copy-feedback.js';

export function createFeatureSequenceControls(record, target) {
  const choices = featureSequenceChoices(record, target);
  if (!choices.length) return null;
  const section = document.createElement('section');
  section.className = 'dna-viewer-feature-sequence';
  section.setAttribute('aria-label', 'Feature sequence');
  const label = document.createElement('label');
  const title = document.createElement('strong'); title.textContent = 'Get sequence';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Feature sequence type');
  for (const choice of choices) {
    const option = document.createElement('option'); option.value = choice.id; option.textContent = choice.label; select.append(option);
  }
  label.append(title, select);
  const summary = document.createElement('p'); summary.className = 'dna-viewer-feature-sequence-summary';
  const update = () => {
    const choice = choices.find(entry => entry.id === select.value);
    summary.textContent = `${choice.length.toLocaleString()} ${choice.unit} · ${choice.description}${target.sequenceLocation?.partial ? ' Partial feature: clipped or incomplete in the source record.' : ''}`;
  };
  select.addEventListener('change', update); update();
  const buttons = document.createElement('div'); buttons.className = 'dna-viewer-selection-actions dna-viewer-feature-sequence-actions';
  const status = document.createElement('p'); status.className = 'dna-viewer-feature-sequence-status'; status.setAttribute('role', 'status');
  for (const [text, action] of [['Copy sequence', 'copy'], ['Copy FASTA', 'fasta'], ['Download FASTA', 'download']]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.addEventListener('click', async () => {
      status.textContent = '';
      try {
        const extracted = extractViewerFeatureSequence(record, target, select.value);
        const text = action === 'copy' ? extracted.sequence : formatFastaRecord(extracted.title, extracted.sequence);
        if (action === 'download') {
          downloadText(text, `${makeSafeFileStem(extracted.identifier, 'feature')}-${select.value}.fasta`);
        } else {
          await navigator.clipboard.writeText(text); showCopiedFeedback(button);
        }
      } catch (error) { status.textContent = action === 'download' ? error.message : 'Could not copy. Use Download FASTA instead.'; }
    });
    buttons.append(button);
  }
  select.addEventListener('change', () => {
    status.textContent = '';
    Array.from(buttons.children).forEach((button, index) => button.textContent = ['Copy sequence', 'Copy FASTA', 'Download FASTA'][index]);
  });
  section.append(label, summary, buttons, status);
  return section;
}
