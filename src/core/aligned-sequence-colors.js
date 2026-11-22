// Published scheme definitions, independently configurable from painting text
// versus backgrounds. References are also shown in the tool metadata.
// https://www.jalview.org/help/html/colourSchemes/{zappo,taylor,clustal,pid}.html
import { isAlignmentGap } from './aligned-sequences.js';
import { PUBLICATION_COLOR_MAPS } from './publication-color-maps.js';
import { interpolateColorStops } from './plot-color-scale.js';

export const IDENTITY_PALETTES = Object.freeze({identity:'Grayscale', 'identity-blue':'Jalview blue',
  ...Object.fromEntries(['viridis','cividis','plasma','inferno','magma'].map(key => [`identity-${key}`,key[0].toUpperCase()+key.slice(1)]))});
export const IDENTITY_SCHEMES = Object.keys(IDENTITY_PALETTES);
export const DEFAULT_IDENTITY_CUTOFFS = Object.freeze([40,60,80]);
// Genome Loom's publication categorical palettes, in their original order.
const CATEGORICAL = Object.freeze({
  'okabe-ito':['#0072b2','#d55e00','#009e73','#cc79a7','#e69f00','#56b4e9','#f0e442'],
  'tol-bright':['#4477aa','#ee6677','#228833','#ccbb44','#66ccee','#aa3377','#bbbbbb']
});

export function alignmentIdentityStops(scheme) {
  if (scheme === 'identity') return ['#ffffff','#000000'];
  if (scheme === 'identity-blue') return ['#ffffff','#6464ff'];
  return PUBLICATION_COLOR_MAPS[scheme.slice('identity-'.length)];
}

export const ALIGNMENT_SCHEMES = Object.freeze({
  identity: 'Identity · grayscale', 'identity-blue': 'Identity · blue', conservation: 'Identity · black and white',
  ...Object.fromEntries(Object.entries(IDENTITY_PALETTES).filter(([key])=>!['identity','identity-blue'].includes(key)).map(([key,label])=>[key,`Identity · ${label}`])),
  zappo: 'Zappo · residue classes', taylor: 'Taylor · residue type', hydrophobicity: 'Hydrophobicity',
  'classes-okabe-ito':'Residue classes · Okabe–Ito', 'classes-tol-bright':'Residue classes · Tol Bright',
  nucleotide: 'Bases · Okabe–Ito', 'nucleotide-tol-bright':'Bases · Tol Bright', 'nucleotide-jalview': 'Bases · Jalview', purine: 'Purine / pyrimidine',
  clustalx: 'ClustalX', reference: 'Reference · colour', 'reference-gray': 'Reference · grayscale',
  custom: 'Custom residue colours', plain: 'Plain text'
});
export const PROTEIN_SCHEMES = ['zappo', 'taylor', 'hydrophobicity', 'clustalx', 'classes-okabe-ito', 'classes-tol-bright'];
export const NUCLEOTIDE_SCHEMES = ['nucleotide', 'nucleotide-tol-bright', 'nucleotide-jalview', 'purine'];
export const COLUMN_STAT_SCHEMES = ['conservation', ...IDENTITY_SCHEMES, 'clustalx'];
export const REFERENCE_SCHEMES = ['reference', 'reference-gray'];
export const ALIGNMENT_SCHEME_HELP = Object.freeze({
  ...Object.fromEntries(IDENTITY_SCHEMES.map(key=>[key,'Shade by percentage identity, using stepped bands or a continuous scale.'])),
  conservation: 'Residues meeting the identity cutoff are black; the remaining residues are unshaded.',
  zappo: 'Fixed physicochemical residue classes. Colours depend on residue type, independently of column identity.',
  'classes-okabe-ito':'Fixed Zappo residue classes with the Okabe–Ito categorical palette. Each residue is coloured by its type.',
  'classes-tol-bright':'Fixed Zappo residue classes with the Tol Bright categorical palette. Each residue is coloured by its type.',
  taylor: 'A distinct published colour for each amino acid, independently of column identity.',
  hydrophobicity: 'Jalview’s Kyte–Doolittle palette: hydrophobic residues are red and hydrophilic residues blue.',
  nucleotide: 'A, C, G and T/U have distinct colours, independently of column identity.',
  'nucleotide-tol-bright':'A, C, G and T/U use the Tol Bright categorical palette, independently of column identity.',
  'nucleotide-jalview': 'Jalview base colours: A green, C orange, G red and T/U blue.',
  purine: 'A/G and C/T/U use two distinct colours, independently of column identity.',
  clustalx: 'Published ClustalX rules combine residue type with the amino acid profile of each column.',
  reference: 'Distinguishes reference matches, substitutions and residues opposite a reference gap.',
  'reference-gray': 'Reference matches are white, substitutions black and residues opposite a reference gap gray.',
  custom: 'Choose a colour for each residue symbol, independently of column identity.',
  plain: 'Uniform letters and cell backgrounds.'
});
const TAYLOR = { A:'#ccff00',V:'#99ff00',I:'#66ff00',L:'#33ff00',M:'#00ff00',F:'#00ff66',Y:'#00ffcc',W:'#00ccff',H:'#0066ff',R:'#0000ff',K:'#6600ff',N:'#cc00ff',Q:'#ff00cc',E:'#ff0066',D:'#ff0000',S:'#ff3300',T:'#ff6600',G:'#ff9900',P:'#ffcc00',C:'#ffff00' };
// Exact published palette: https://www.jalview.org/help/html/colourSchemes/hydrophobic.html
const HYDROPHOBICITY = { I:'#ff0000',V:'#f60009',L:'#ea0015',F:'#cb0034',C:'#c2003d',M:'#b0004f',A:'#ad0052',G:'#6a0095',X:'#680097',T:'#61009e',S:'#5e00a1',W:'#5b00a4',Y:'#4f00b0',P:'#4600b9',H:'#1500ea',E:'#0c00f3',Z:'#0c00f3',Q:'#0c00f3',D:'#0c00f3',B:'#0c00f3',N:'#0c00f3',K:'#0000ff',R:'#0000ff' };
const ZAPPO = [['aliphatic','Aliphatic / hydrophobic','ILVAM','#ffafaf'],['aromatic','Aromatic','FWY','#ffc800'],['positive','Positive','KRH','#6464ff'],['negative','Negative','DE','#ff0000'],['hydrophilic','Hydrophilic','STNQ','#00ff00'],['special','Conformationally special','PG','#ff00ff'],['cysteine','Cysteine','C','#ffff00']];
const CLUSTAL = [['blue','Hydrophobic','','#80a0f0'],['red','Positive','','#f01505'],['magenta','Negative','','#c048c0'],['green','Polar','','#15c015'],['pink','Cysteine','','#f08080'],['orange','Glycine','','#f09048'],['yellow','Proline','','#c0c000'],['cyan','Aromatic','','#15a4a4']];
export function alignmentColorKeys(scheme, alphabet, settings = {}) {
  let keys;
  if (scheme === 'conservation') keys = [['identity','Meets identity cutoff','','#000000']];
  else if (IDENTITY_SCHEMES.includes(scheme)) {
    const cutoffs = settings.identityCutoffs ?? DEFAULT_IDENTITY_CUTOFFS;
    const colours = scheme === 'identity' ? ['#cccccc','#888888','#222222'] : scheme === 'identity-blue' ? ['#ccccff','#9999ff','#6464ff']
      : [.2,.55,.9].map(fraction=>interpolateColorStops(alignmentIdentityStops(scheme),fraction));
    keys = settings.identityMode === 'continuous' ? [] : ['low','medium','high'].map((key,i)=>[key,`Identity >${cutoffs[i]}%`,'',colours[i]]).reverse();
  }
  else if (scheme === 'reference') keys = [['match','Reference match','','#dddddd'],['substitution','Substitution','','#e69f00'],['insertion','Reference gap','','#56b4e9']];
  else if (scheme === 'reference-gray') keys = [['match','Reference match','','#ffffff'],['substitution','Substitution','','#000000'],['insertion','Reference gap','','#888888']];
  else if (scheme === 'nucleotide') keys = [['A','A','','#009e73'],['C','C','','#e69f00'],['G','G','','#cc79a7'],['T','T / U','','#56b4e9']];
  else if (scheme === 'nucleotide-tol-bright') keys = ['A','C','G','T'].map((key,i)=>[key,key==='T'?'T / U':key,'',CATEGORICAL['tol-bright'][i]]);
  else if (scheme === 'nucleotide-jalview') keys = [['A','A','','#64f73f'],['C','C','','#ffb340'],['G','G','','#eb413c'],['T','T / U','','#3c88ee']];
  else if (scheme === 'purine') keys = [['purine','Purines','AG','#009e73'],['pyrimidine','Pyrimidines','CTU','#e69f00']];
  else if (scheme === 'zappo') keys = ZAPPO;
  else if (scheme.startsWith('classes-')) keys = ZAPPO.map(([key,label,symbols],i)=>[key,label,symbols,CATEGORICAL[scheme.slice(8)][i]]);
  else if (scheme === 'clustalx') keys = CLUSTAL;
  else if (scheme === 'taylor') keys = Object.entries(TAYLOR).map(([s,c]) => [s,s,s,c]);
  else if (scheme === 'hydrophobicity') keys = Object.entries(HYDROPHOBICITY).map(([s,c]) => [s,s,s,c]);
  else if (scheme === 'custom') keys = [...(alphabet === 'protein' ? 'ACDEFGHIKLMNPQRSTVWYBXZJUO*?' : 'ACGTURYSWKMBDHVN?')].map(s => [s,s,s,'#dddddd']);
  else keys = [];
  return [...keys, ['other','Unshaded','','#ffffff'], ['gap','Gap','-.','#ffffff']].map(([key,label,symbols,color]) => ({key,label,symbols,color}));
}
export function alignmentColumnStats(model, rows, start, end, gapPolicy = 'include') {
  const stats = [];
  for (let c = start; c < end; c++) {
    const counts = Object.create(null); let gaps = 0;
    for (const row of rows) {
      const symbol = model.records[row].sequence[c].toUpperCase();
      if (isAlignmentGap(symbol)) gaps++; else counts[symbol] = (counts[symbol] ?? 0) + 1;
    }
    const max = Math.max(0, ...Object.values(counts));
    stats.push({ counts, gaps, total: rows.length, denominator: gapPolicy === 'exclude' ? rows.length - gaps : rows.length,
      consensus: Object.keys(counts).filter(key => counts[key] === max), max });
  }
  return stats;
}
function clustalKey(symbol, stats) {
  const sum = letters => [...letters].reduce((n,letter) => n + (stats.counts[letter] ?? 0), 0);
  const above = (letters, percent) => sum(letters) * 100 > percent * stats.denominator;
  const any = (letters, percent) => [...letters].some(letter => above(letter, percent));
  const hydrophobic = above('WLVIMAFCYHP', 60);
  if (symbol === 'C' && above('C', 85)) return 'pink';
  if ('ACILMFWV'.includes(symbol) && hydrophobic) return 'blue';
  if ('KR'.includes(symbol) && (above('KR',60) || any('KRQ',85))) return 'red';
  if (symbol === 'E' && (above('KR',60) || above('QE',50) || above('ED',50) || any('EQD',85))) return 'magenta';
  if (symbol === 'D' && (above('KR',60) || any('DEN',85) || above('ED',50))) return 'magenta';
  if (symbol === 'N' && (above('N',50) || any('ND',85))) return 'green';
  if (symbol === 'Q' && (above('KR',60) || above('QE',50) || any('QTKR',85))) return 'green';
  if ('ST'.includes(symbol) && (hydrophobic || above('TS',50) || any('ST',85))) return 'green';
  if (symbol === 'G') return 'orange';
  if (symbol === 'P') return 'yellow';
  if ('HY'.includes(symbol) && (hydrophobic || any('WYACPQFHILMV',85))) return 'cyan';
  return 'other';
}
export function alignmentCellColor(symbol, stats, settings, alphabet, referenceSymbol = '', prepared = {}) {
  const upper = symbol.toUpperCase();
  const count = stats.counts[upper] ?? 0;
  const fraction = stats.denominator ? count / stats.denominator : 0;
  const keys = prepared.keys ?? alignmentColorKeys(settings.scheme, alphabet, settings);
  let key = 'other', continuousColor, score = fraction;
  if (isAlignmentGap(symbol)) key = 'gap';
  else if (settings.scheme === 'custom') key = upper;
  else if (upper !== '*' && upper !== '?') {
    const identity = stats.denominator > 0 && count * 100 >= settings.threshold * stats.denominator;
    if (settings.scheme === 'conservation') key = identity ? 'identity' : 'other';
    if (IDENTITY_SCHEMES.includes(settings.scheme)) {
      const target = settings.identityScope ?? 'consensus';
      const numerator = target === 'residue' ? count : stats.max;
      score = stats.denominator ? numerator / stats.denominator : 0;
      if (stats.denominator > 0 && (target !== 'consensus' || stats.consensus.includes(upper))) {
        if (settings.identityMode === 'continuous') {
          if (numerator * 100 >= (settings.identityMinimum ?? 0) * stats.denominator) {
            key = 'continuous'; continuousColor = interpolateColorStops(alignmentIdentityStops(settings.scheme),score);
          }
        } else {
          const [low,medium,high] = settings.identityCutoffs ?? DEFAULT_IDENTITY_CUTOFFS;
          key = numerator * 100 > high * stats.denominator ? 'high' : numerator * 100 > medium * stats.denominator ? 'medium' : numerator * 100 > low * stats.denominator ? 'low' : 'other';
        }
      }
    }
    if (['nucleotide','nucleotide-tol-bright','nucleotide-jalview'].includes(settings.scheme) && 'ACGTU'.includes(upper)) key = upper === 'U' ? 'T' : upper;
    if (settings.scheme === 'purine') key = 'AG'.includes(upper) ? 'purine' : 'CTU'.includes(upper) ? 'pyrimidine' : 'other';
    if (settings.scheme === 'taylor') key = Object.hasOwn(TAYLOR, upper) ? upper : 'other';
    if (settings.scheme === 'hydrophobicity') key = Object.hasOwn(HYDROPHOBICITY, upper) ? upper : 'other';
    if (settings.scheme === 'zappo' || settings.scheme.startsWith('classes-')) key = (keys.find(k => k.symbols.includes(upper)) ?? {key:'other'}).key;
    if (settings.scheme === 'clustalx') key = clustalKey(upper, stats);
    if (REFERENCE_SCHEMES.includes(settings.scheme)) key = isAlignmentGap(referenceSymbol) ? 'insertion' : upper === referenceSymbol.toUpperCase() ? 'match' : 'substitution';
  }
  const category = key === 'continuous' ? {label:`Identity ${(score*100).toFixed(1)}%`} : keys.find(k => k.key === key) ?? keys.find(k => k.key === 'other');
  const color = continuousColor ?? settings.colors[`${settings.scheme}:${key}`] ?? (['other','gap'].includes(key) ? settings.colors.cell : category.color);
  const luminance = hexLuminance(color, settings.colors.paper);
  const dark = 1.05 / (luminance + .05) > (luminance + .05) / (hexLuminance('#111111') + .05);
  const background = settings.paint === 'letters' || settings.scheme === 'plain' ? settings.colors.cell : color;
  const foreground = settings.paint === 'letters' && !['other','gap'].includes(key) ? color
    : settings.paint === 'both' && settings.automaticContrast && settings.scheme !== 'plain' ? dark ? '#ffffff' : '#111111' : settings.colors.letter;
  return { key, label: category.label, background, foreground, count, fraction };
}
function hexLuminance(hex, paper = '#ffffff') {
  const alpha = hex.length === 9 ? parseInt(hex.slice(7,9),16)/255 : 1;
  const paperAlpha = paper.length === 9 ? parseInt(paper.slice(7,9),16)/255 : 1;
  const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16) / 255 * alpha + (parseInt(paper.slice(i,i+2),16)/255*paperAlpha+1-paperAlpha)*(1-alpha)).map(v => v <= .04045 ? v / 12.92 : ((v+.055)/1.055)**2.4);
  return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
}
