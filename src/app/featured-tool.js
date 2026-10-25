export const FEATURED_TOOL_STORAGE_KEY = "sms3-featured-tool-v1";

export function localDateKey(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function randomFraction() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
  }
  // This fallback only chooses a navigation suggestion, not scientific data.
  return Math.random();
}

export function chooseFeaturedTool(toolIds, previous, {
  date = localDateKey(new Date()),
  advance = false,
  random = randomFraction
} = {}) {
  const ids = [...new Set(toolIds)];
  const available = new Set(ids);
  const saved = previous?.version === 1 ? previous : null;
  const currentId = available.has(saved?.currentId) ? saved.currentId : null;
  let seen = new Set(Array.isArray(saved?.seenIds)
    ? saved.seenIds.filter((id) => available.has(id))
    : []);
  if (currentId) seen.add(currentId);

  if (currentId && saved.date === date && !advance) {
    return { version: 1, date, currentId, seenIds: [...seen] };
  }

  let remaining = ids.filter((id) => !seen.has(id));
  if (remaining.length === 0) {
    seen = new Set();
    // A new cycle should not immediately repeat its predecessor's last tool.
    remaining = ids.filter((id) => ids.length === 1 || id !== currentId);
  }
  const nextId = remaining.length ? remaining[Math.floor(random() * remaining.length)] : null;
  if (nextId) seen.add(nextId);
  return { version: 1, date, currentId: nextId, seenIds: [...seen] };
}

export function createFeaturedToolRotation({
  getStorage = () => globalThis.localStorage,
  now = () => new Date(),
  random = randomFraction
} = {}) {
  let memory = null;
  let storageFailed = false;

  return (toolIds, { advance = false } = {}) => {
    let storage;
    if (!storageFailed) {
      try {
        storage = getStorage();
        const saved = storage?.getItem(FEATURED_TOOL_STORAGE_KEY);
        if (saved) {
          try { memory = JSON.parse(saved); } catch { /* Replace malformed saved state below. */ }
        }
      } catch {
        storageFailed = true;
      }
    }
    memory = chooseFeaturedTool(toolIds, memory, { date: localDateKey(now()), advance, random });
    try {
      storage?.setItem(FEATURED_TOOL_STORAGE_KEY, JSON.stringify(memory));
    } catch {
      // Keep the rotation usable for this visit when storage is unavailable/full.
      storageFailed = true;
    }
    return memory.currentId;
  };
}

export function createFeaturedToolCard(tools, rotate) {
  if (tools.length === 0) return null;
  const toolIds = tools.map((tool) => tool.metadata.id);
  const byId = new Map(tools.map((tool) => [tool.metadata.id, tool]));
  const card = document.createElement("section");
  card.className = "home-featured-tool";
  card.setAttribute("aria-labelledby", "featuredToolLabel");

  const label = document.createElement("p");
  label.id = "featuredToolLabel";
  label.className = "home-featured-label";
  label.textContent = "Featured tool";

  const content = document.createElement("div");
  content.className = "home-featured-content";
  content.setAttribute("aria-live", "polite");
  content.setAttribute("aria-atomic", "true");
  const category = document.createElement("p");
  category.className = "home-featured-category";
  const name = document.createElement("h3");
  name.id = "featuredToolName";
  const description = document.createElement("p");
  description.className = "home-featured-description";
  content.append(category, name, description);

  const actions = document.createElement("div");
  actions.className = "home-featured-actions";
  const open = document.createElement("a");
  open.className = "home-featured-open";
  open.textContent = "Open tool";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Show another";
  next.disabled = toolIds.length < 2;
  actions.append(open, next);
  card.append(label, content, actions);

  function update(advance = false) {
    const tool = byId.get(rotate(toolIds, { advance }));
    const metadata = tool.metadata;
    card.dataset.toolId = metadata.id;
    category.textContent = metadata.category;
    name.textContent = metadata.name;
    description.textContent = metadata.whenToUse?.trim() || metadata.summary;
    open.href = `#tool=${encodeURIComponent(metadata.id)}`;
    open.setAttribute("aria-label", `Open ${metadata.name}`);
  }
  next.addEventListener("click", () => update(true));
  update();
  return card;
}
