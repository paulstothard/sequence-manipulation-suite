import{a as n,b as o}from"./chunk-RIN5JT7H.js";import"./chunk-B6JNHY6R.js";function t(r){return r.trim().split(/\n(?=>)/).map(l=>{let[a,...i]=l.split(`
`),e=/^>((?:NM|XM)_\d+\.\d+)_(.+)_CDS_/.exec(a);if(!e)throw new Error("Unexpected phylogeny example provenance header.");let p=i.join("");return`>${e[2]}|${e[1]}
${p.match(/.{1,60}/g).join(`
`)}`}).join(`
`)}var c=t(n),s=t(o);export{c as workflowDnaFamilyExample,s as workflowProteinFamilyExample};
