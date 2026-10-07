function h(n,e="sequence"){let t=String(n??"").replace(/\r\n?/g,`
`).trim();if(!t)return[];if(!t.startsWith(">"))return[{title:e,sequence:t.replace(/\s+/g,""),hadHeader:!1}];let r=[],i=t.split(/\n(?=>)/);for(let s of i){let o=s.split(/\r?\n/),u=(o.shift()??"").replace(/^>\s*/,"").trim()||e,l=o.join("").replace(/\s+/g,"");r.push({title:u,sequence:l,hadHeader:!0})}return r}function f(n,e,t=60){if(/[\r\n]/.test(String(n)))throw new Error("FASTA titles must not contain line breaks.");let r=Math.max(1,Number.parseInt(t,10)||60),i=[`>${n}`];for(let s=0;s<e.length;s+=r)i.push(e.slice(s,s+r));return`${i.join(`
`)}
`}function p(n){let e=String(n??"").trim();return/[A-Za-z*?]/.test(e)&&/^[A-Za-z*.?-]+$/.test(e)}function a(n,e,t){if(!n)return;e.push(n.header);let r=n.sequenceParts.join("").replace(/\s+/g,"");for(let i=0;i<r.length;i+=t)e.push(r.slice(i,i+t))}function d(n,e=60){let t=String(n??"");if(!t.trim().startsWith(">"))return t;let r=Math.max(1,Number.parseInt(e,10)||60),i=t.replace(/\r\n?/g,`
`).split(`
`),s=[],o=null;for(let c of i){if(c.startsWith(">")){a(o,s,r),o={header:c,sequenceParts:[]};continue}if(o&&p(c)){o.sequenceParts.push(c.trim());continue}a(o,s,r),o=null,s.push(c)}return a(o,s,r),s.join(`
`).replace(/\n{3,}/g,`

`)}export{h as a,f as b,d as c};
