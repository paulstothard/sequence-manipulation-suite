import { makeCdsTranslationModel, visibleCdsTranslationCodons } from './viewer-cds-translation.js';

export function makeOrfTranslationModel(record, orf, options) {
  const model = makeCdsTranslationModel(record, { ...orf, type: 'CDS' }, options.geneticCode);
  // Any-codon analysis must retain the ordinary first residue. Start-codon
  // analysis uses the same alternative-initiator methionine rule as the scanner.
  if (model.available) model.completeStart = options.startMode === 'start-codon';
  return model;
}

export { visibleCdsTranslationCodons as visibleOrfTranslationCodons };
