const COPY_FEEDBACK_MS = 2200;
const activeFeedback = new WeakMap();

export function showCopiedFeedback(button) {
  if (!button) return;
  const previous = activeFeedback.get(button);
  const original = button.textContent === "Copied" && previous
    ? previous.original
    : {
        text: button.textContent,
        ariaLabel: button.getAttribute("aria-label"),
        title: button.getAttribute("title")
      };
  if (previous) clearTimeout(previous.timer);
  button.textContent = "Copied";
  if (original.ariaLabel !== null) button.setAttribute("aria-label", "Copied");
  if (original.title !== null) button.setAttribute("title", "Copied");
  const timer = setTimeout(() => {
    if (button.textContent === "Copied") {
      button.textContent = original.text;
      if (original.ariaLabel === null) button.removeAttribute("aria-label");
      else button.setAttribute("aria-label", original.ariaLabel);
      if (original.title === null) button.removeAttribute("title");
      else button.setAttribute("title", original.title);
    }
    activeFeedback.delete(button);
  }, COPY_FEEDBACK_MS);
  activeFeedback.set(button, { original, timer });
}

export async function copyTextWithFeedback(button, text) {
  await navigator.clipboard.writeText(String(text));
  showCopiedFeedback(button);
}
