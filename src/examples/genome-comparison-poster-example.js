const BASES = ["A", "C", "G", "T"];

function wrapSequence(sequence, width = 70) {
  const lines = [];
  for (let index = 0; index < sequence.length; index += width) {
    lines.push(sequence.slice(index, index + width));
  }
  return lines.join("\n");
}

function makeDeterministicDna(length, seed) {
  let state = seed >>> 0;
  let sequence = "";
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    sequence += BASES[(state >>> 16) & 3];
  }
  return sequence;
}

function nextBase(base, shift = 1) {
  const index = BASES.indexOf(base);
  return BASES[(Math.max(0, index) + shift) % BASES.length];
}

function mutateEvery(sequence, step, offset = 0, shift = 1) {
  const chars = sequence.split("");
  for (let index = offset; index < chars.length; index += step) {
    chars[index] = nextBase(chars[index], shift + (index % 3));
  }
  return chars.join("");
}

function complement(base) {
  if (base === "A") return "T";
  if (base === "T") return "A";
  if (base === "C") return "G";
  if (base === "G") return "C";
  return "N";
}

function reverseComplement(sequence) {
  return sequence
    .split("")
    .reverse()
    .map(complement)
    .join("");
}

const referenceSegments = Array.from({ length: 10 }, (_, index) =>
  makeDeterministicDna(420, 0x5a17 + index * 0x1f3d)
);
const referenceSequence = referenceSegments.join("");
const referenceRecords = [
  ["lambda_reference_contig_A_B", joinSegments([0, 1])],
  ["lambda_reference_contig_C_D_E", joinSegments([2, 3, 4])],
  ["lambda_reference_contig_F_G", joinSegments([5, 6])],
  ["lambda_reference_contig_H_I_J", joinSegments([7, 8, 9])]
];

function joinSegments(indexes) {
  return indexes.map((index) => referenceSegments[index]).join("");
}

function comparisonSection(title, records) {
  const normalizedRecords = Array.isArray(records[0]) ? records : [[title, records]];
  return [
    "---",
    ...normalizedRecords.map(([recordTitle, sequence]) => `>${recordTitle}\n${wrapSequence(sequence)}`)
  ].join("\n");
}

const comparisonRecords = [
  ["lambda_poster_seqA_close", mutateEvery(referenceSequence, 211, 37, 1)],
  [
    "lambda_poster_seqB_swapped_blocks",
    mutateEvery(joinSegments([0, 1, 4, 5, 2, 3, 6, 7, 8, 9]), 173, 41, 2)
  ],
  [
    "lambda_poster_seqC_inversion_missing",
    mutateEvery([
      joinSegments([0, 1, 2]),
      reverseComplement(joinSegments([5, 4])),
      joinSegments([6, 7, 8, 9])
    ].join(""), 191, 73, 1)
  ],
  [
    "lambda_poster_seqF_fragmented",
    [
      ["lambda_poster_seqF_fragmented", mutateEvery(joinSegments([0, 1]), 137, 23, 1)],
      ["lambda_poster_seqF_fragmented_contig2_CDE", joinSegments([2, 3, 4])],
      ["lambda_poster_seqF_fragmented_contig3_H_dup_then_G", [
        referenceSegments[7],
        mutateEvery(referenceSegments[7], 149, 11, 2),
        referenceSegments[6]
      ].join("")],
      ["lambda_poster_seqF_fragmented_contig4_reverse_F_plus_IJ", [
        reverseComplement(referenceSegments[5]),
        joinSegments([8, 9])
      ].join("")]
    ]
  ]
];

export const genomeComparisonPosterExample = [
  ...referenceRecords.map(([title, sequence]) => `>${title}\n${wrapSequence(sequence)}`),
  ...comparisonRecords.map(([title, records]) => comparisonSection(title, records))
].join("\n");
