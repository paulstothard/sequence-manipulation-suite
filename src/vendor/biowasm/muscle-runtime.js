// BioWasm package/tag 5.1.0 pins upstream 6c601163998616bb88991931e443c645858e162c.
// That source's src/myopts.h defines MY_VERSION="5.2"; the bundled binary
// announces 5.2.linux32. Keep package identity distinct from its runtime banner.
export const MUSCLE_RUNTIME = Object.freeze({
  packageVersion: '5.1.0',
  reportedVersion: '5.2.linux32',
  buildRevision: 'sms3-molecule1',
  sourceRevision: '6c601163998616bb88991931e443c645858e162c',
  versionLabel: '5.2.linux32 (SMS3 molecule fix 1; BioWasm package 5.1.0)'
});
