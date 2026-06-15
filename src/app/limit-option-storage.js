export const TOOL_LIMIT_OPTIONS_STORAGE_KEY = "sms3-tool-limit-options";

const PERSISTENT_LIMIT_OPTION_TYPES = new Set(["checkbox", "number", "radio", "select", "text"]);

function flattenOptions(options = []) {
  return options.flatMap((option) => option.type === "group" ? flattenOptions(option.options ?? []) : [option]);
}

function isPersistentLimitGroup(option) {
  if (option?.type !== "group") {
    return false;
  }
  const id = String(option.id ?? "");
  const label = String(option.label ?? "");
  if (id === "axisLimits" || /^axis limits$/i.test(label)) {
    return false;
  }
  return id === "advancedLimits" ||
    id === "referenceMatchLimitsGroup" ||
    /\blimits?\b/i.test(label);
}

export function collectPersistentLimitOptionIds(options, insideLimitGroup = false) {
  return options.flatMap((option) => {
    const nextInsideLimitGroup = insideLimitGroup || isPersistentLimitGroup(option);
    if (option.type === "group") {
      return collectPersistentLimitOptionIds(option.options ?? [], nextInsideLimitGroup);
    }
    if (nextInsideLimitGroup && option.id && PERSISTENT_LIMIT_OPTION_TYPES.has(option.type)) {
      return [option.id];
    }
    return [];
  });
}

function getStorage(storage) {
  return storage ?? globalThis.localStorage;
}

function readStoredLimitOptions(storage) {
  try {
    const parsed = JSON.parse(getStorage(storage)?.getItem(TOOL_LIMIT_OPTIONS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredLimitOptions(stored, storage) {
  try {
    getStorage(storage)?.setItem(TOOL_LIMIT_OPTIONS_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Ignore storage failures; edited limits still apply to the current page session.
  }
}

function normalizeStoredOptionValue(option, value) {
  if (option.type === "checkbox") {
    return value === true || value === "true";
  }
  if (option.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return undefined;
    }
    const min = Number(option.min);
    const max = Number(option.max);
    if (Number.isFinite(min) && number < min) {
      return min;
    }
    if (Number.isFinite(max) && number > max) {
      return max;
    }
    return number;
  }
  if (option.type === "radio" || option.type === "select") {
    const text = String(value ?? "");
    return (option.choices ?? []).some((choice) => choice.value === text) ? text : undefined;
  }
  if (option.type === "text") {
    return String(value ?? "");
  }
  return undefined;
}

export function getStoredLimitOptionValues(toolId, options, storage) {
  if (!toolId) {
    return {};
  }
  const limitOptionIds = new Set(collectPersistentLimitOptionIds(options));
  if (limitOptionIds.size === 0) {
    return {};
  }
  const storedForTool = readStoredLimitOptions(storage)[toolId];
  if (!storedForTool || typeof storedForTool !== "object" || Array.isArray(storedForTool)) {
    return {};
  }
  const optionsById = new Map(flattenOptions(options).map((option) => [option.id, option]));
  const values = {};
  for (const id of limitOptionIds) {
    if (!Object.hasOwn(storedForTool, id)) {
      continue;
    }
    const option = optionsById.get(id);
    const value = option ? normalizeStoredOptionValue(option, storedForTool[id]) : undefined;
    if (value !== undefined) {
      values[id] = value;
    }
  }
  return values;
}

export function persistLimitOptionValue(tool, optionId, value, storage) {
  if (!tool || !optionId) {
    return;
  }
  const options = tool.metadata.options ?? [];
  const limitOptionIds = new Set(collectPersistentLimitOptionIds(options));
  if (!limitOptionIds.has(optionId)) {
    return;
  }
  const option = flattenOptions(options).find((candidate) => candidate.id === optionId);
  if (!option) {
    return;
  }
  const normalizedValue = normalizeStoredOptionValue(option, value);
  const defaultValue = normalizeStoredOptionValue(option, option.defaultValue);
  const stored = readStoredLimitOptions(storage);
  const storedForTool = { ...(stored[tool.metadata.id] ?? {}) };
  if (normalizedValue === undefined || Object.is(normalizedValue, defaultValue)) {
    delete storedForTool[optionId];
  } else {
    storedForTool[optionId] = normalizedValue;
  }
  if (Object.keys(storedForTool).length === 0) {
    delete stored[tool.metadata.id];
  } else {
    stored[tool.metadata.id] = storedForTool;
  }
  writeStoredLimitOptions(stored, storage);
}
