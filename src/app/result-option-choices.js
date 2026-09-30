// Bounded, data-only choices supplied by a completed tool result (for example archive entries).
export function updateResultOptionChoices(root, metadata, streams, {reset=false}={}) {
  function visit(options=[]) {
    for(const option of options) {
      if(option.type==='group') {visit(option.options);continue;}
      const source=option.choicesFromStream;
      if(!source)continue;
      const select=root.querySelector(`#${option.id}`);
      if(!select)continue;
      const stream=streams?.[source.streamId];
      if(!reset && (!stream || select.value))continue;
      const choices=(option.choices??[]).map(choice=>new Option(choice.label,choice.value));
      for(const row of (stream?.rows??[]).slice(0,10000)) {
        if(row.type!=='file')continue;
        if(Object.entries(source.where??{}).some(([key,value])=>row[key]!==value))continue;
        choices.push(new Option(`${row[source.value]}: ${row[source.label]}${row.encrypted==='Yes'?' (encrypted)':''}`,String(row[source.value])));
      }
      select.replaceChildren(...choices);
      select.value=option.defaultValue??'';
      if(source.hideWhenEmpty)select.closest('[data-option-id]').hidden=choices.length<2;
    }
  }
  visit(metadata?.options);
  root.dispatchEvent(new CustomEvent('sms3-result-option-choices',{detail:{streams,reset}}));
}
