import { serializeSvgElement, downloadSvgAsPng } from './svg-export.js';
import { downloadText } from './file-download.js';
import { makeSafeFileStem } from './canvas-export.js';
import { getViewerCanvasTheme } from './viewer-canvas-theme.js';

const ns='http://www.w3.org/2000/svg';
const element=(tag,attributes,text='')=>{
  const el=document.createElementNS(ns,tag);
  for(const [key,value] of Object.entries(attributes))el.setAttribute(key,value);
  el.textContent=text;return el;
};

export function orfMapSvg(svg,record,view) {
  const clone=svg.cloneNode(true), source=[svg,...svg.querySelectorAll('*')], copied=[clone,...clone.querySelectorAll('*')];
  const properties=['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','opacity','filter','clip-path','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','display','visibility'];
  // Resolve theme CSS in the live drawing so both standalone formats retain
  // the selected theme, clipping, text and selected-feature glow.
  source.forEach((node,index)=>{
    const style=getComputedStyle(node),parent=node.parentElement?getComputedStyle(node.parentElement):null;
    for(const property of properties) {
      const inherited=!['opacity','filter','clip-path','display'].includes(property);
      if(index&&inherited&&style.getPropertyValue(property)===parent?.getPropertyValue(property))continue;
      if(index&&['filter','clip-path'].includes(property)&&style.getPropertyValue(property)==='none')continue;
      if(index&&property==='opacity'&&style.opacity==='1')continue;
      if(index&&property==='display'&&style.display==='inline')continue;
      const value=style.getPropertyValue(property).replace(/url\(["']?[^#)]*#([^\)"']+)["']?\)/g,'url(#$1)');
      if(value)copied[index].style.setProperty(property,value);
    }
  });
  const width=svg.viewBox.baseVal.width,height=svg.viewBox.baseVal.height,theme=getViewerCanvasTheme(svg);
  const plot=element('g',{transform:'translate(0 54)'});
  for(const child of [...clone.childNodes])plot.append(child);
  clone.append(element('rect',{x:0,y:0,width,height:height+54,fill:theme.surface}),plot);
  const recordLabel=record.title.length>240?record.title.slice(0,237)+'…':record.title;
  const title=`${recordLabel} · ${Math.floor(view[0]).toLocaleString()}–${Math.ceil(view[1]).toLocaleString()} bp`;
  const measure=document.createElement('canvas').getContext('2d'); measure.font='600 12px system-ui, sans-serif';
  let fitted=title;
  while(fitted.length && measure.measureText(fitted).width>width-24)fitted=fitted.slice(0,-1);
  if(fitted!==title)fitted=fitted.slice(0,-1)+'…';
  clone.append(element('text',{x:12,y:18,fill:theme.text,'font-family':'system-ui, sans-serif','font-size':12,'font-weight':600},fitted));
  const colors=getComputedStyle(svg);
  for(const [x,label,color] of [[12,'Complete',colors.getPropertyValue('--app-output-accent')],[118,'Partial',colors.getPropertyValue('--app-output-warning')]]){
    clone.append(element('rect',{x,y:31,width:11,height:7,rx:2,fill:color.trim()}));
    clone.append(element('text',{x:x+17,y:39,fill:theme.muted,'font-family':'system-ui, sans-serif','font-size':11},label));
  }
  clone.setAttribute('viewBox',`0 0 ${width} ${height+54}`);clone.setAttribute('width',width);clone.setAttribute('height',height+54);
  clone.setAttribute('aria-label',`ORF Explorer · ${title}`);clone.removeAttribute('aria-describedby');
  return serializeSvgElement(clone);
}

export async function exportOrfMap(svg,record,view,format) {
  const output=orfMapSvg(svg,record,view);
  const stem=`orf-finder-${makeSafeFileStem(record.title,'sequence')}-${Math.floor(view[0])}-${Math.ceil(view[1])}`;
  if(format==='png')await downloadSvgAsPng(output,`${stem}.png`,{background:null});
  else downloadText(output,`${stem}.svg`,'image/svg+xml');
}
