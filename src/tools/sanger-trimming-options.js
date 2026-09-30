export function sangerTrimmingGroup({ defaultMode = 'auto', includeReverseComplement = false,
  includeMottSettings = true, signalAware = false } = {}) {
  return {
    type: 'group', id: 'trimming', label: 'Trimming', collapsible: true, collapsed: true,
    options: [
      {
        id: 'trimMode', type: 'radio', label: 'Trimming mode', defaultValue: defaultMode,
        choices: [
          { value: 'none', label: 'No trimming' },
          { value: 'manual', label: 'Trim to specified bases' },
          { value: 'auto', label: 'Trim automatically' },
        ],
        help: 'Applies the selected trimming mode to every input trace. Retained bases are used in analysis and sequence exports.' +
          (includeReverseComplement ? ' The editor keeps excluded ends available as shaded bases.' : '') +
          (signalAware && !includeMottSettings ? ' Automatic trimming uses quality and signal checks to retain supported mixed peaks.' : ''),
      },
      {
        id: 'clipStart', type: 'number', label: 'First base to keep', defaultValue: 1, min: 1, step: 1,
        visibleWhen: { option: 'trimMode', value: 'manual' },
        help: 'First retained base on the original read, numbered from 1 and included in the range. Applies to each trace.',
      },
      {
        id: 'clipEnd', type: 'number', label: 'Last base to keep', defaultValue: '', min: 1, step: 1,
        placeholder: 'End of read', visibleWhen: { option: 'trimMode', value: 'manual' },
        help: 'Last retained base on the original read, included in the range. Leave blank to keep through the end of each read.',
      },
      ...(includeMottSettings ? [{
        id: 'mottErrorLimit', type: 'number', label: 'Mott error limit', defaultValue: 0.05,
        min: 0.000001, max: 0.5, step: 0.001, visibleWhen: { option: 'trimMode', value: 'auto' },
        help: 'Controls automatic quality trimming. Lower values require higher quality; 0.05 gives a scoring boundary near Q13.' +
          (signalAware ? ' When resolving, signal checks retain supported mixed peaks.' : ''),
      }] : []),
      ...(includeReverseComplement ? [{
        id: 'reverseComplement', type: 'checkbox', label: 'Show and export reverse complement', defaultValue: false,
        help: 'Displays the opposite strand and reverse complements exported sequences. Input clip coordinates refer to the original read; the editor numbers bases along the displayed strand.',
      }] : []),
    ],
  };
}
