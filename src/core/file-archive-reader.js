import { BlobReader, ZipReader, configure, Gunzip, createTarDecoder } from '../vendor/file-tools/archive-runtime.js';
import { FILE_TOOL_LIMITS as LIMIT, fileCheckpoint, readByteRange, joinByteChunks } from './local-file-bytes.js';
import { containerType } from './file-container.js';
export { containerType } from './file-container.js';

configure({ useWebWorkers: false, chunkSize: 65536 });
export const archiveColumns = [
  {id:'id',label:'Entry',type:'string'}, {id:'path',label:'Path',type:'string'},
  {id:'type',label:'Type',type:'string'}, {id:'bytes',label:'Bytes',type:'number'},
  {id:'compressed_bytes',label:'Compressed bytes',type:'number'},
  {id:'encrypted',label:'Encrypted',type:'string'}, {id:'modified',label:'Modified',type:'string'},
  {id:'link',label:'Link target',type:'string'}, {id:'preview',label:'Content preview',type:'string'}
];
class ScanLimit extends Error { constructor() { super('Archive scan reached the 512 MiB reading limit. The listing is partial; later entries may be absent.'); } }
function safeSize(size) { if (!Number.isSafeInteger(size) || size < 0) throw new Error('Archive entry size exceeds exact browser byte accounting.'); return size; }
function safePath(path) { if (path.length > LIMIT.archivePathCharacters) throw new Error('Archive path exceeds 4,096 characters.'); return path; }
function date(value) { return value instanceof Date && !Number.isNaN(+value) ? value.toISOString() : ''; }
function matches(row, selection) { return row.id === selection; }
function progress(context, stats, file) {
  context.reportProgress?.({phase:'reading-archive',progress:file.size ? Math.min(1,stats.bytesRead/file.size):1,bytesRead:stats.bytesRead,totalBytes:file.size});
}

async function* fileChunks(file, context, stats, chunkSize=65536) {
  for(let offset=0;offset<file.size;offset+=chunkSize) {
    if(offset>=LIMIT.archiveScanBytes) throw new ScanLimit();
    await fileCheckpoint(context);
    const data=await readByteRange(file,offset,Math.min(file.size,offset+chunkSize,LIMIT.archiveScanBytes),context);
    stats.bytesRead+=data.length; progress(context,stats,file);
    yield data;
  }
}

// Small compressed chunks bound each synchronous inflater allocation even for highly compressible data.
async function* gzipChunks(file, context, stats) {
  let output=[], decoded=0;
  const inflater=new Gunzip((chunk)=>output.push(chunk));
  let consumed=0;
  for await(const chunk of fileChunks(file,context,stats,4096)) {
    consumed+=chunk.length;
    inflater.push(chunk,consumed===file.size);
    for(const data of output) {
      const remaining=LIMIT.archiveScanBytes-decoded;
      if(data.length>remaining) {
        if(remaining) yield data.subarray(0,remaining);
        throw new ScanLimit();
      }
      decoded+=data.length;
      if(data.length) yield data;
    }
    output=[];
  }
  if(!file.size) throw new Error('Empty .gz input.');
}

async function takePrefix(iterator, maximum) {
  const chunks=[]; let size=0,complete=false;
  while(size<maximum+1) {
    const step=await iterator.next();
    if(step.done) {complete=true;break;}
    const amount=Math.min(step.value.length,maximum+1-size);
    chunks.push(step.value.subarray(0,amount)); size+=amount;
  }
  return {bytes:joinByteChunks(chunks).subarray(0,maximum),complete:complete&&size<=maximum};
}

function iteratorStream(iterator) {
  return new ReadableStream({
    async pull(controller) { try {const next=await iterator.next(); if(next.done)controller.close();else controller.enqueue(next.value);} catch(error){controller.error(error);} },
    async cancel() {await iterator.return?.();}
  },{highWaterMark:0});
}

async function readTar(iterator, selection, context, stats) {
  const decoder=createTarDecoder({strict:true});
  const abort=new AbortController();
  const reader=decoder.readable.getReader();
  // Observe immediately; a rejected producer must never become an unhandled promise.
  const pump=iteratorStream(iterator).pipeTo(decoder.writable,{signal:abort.signal}).catch(error=>error);
  const entries=[],warnings=[];
  let selected=null,sample=null,complete=false;
  try {
    while(true) {
      await fileCheckpoint(context);
      const step=await reader.read();
      if(step.done) {complete=true;break;}
      const {header,body}=step.value;
      const row={id:String(entries.length+1),path:safePath(header.name),type:header.type,bytes:safeSize(header.size),compressed_bytes:null,encrypted:'No',modified:date(header.mtime),link:safePath(header.linkname??'')};
      row.preview=row.type==='file'?'Available':'Folder or link';
      entries.push(row);
      if(selection && matches(row,selection)) {
        if(row.type!=='file') {await body.cancel();throw new Error('Choose a regular file entry. Folders and links are listed but are not followed.');}
        selected=row;
        const bodyReader=body.getReader();
        try { sample=await takePrefix({next:()=>bodyReader.read()},LIMIT.previewBytes); }
        finally {await bodyReader.cancel().catch(()=>{});bodyReader.releaseLock();}
        break;
      }
      await body.cancel();
      if(entries.length>=LIMIT.archiveEntries) {warnings.push('Archive listing stopped at 10,000 entries. Later entries may be absent.');break;}
    }
  } catch(error) {
    if(error instanceof ScanLimit) warnings.push(error.message);
    else throw error;
  } finally {
    abort.abort();
    await reader.cancel().catch(()=>{}); reader.releaseLock();
    await pump;
    await iterator.return?.();
  }
  if(selection&&!selected) throw new Error(`Entry ${selection} was not found within the scanned portion of the archive. List the archive and choose an available entry.`);
  return {entries,warnings,selected,sample,complete,stats};
}

async function readZip(file, selection, context, stats) {
  const source=new BlobReader(file);
  // zip.js requests the central directory in one read, so guard BEFORE allocation.
  source.readUint8Array=async(index,length)=>{
    if(length>LIMIT.archiveDirectoryBytes) throw new Error('The .zip directory/read range exceeds 16 MiB. This archive cannot be listed within the preview limits.');
    if(stats.bytesRead+length>LIMIT.archiveScanBytes) throw new ScanLimit();
    await fileCheckpoint(context);
    const data=await readByteRange(file,index,index+length,context);
    stats.bytesRead+=data.length;progress(context,stats,file);return data;
  };
  source.createReadable=({offset=0,size=file.size-offset,chunkSize=65536}={})=>{
    let position=0;
    return new ReadableStream({async pull(controller) {
      if(position>=size) {controller.close();return;}
      try {
        const bytes=await source.readUint8Array(offset+position,Math.min(chunkSize,65536,size-position));
        position+=bytes.length;controller.enqueue(bytes);
      } catch(error) {controller.error(error);}
    }},{highWaterMark:0});
  };
  const zip=new ZipReader(source,{useWebWorkers:false});
  const entries=[],warnings=[];
  let selected=null,sample=null,complete=false;
  try {
    for await(const entry of zip.getEntriesGenerator()) {
      await fileCheckpoint(context);
      const row={id:String(entries.length+1),path:safePath(entry.filename),type:entry.directory?'directory':entry.symlink?'symlink':'file',bytes:safeSize(entry.uncompressedSize),compressed_bytes:safeSize(entry.compressedSize),encrypted:entry.encrypted?'Yes':'No',modified:date(entry.lastModDate),link:''};
      row.preview=row.type!=='file'?'Folder or link':entry.encrypted?'Encrypted':[0,8,9].includes(entry.compressionMethod)?'Available':'Unsupported compression';
      entries.push(row);
      if(selection&&matches(row,selection)) {
        if(entry.directory||entry.symlink) throw new Error('Choose a regular file entry rather than a folder or link.');
        if(entry.encrypted) throw new Error('Encrypted entries in .zip files can be listed but cannot be previewed.');
        if(row.preview!=='Available') throw new Error('This .zip entry uses unsupported compression and cannot be previewed.');
        selected=row;
        const chunks=[];let size=0,limited=false;
        const stop=new Error('Preview prefix complete');
        const sink=new WritableStream({async write(data) {
          await fileCheckpoint(context);
          const amount=Math.min(data.length,LIMIT.previewBytes-size);
          if(amount) {chunks.push(data.slice(0,amount));size+=amount;}
          if(data.length>amount || (size>=LIMIT.previewBytes && size<row.bytes)) {limited=true;throw stop;}
        }});
        try {await entry.getData(sink,{useWebWorkers:false,checkSignature:true});}
        catch(error) {if(!limited)throw error;}
        if(!limited && size!==row.bytes) throw new Error('The .zip member size does not match its directory metadata.');
        sample={bytes:joinByteChunks(chunks,size),complete:!limited};
        break;
      }
      if(entries.length>=LIMIT.archiveEntries) {warnings.push('Archive listing stopped at 10,000 entries. Later entries may be absent.');break;}
    }
    complete=!selection&&entries.length<LIMIT.archiveEntries;
  } finally {await zip.close();}
  if(selection&&!selected) throw new Error(`Entry ${selection} was not found. List the archive and choose an available entry.`);
  return {entries,warnings,selected,sample,complete,stats};
}

export async function readArchive(file,type,selection='',context={}) {
  const stats={bytesRead:0};
  if(type==='zip') return {...await readZip(file,selection,context,stats),format:'ZIP'};
  if(type==='tar') return {...await readTar(fileChunks(file,context,stats),selection,context,stats),format:'TAR'};
  const chunks=gzipChunks(file,context,stats);
  const first=await chunks.next();
  const prefix=first.value??new Uint8Array();
  async function* replay() {try {if(prefix.length)yield prefix;yield* chunks;} finally {await chunks.return?.();}}
  const source=replay();
  try {
    if(containerType(prefix,file.name?.replace(/(?:\.tgz|\.tar\.gz)$/i,'.tar'))==='tar') {
      return {...await readTar(source,selection,context,stats),format:'TAR.GZ'};
    }
    if(selection) throw new Error('This .gz file contains one content stream. Clear the archive entry selection.');
    const sample=await takePrefix(source,LIMIT.previewBytes);
    return {entries:null,selected:null,sample,warnings:[],complete:sample.complete,stats,format:'GZIP'};
  } finally {await source.return?.();await chunks.return?.();}
}
