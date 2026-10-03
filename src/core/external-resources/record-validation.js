// Inspect record completeness without reconstructing it: downloads retain all
// source text, including feature locations/qualifiers this app does not parse.
export async function validateAnnotatedDownload(text, format, signal) {
  const fail = detail => { throw new Error(`The service did not return a complete annotated record: ${detail}`); };
  const records = text.split(/^\/\/[ \t]*\r?$/m);
  if (records.pop().trim() || !records.length) fail('missing record terminator.');
  let count = 0;
  for (const raw of records) {
    if (signal?.aborted) throw new DOMException('Retrieval cancelled.', 'AbortError');
    const record = raw.trim();
    let declared, sequence, sequenceHeader;
    if (format === 'gb' || format === 'gp') {
      const locus = record.match(/^LOCUS\s+\S+\s+(\d+)\s+(bp|aa)\b/i);
      if (!locus || locus[2].toLowerCase() !== (format === 'gp' ? 'aa' : 'bp')) fail('the record does not match the selected nucleotide/protein format.');
      declared = Number(locus[1]);
      if (!/^FEATURES\s+Location\/Qualifiers\s*$/m.test(record)) fail('the feature table is missing.');
      sequence = record.match(/^ORIGIN[^\r\n]*\r?\n([\s\S]*)$/m)?.[1];
    } else {
      const id = record.match(/^ID\s+[^\r\n]*\b(\d+)\s+(BP|AA)\./i);
      if (!id || id[2].toUpperCase() !== (format === 'uniprot' ? 'AA' : 'BP')) fail('the record does not match the selected EMBL/UniProt format.');
      declared = Number(id[1]);
      sequenceHeader = record.match(/^SQ\s+SEQUENCE\s+(\d+)\s+(BP|AA)[^\r\n]*\r?\n([\s\S]*)$/im);
      if (sequenceHeader && Number(sequenceHeader[1]) !== declared) fail('the sequence lengths in the record disagree.');
      sequence = sequenceHeader?.[3];
    }
    if (!sequence) fail('the full sequence is missing; try an individual sequence accession instead of an assembly/master record.');
    const letters = sequence.replace(/[\s\d]/g, '');
    if (!Number.isSafeInteger(declared) || declared < 1 || !/^[A-Za-z*]+$/.test(letters) || letters.length !== declared) fail('the sequence is incomplete or differs from its declared length.');
    count++;
    // Bound consecutive validation work for multi-record responses.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (signal?.aborted) throw new DOMException('Retrieval cancelled.', 'AbortError');
  return count;
}
