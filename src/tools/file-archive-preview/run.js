import {previewFile} from '../../core/file-preview.js';
import {archiveColumns} from '../../core/file-archive-reader.js';
import {exportDelimitedTable} from '../../core/table.js';
import {makeTableStream,makeTextStream,makeToolResult} from '../../core/workflow.js';

export async function runFileArchivePreview(input,options={},context={}) {
  const result=await previewFile(input,options,context);
  const format=options.outputFormat??'preview';
  const streams={};
  const listing=Boolean(result.archive?.entries&&!result.archive.selected);
  const counts=result.sections.map(section=>`${section.label}: ${section.kind==='binary'?`${section.byteCount} bytes`:`${section.lineCount} source lines`}`);
  const status=listing
    ? `${result.partial?'Partial archive listing':'Archive listing'} — ${result.archive.entries.length} entries.`
    : `${result.partial?'Partial preview':'Complete file content'} — ${counts.join('; ')}.`;
  const sourceName=options.fileSourceMode==='file'?result.name:null;
  const filePreview={name:sourceName,status,sections:result.sections,separation:result.separation};
  const formatLabel={ZIP:'.zip',TAR:'.tar','TAR.GZ':'.tar.gz',GZIP:'.gz'}[result.format]??result.format;
  const report=[`File And Archive Preview`, sourceName?`File: ${JSON.stringify(sourceName)}`:'Source: Text input',`File/member size: ${result.total??'unknown'} bytes`,`Source bytes read: ${result.bytesRead}`,`Format: ${formatLabel}`,`Encoding: ${result.encoding??'not applicable'}`,status,
    ...(listing?[]:result.sections.map(section=>`${section.label} sample starts at byte offset ${section.offset}.`)),
    ...(result.separation?[result.separation]:[]),'',...result.warnings.map(warning=>`Note: ${warning}`),'','References: https://gildas-lormeau.github.io/zip.js/ | https://github.com/101arrowz/fflate | https://github.com/ayuhito/modern-tar | https://github.com/sindresorhus/file-type'].join('\n');
  let output,filename='file-archive-preview-report.txt',mimeType='text/plain;charset=utf-8';
  if(listing)streams.archiveEntries=makeTableStream(archiveColumns,result.archive.entries,'archive-entries');
  if(format==='report') {
    output=report;streams.report=makeTextStream(output);
  } else if(listing) {
    output=exportDelimitedTable(archiveColumns,result.archive.entries);
    filename='file-archive-preview-entries.tsv';mimeType='text/tab-separated-values;charset=utf-8';
    streams.preview=makeTextStream(output,mimeType);
  } else {
    for(const section of result.sections) {
      section.filename=`file-archive-preview-${section.key}${section.kind==='binary'?'-hex':''}.txt`;
      const stream=makeTextStream(section.text);
      stream.filePreview={name:sourceName,status:`${section.partial?'Partial preview':'Complete file content'} — ${counts[result.sections.indexOf(section)]}.`,sections:[section],separation:''};
      streams[section.key]=stream;
    }
    if(result.sections.length===1) {
      const section=result.sections[0],stream=streams[section.key];
      output=section.text;filename=section.filename;
      streams.preview=stream;
      streams[section.kind==='binary'?'hex':'previewText']=stream;
    } else {
      // The primary text is a description, never a concatenation of the excerpts.
      // Workflows must select beginning or end explicitly to obtain source text.
      output=report;
    }
  }
  const toolResult=makeToolResult({output,warnings:result.warnings,streams,recordsProcessed:listing?result.archive.entries.length:1,basesProcessed:result.bytesRead,processedUnitLabel:'byte',sequenceSearch:false,
    visual:{previewStatus:status,...(!listing&&format!=='report'?{filePreview}:{})},download:{filename,mimeType}});
  toolResult.streams.primary.contentKind=listing?'archive':new Set(result.sections.map(section=>section.kind)).size>1?'mixed':result.sections[0]?.kind;
  return toolResult;
}
