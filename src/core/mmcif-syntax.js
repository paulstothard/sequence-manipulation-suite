// PDBx/mmCIF lexical and loop rules:
// https://mmcif.wwpdb.org/docs/tutorials/mechanics/pdbx-mmcif-syntax.html
function* tokens(text) {
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue; }
    if (text[i] === '#') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (text[i] === ';' && (i === 0 || text[i-1] === '\n')) {
      const start = ++i;
      while (i < text.length && !(text[i] === ';' && text[i-1] === '\n')) i++;
      if (i === text.length) throw new Error('Unterminated mmCIF semicolon text.');
      yield {value:text.slice(start, i).replace(/\n$/, ''), quoted:true};
      i++;
      if (i < text.length && !/\s/.test(text[i])) throw new Error('Invalid mmCIF semicolon delimiter.');
      continue;
    }
    if (text[i] === "'" || text[i] === '"') {
      const quote=text[i++], start=i;
      while (i < text.length && !(text[i]===quote && (i+1===text.length || /\s/.test(text[i+1])))) {
        if (text[i]==='\n') throw new Error('Quoted mmCIF values cannot cross a line; use semicolon text.');
        i++;
      }
      if (i === text.length) throw new Error('Unterminated mmCIF quoted value.');
      yield {value:text.slice(start,i++),quoted:true};
      continue;
    }
    const start=i;
    while (i < text.length && !/\s/.test(text[i])) i++;
    yield {value:text.slice(start,i),quoted:false};
  }
}
const control=t=>t && !t.quoted && /^(?:_|loop_$|data_|save_|stop_$|global_$)/i.test(t.value);
export function parseMmcifData(input) {
  const iterator=tokens(String(input).replace(/\r\n?/g,'\n'));
  let current=iterator.next().value, blocks=0;
  const next=()=>{current=iterator.next().value;};
  const items=new Map(), loops=[];
  while (current) {
    const word=current.value.toLowerCase();
    if (!current.quoted && word.startsWith('data_')) {
      if (++blocks > 1) throw new Error('Multiple mmCIF data blocks require separate structure inputs; blocks cannot be merged.');
      next(); continue;
    }
    if (!current.quoted && word==='loop_') {
      next(); const columns=[];
      while(current && !current.quoted && current.value.startsWith('_')) {columns.push(current.value.toLowerCase());next();}
      if (!columns.length || new Set(columns).size !== columns.length) throw new Error('Invalid mmCIF loop columns.');
      if (new Set(columns.map(c=>c.split('.')[0])).size!==1) throw new Error('mmCIF loop columns must belong to one category.');
      const rows=[]; let row=[];
      while (current && !control(current)) {
        row.push(!current.quoted && ['.','?'].includes(current.value) ? '' : current.value);
        if(row.length===columns.length) {rows.push(row);row=[];}
        next();
      }
      if (row.length) throw new Error(`Incomplete mmCIF loop row: expected ${columns.length} values, found ${row.length}.`);
      loops.push({columns,rows}); continue;
    }
    if (!current.quoted && word.startsWith('_')) {
      next();
      if (!current || control(current)) throw new Error(`Missing mmCIF value for ${word}.`);
      items.set(word,current.value);next();continue;
    }
    throw new Error(`Unsupported mmCIF syntax near ${current.value.slice(0,40)}.`);
  }
  return {items,loops};
}
