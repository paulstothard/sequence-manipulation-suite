// Synthetic assay-planning example: four cohorts, standards, blanks, and controls.
export const plateLayoutExample = [
  "sample,group,role,replicates,plate,well,notes",
  'NTC,Controls,control,2,1,"A1,A2",No-template controls',
  'Blank,Controls,blank,2,1,"H11,H12",Buffer only',
  ...[100, 25, 6.25, 1.5625].map((v, i) => `Std-${i + 1},Standards,standard,2,,,${v} ng/µL`),
  ...["Vehicle", "Low dose", "High dose", "Recovery"].flatMap((group, g) => Array.from({ length: 6 }, (_, i) => `Sample-${String(g * 6 + i + 1).padStart(2, "0")},${group},sample,3,,,Biological sample ${i + 1}`))
].join("\n");
