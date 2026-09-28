import { parseSequenceInput } from './fasta.js';
import { cleanDnaRnaSequence, complementDnaRnaSequence } from './sequence.js';
import { resolveRandom } from './random-sequence.js';
import { effectiveToolLimit } from './tool-limit-policy.js';
import { SANGER_SIGNAL_PROFILE, measuredPeakShape, measuredPeakHeight, makeMeasuredBackground } from './sanger-signal-model.js';

export const SANGER_SIMULATION_SEPARATOR = '---SMS3-SANGER-TEMPLATE---';
export const SANGER_SIMULATION_LIMITS = { templates: 20, templateBases: 2000, flankBases: 500, inputCharacters: 1048576, visualReadPositions: 3000, ab1ReadPositions: 2047 };
const CHANNELS = ['A', 'C', 'G', 'T'];
const BASES = { A: 'A', C: 'C', G: 'G', T: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC', B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT' };
const CODES = new Map(Object.entries(BASES).map(([code, bases]) => [bases, code]));

export const simulatedSangerColumns = [
  { id: 'position', label: 'Read position', type: 'number' },
  { id: 'region', label: 'Region', type: 'string' },
  { id: 'base', label: 'Base call', type: 'string' },
  { id: 'quality', label: 'Synthetic quality', type: 'number' },
  { id: 'template_bases', label: 'Template bases', type: 'string' },
  ...CHANNELS.map(base => ({ id: base.toLowerCase(), label: `${base} signal`, type: 'number' }))
];

function numberOption(options, key, fallback, min, max, integer = false) {
  const value = options[key] === undefined ? fallback : Number(options[key]);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`${key} must be ${integer ? 'an integer' : 'a number'} ${Number.isFinite(max) ? `from ${min} to ${max}` : `of at least ${min}`}.`);
  }
  return value;
}

export function prepareSangerSimulation(input, options = {}) {
  const text = String(input ?? '');
  if (text.length > effectiveToolLimit(options, 'maxInputCharacters', SANGER_SIMULATION_LIMITS.inputCharacters)) throw new Error('Input exceeds the 1,048,576-character limit.');
  if (String(options.seed ?? '').length > 200 || /[\r\n\x00-\x1f]/.test(String(options.seed ?? ''))) throw new Error('Use a single-line random seed of at most 200 characters.');
  const signalModel = options.signalModel ?? 'measured';
  if (!['measured', 'uniform'].includes(signalModel)) throw new Error('Choose a supported signal model.');
  const settings = {
    signalModel,
    direction: options.direction ?? 'forward',
    prefixBases: numberOption(options, 'prefixBases', 0, 0, effectiveToolLimit(options, 'maxFlankBases', SANGER_SIMULATION_LIMITS.flankBases), true),
    suffixBases: numberOption(options, 'suffixBases', 0, 0, effectiveToolLimit(options, 'maxFlankBases', SANGER_SIMULATION_LIMITS.flankBases), true),
    flankIntensity: numberOption(options, 'flankIntensity', 25, 1, 100) / 100,
    noise: numberOption(options, 'noise', signalModel === 'measured' ? 1 : 0.5, 0, 25) / 100,
    peakVariation: numberOption(options, 'peakVariation', signalModel === 'measured' ? 25 : 12, 0, 50) / 100,
    mixedPeakThreshold: numberOption(options, 'mixedPeakThreshold', 20, 1, 100) / 100
  };
  if (!['forward', 'reverse-complement'].includes(settings.direction)) throw new Error('Choose a supported sequencing direction.');
  const templates = [], warnings = [];
  let charactersRemoved = 0;
  for (const [panelIndex, part] of text.split(SANGER_SIMULATION_SEPARATOR).entries()) {
    if (!part.trim()) continue;
    // The shared repeatable-input UI serializes the relative amount with its source.
    let source = part, weight = 1;
    if (part.trim().startsWith('{')) {
      let panel;
      try { panel = JSON.parse(part); } catch { throw new Error(`Fragment ${panelIndex + 1}: invalid template input.`); }
      if (panel.format !== 'sms3-weighted-sequence-v1' || typeof panel.input !== 'string') throw new Error('Unrecognized weighted template input.');
      source = panel.input;
      weight = numberOption(panel, 'weight', 1, 0.001, 1000);
    }
    for (const record of parseSequenceInput(source, `fragment_${panelIndex + 1}`)) {
      const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false });
      charactersRemoved += cleaned.removedCount;
      if (cleaned.removedCount) warnings.push(`${record.title}: removed ${cleaned.removedCount} non-DNA characters, including any alignment gaps.`);
      let sequence = cleaned.sequence.replace(/U/g, 'T');
      if (cleaned.sequence.includes('U')) warnings.push(`${record.title}: converted U to T.`);
      if (!sequence) throw new Error(`${record.title}: no DNA bases remain.`);
      if (sequence.length > effectiveToolLimit(options, 'maxTemplateBases', SANGER_SIMULATION_LIMITS.templateBases)) throw new Error(`${record.title}: exceeds 2,000 bases per template.`);
      if (/[^ACGT]/.test(sequence)) warnings.push(`${record.title}: IUPAC ambiguity contributes equally to its represented channels; it does not specify phased alleles.`);
      const originalSequence = sequence;
      if (settings.direction === 'reverse-complement') sequence = complementDnaRnaSequence(sequence, { preserveCase: false }).split('').reverse().join('');
      templates.push({ id: `template_${templates.length + 1}`, title: record.title, originalSequence, sequence, weight });
      if (templates.length > effectiveToolLimit(options, 'maxTemplates', SANGER_SIMULATION_LIMITS.templates)) throw new Error('The enforced limit allows at most 20 templates.');
    }
  }
  if (!templates.length) throw new Error('Provide at least one DNA sequence or FASTA record.');
  const longest = templates.reduce((length, template) => Math.max(length, template.sequence.length), 0);
  const readLength = settings.prefixBases + longest + settings.suffixBases;
  // ABIF PLOC uses signed 16-bit sample indexes; 25 + (n - 1) * 16 is
  // the one-based simulated peak center. Reject rather than wrap or resample.
  if (options.outputFormat === 'ab1' && readLength > SANGER_SIMULATION_LIMITS.ab1ReadPositions) {
    throw new Error('AB1 export supports at most 2,047 read positions, including flanks. Reduce the flanks or use SCF or Trace JSON.');
  }
  if (['interactive-trace', 'svg-trace'].includes(options.outputFormat) && readLength > SANGER_SIMULATION_LIMITS.visualReadPositions) {
    throw new Error('Trace editor and Chromatogram plot support at most 3,000 read positions, including flanks. Reduce the read length or choose SCF, Trace JSON, or a sequence output.');
  }
  const total = templates.reduce((sum, template) => sum + template.weight, 0);
  for (const template of templates) template.fraction = template.weight / total;
  return { templates, settings, warnings, charactersRemoved, readLength, longest };
}

// An illustrative processed-signal model: weighted, locally supported peaks.
// Read positions, not aligned reference coordinates, superimpose template signals.
// Mixed traces after heterozygous indels: Thermo Fisher MAN0014435, pp. 20–21:
// https://assets.thermofisher.com/TFS-Assets/LSG/manuals/MAN0014435_Trbleshoot_Sanger_seq_data_UB.pdf
// These peak shapes and quality scores are synthetic, not an instrument/Phred model.
export async function simulateSangerTrace(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  const result = prepareSangerSimulation(input, options);
  const { templates, settings, longest } = result;
  const { seed, random } = resolveRandom(options);
  const randomDna = length => Array.from({ length }, () => CHANNELS[Math.floor(random() * 4)]).join('');
  // Shared flanks bracket the entire pooled read. Short templates stop contributing
  // at their own end; a suffix never fills a biological deletion or shifts a template.
  const prefix = randomDna(settings.prefixBases), suffix = randomDna(settings.suffixBases);
  const count = prefix.length + longest + suffix.length;
  const positions = Array.from({ length: count }, (_, i) => 25 + i * 16);
  const sampleCount = positions.at(-1) + 25;
  const traces = Object.fromEntries(CHANNELS.map(base => [base, new Array(sampleCount).fill(0)]));
  const rows = [], qualities = [], calls = [];
  for (let i = 0; i < count; i += 1) {
    if (i % 64 === 0) {
      context.reportProgress?.({ phase: 'Synthesizing chromatogram', progress: 0.1 + 0.65 * i / count });
      await context.yieldIfNeeded?.(); context.throwIfCancelled?.();
    }
    const sourceIndex = i - prefix.length;
    const region = sourceIndex < 0 ? 'Leading flank' : sourceIndex >= longest ? 'Trailing flank' : 'Template';
    const flank = region !== 'Template';
    const amplitudes = Object.fromEntries(CHANNELS.map(base => [base, 0]));
    const templateBases = templates.map(template => template.sequence[sourceIndex] ?? '-');
    if (flank) {
      const base = sourceIndex < 0 ? prefix[i] : suffix[sourceIndex - longest];
      amplitudes[base] = 1000 * settings.flankIntensity;
      for (const channel of CHANNELS) amplitudes[channel] += 1000 * settings.flankIntensity * random() * 0.55;
    } else {
      for (const template of templates) {
        const base = template.sequence[sourceIndex];
        if (!base) continue;
        const variation = settings.signalModel === 'uniform' ? 1 + settings.peakVariation * (2 * random() - 1) : 1;
        const amplitude = 1000 * template.fraction * variation;
        for (const channel of BASES[base]) amplitudes[channel] += amplitude / BASES[base].length;
      }
    }
    const center = positions[i];
    if (settings.signalModel === 'uniform') {
      const sigma = flank ? 3.4 : 2.6;
      for (let sample = center - 13; sample <= center + 13; sample += 1) {
        const gaussian = Math.exp(-((sample - center) ** 2) / (2 * sigma ** 2));
        for (const channel of CHANNELS) traces[channel][sample - 1] += amplitudes[channel] * gaussian;
      }
    } else {
      // Shape and height vary by channel after summing templates. Identical
      // templates therefore remain observationally indistinguishable, and the
      // random-number stream cannot reveal a template's phase or copy count.
      for (const channel of CHANNELS) {
        const shape = measuredPeakShape(random, 16, flank);
        const height = amplitudes[channel] * measuredPeakHeight(random, settings.peakVariation);
        const apex = center + shape.centerOffset;
        for (let sample = Math.max(1, center - 24); sample <= Math.min(sampleCount, center + 24); sample += 1) {
          const sigma = sample < apex ? shape.leftSigma : shape.rightSigma;
          traces[channel][sample - 1] += height * Math.exp(-((sample - apex) ** 2) / (2 * sigma ** 2));
        }
      }
    }
    rows.push({ position: i + 1, region, template_bases: flank ? '' : templateBases.join(' / ') });
  }
  const background = settings.signalModel === 'measured' ? Object.fromEntries(CHANNELS.map(channel => [channel, makeMeasuredBackground(random)])) : null;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    if (sample % 4096 === 0) { await context.yieldIfNeeded?.(); context.throwIfCancelled?.(); }
    for (const channel of CHANNELS) traces[channel][sample] = Math.round(traces[channel][sample] + (background ? background[channel](sample) : random()) * settings.noise * 1000);
  }
  for (const [i, position] of positions.entries()) {
    const values = CHANNELS.map(base => ({ base, value: traces[base][position - 1] })).sort((a, b) => b.value - a.value);
    const selected = values.filter(item => item.value >= values[0].value * settings.mixedPeakThreshold).map(item => item.base).sort().join('');
    const base = CODES.get(selected) ?? 'N';
    // Confidence proxy only; mixture lowers the score even when the IUPAC call is correct.
    const purity = values[0].value / Math.max(1, values.reduce((sum, item) => sum + item.value, 0));
    let quality = Math.min(40, Math.max(2, Math.round(-10 * Math.log10(Math.max(0.0001, 1 - purity)))));
    if (rows[i].region !== 'Template') quality = Math.min(quality, 9);
    calls.push(base); qualities.push(quality);
    Object.assign(rows[i], { base, quality }, Object.fromEntries(CHANNELS.map(channel => [channel.toLowerCase(), traces[channel][position - 1]])));
  }
  context.throwIfCancelled?.();
  return {
    ...result, seed, rows, prefix, suffix,
    trace: {
      format: 'sms3-sanger-trace-v1', traceMode: 'simulated-channels', name: 'simulated_sanger_trace',
      source: 'SMS3 simulation; synthetic signal and confidence scores, not measured data or calibrated Phred qualities.',
      bases: calls.join(''), basePositions: positions, qualities, traces,
      simulation: { model: settings.signalModel === 'uniform' ? 'sms3-sanger-simulation-v1' : 'sms3-sanger-simulation-v2',
        ...(settings.signalModel === 'measured' ? { signalProfile: SANGER_SIGNAL_PROFILE } : {}), seed, settings, prefix, suffix, templates }
    }
  };
}

// SCF 2.02: big-endian interleaved 16-bit samples and 12-byte base records.
// https://staden.sourceforge.net/manual/formats_unix_3.html
// https://staden.sourceforge.net/manual/formats_unix_4.html
// https://staden.sourceforge.net/manual/formats_unix_5.html
export function encodeSimulatedScf(trace) {
  const samples = trace.traces.A.length, count = trace.bases.length;
  const basesOffset = 128 + samples * 8, commentsOffset = basesOffset + count * 12;
  const comments = new TextEncoder().encode(`SMS3_SIMULATED=1\nNAME=simulated_sanger_trace\nCOMMENT=Synthetic channels and confidence; not calibrated Phred qualities.\nSEED=${trace.simulation.seed}\n\0`);
  const bytes = new Uint8Array(commentsOffset + comments.length), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('.scf'));
  for (const [offset, value] of [[4, samples], [8, 128], [12, count], [24, basesOffset], [28, comments.length], [32, commentsOffset], [40, 2], [44, 2]]) view.setUint32(offset, value, false);
  bytes.set(new TextEncoder().encode('2.02'), 36);
  for (let i = 0; i < samples; i += 1) for (let c = 0; c < 4; c += 1) view.setUint16(128 + i * 8 + c * 2, trace.traces[CHANNELS[c]][i], false);
  for (let i = 0; i < count; i += 1) {
    const offset = basesOffset + i * 12;
    // SCF sample indexes are zero-based; SMS3's internal trace positions are one-based.
    view.setUint32(offset, trace.basePositions[i] - 1, false);
    for (let c = 0; c < 4; c += 1) bytes[offset + 4 + c] = BASES[trace.bases[i]].includes(CHANNELS[c]) ? trace.qualities[i] : 0;
    bytes[offset + 8] = trace.bases.charCodeAt(i);
  }
  bytes.set(comments, commentsOffset);
  return Array.from(bytes);
}
