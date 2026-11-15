export function makeCheckboxToggle(text, checked) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  label.append(input, text);
  return { label, input };
}
