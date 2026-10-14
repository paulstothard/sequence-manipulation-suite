import { parsePrimerRecords, parsePrimerSequences } from "../core/primer-input.js";

export function createPrimerInputGuidance(textarea, { id, help, noun = "primer", countAttribute } = {}) {
  const document = textarea.ownerDocument;
  if (!textarea.id) textarea.id = `${id}Source`;
  const guidance = document.createElement("div");
  guidance.id = id;
  guidance.className = "primer-oligo-input-guidance";
  const description = document.createElement("p");
  description.className = "split-input-description";
  description.textContent = help;
  const count = document.createElement("p");
  count.className = "split-input-description";
  count.dataset.primerListCount = noun;
  count.dataset.inputId = textarea.id;
  if (countAttribute) count.setAttribute(countAttribute, "");
  count.setAttribute("role", "status");
  guidance.append(description, count);
  const ids = new Set((textarea.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
  ids.add(id);
  textarea.setAttribute("aria-describedby", [...ids].join(" "));
  return guidance;
}

export function updatePrimerInputCounts(root) {
  for (const count of root.querySelectorAll("[data-primer-list-count]")) {
    const textarea = root.ownerDocument.getElementById(count.dataset.inputId);
    const noun = count.dataset.primerListCount;
    try {
      const total = (noun === "primer" ? parsePrimerSequences : parsePrimerRecords)(textarea?.value ?? "").length;
      count.textContent = `${total.toLocaleString()} ${noun}${total === 1 ? "" : "s"} loaded`;
    } catch (error) {
      count.textContent = error.message;
    }
  }
}
