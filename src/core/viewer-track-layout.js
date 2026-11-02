export function isStackedIntervalTrack(track) {
  return track?.type === "features" || track?.layout === "stacked-intervals";
}

function circularGroupIntervals(copies, length, fullCircle) {
  const intervals = [];
  for (const copy of copies) {
    // At full extent use source coordinates so rounding at a moving drawing
    // seam cannot change packing. Zoomed windows occupy only their visible arcs.
    const start = fullCircle ? (copy.sourceStart ?? copy.start) : copy.start;
    const end = fullCircle ? (copy.sourceEnd ?? copy.end) : copy.end;
    const span = end - start;
    if (span >= length) return [{ start: 0, end: length }];
    const normalizedStart = ((start % length) + length) % length;
    const normalizedEnd = normalizedStart + span;
    intervals.push({ start: normalizedStart, end: Math.min(length, normalizedEnd) });
    if (normalizedEnd > length) intervals.push({ start: 0, end: normalizedEnd - length });
  }
  const merged = [];
  for (const interval of intervals.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

// Pack only visible competitors, retaining surviving models' lanes. Memory
// covers the previous window; it never reserves one row for every loaded gene.
export function layoutStableViewerIntervals(items, options = {}) {
  const copies = [...(options.copies ?? makeLinearIntervalCopies(items, options))];
  if (!options.copies) items.forEach((item, itemIndex) => {
    if (!item.connectParts) return;
    const parts = item.parts ?? [];
    const start = Math.max(options.viewStart ?? 0, Math.min(item.start - 1, ...parts.map(part => part.start - 1)));
    const end = Math.min(options.viewEnd ?? options.length, Math.max(item.end, ...parts.map(part => part.end)));
    if (end > start) copies.push({ item, itemIndex, start, end, connectorOnly: true });
  });
  const groups = new Map();
  for (const copy of copies) {
    const key = copy.item.layoutGroup ?? copy.item;
    if (!groups.has(key)) groups.set(key, { key, copies: [], start: Infinity, end: -Infinity });
    const group = groups.get(key);
    group.copies.push(copy);
    group.start = Math.min(group.start, copy.start);
    group.end = Math.max(group.end, copy.end);
  }
  const circularLength = Number(options.circularLength) || 0;
  for (const group of groups.values()) {
    // Circular fragments on opposite sides of the seam do not occupy the arc
    // between them. Linear models retain their connected bounding interval.
    group.intervals = circularLength > 0
      ? circularGroupIntervals(group.copies, circularLength, options.viewEnd - options.viewStart >= circularLength)
      : [{ start: group.start, end: group.end }];
    group.start = group.intervals[0].start;
    group.end = group.intervals.at(-1).end;
  }
  const maxSlots = Math.max(1, options.maxSlots || 1);
  const gap = Math.max(0, options.minGap || 0);
  const memory = options.memory ?? new Map();
  const selected = group => group.copies.some(copy => options.selectedFeatureId
    ? copy.item.featureId === options.selectedFeatureId : copy.itemIndex === options.selectedItemIndex);
  const sorted = [...groups.values()].sort((a, b) => Number(selected(b)) - Number(selected(a)) ||
    Number(memory.has(b.key)) - Number(memory.has(a.key)) || a.start - b.start || a.end - b.end);
  const lanes = Array.from({ length: maxSlots }, () => []);
  const placements = [], hidden = [], slotByItem = new Map(), nextMemory = new Map();
  function insertionIndex(lane, start) {
    let low = 0, high = lane.length;
    while (low < high) { const mid = (low + high) >> 1; if (lane[mid].start < start) low = mid + 1; else high = mid; }
    return low;
  }
  function available(lane, group) {
    return group.intervals.every(interval => {
      const index = insertionIndex(lane, interval.start);
      if (lane[index - 1] && lane[index - 1].end + gap > interval.start) return false;
      if (lane[index] && interval.end + gap > lane[index].start) return false;
      // The first and last occupied arcs are also neighbors on a circle.
      return !circularLength || !lane.length ||
        (lane.at(-1).end + gap <= interval.start + circularLength &&
          interval.end + gap <= lane[0].start + circularLength);
    });
  }
  for (const group of sorted) {
    const assignedSlot = fixedSlotForInterval(group.copies[0], options);
    group.promoted = selected(group) && assignedSlot !== null && assignedSlot >= maxSlots;
    const fixed = group.promoted ? maxSlots - 1 : assignedSlot;
    const preferred = fixed ?? memory.get(group.key);
    const candidates = fixed !== null ? [fixed]
      : [...new Set([preferred, ...lanes.map((_, index) => index)].filter(Number.isInteger))];
    const slot = candidates.find(index => index < maxSlots && (options.allowFixedSlotOverlaps && fixed !== null && !lanes[index].some(entry => entry.promoted) ||
      available(lanes[index], group)));
    if (slot === undefined) { hidden.push(...group.copies); continue; }
    for (const interval of group.intervals) {
      lanes[slot].splice(insertionIndex(lanes[slot], interval.start), 0, { ...interval, promoted: group.promoted });
    }
    nextMemory.set(group.key, slot);
    for (const copy of group.copies) {
      if (!copy.connectorOnly) placements.push({ ...copy, slot });
      slotByItem.set(copy.item, slot);
    }
  }
  memory.clear();
  for (const [key, slot] of nextMemory) memory.set(key, slot);
  return { placements, hidden, slotByItem, slotCount: maxSlots, maxSlots };
}

// Optional intron connectors for compound features assigned to a stable lane.
// Parts retain 1-based inclusive coordinates; drawing intervals are 0-based.
export function makeLinearPartConnectors(items, { viewStart, viewEnd }) {
  const connectors = [];
  for (const item of items) {
    if (!item.connectParts || !Number.isInteger(item.slot) || item.slot < 0) continue;
    const parts = [...(item.parts ?? [])].sort((a, b) => a.start - b.start);
    for (let index = 1; index < parts.length; index++) {
      const start = Math.max(viewStart, parts[index - 1].end);
      const end = Math.min(viewEnd, parts[index].start - 1);
      if (end > start) connectors.push({ item, slot: item.slot, start, end });
    }
  }
  return connectors;
}

function normalizeSlot(value) {
  const slot = Number.parseInt(value, 10);
  return Number.isFinite(slot) && slot >= 0 ? slot : null;
}

export function fixedSlotForInterval(interval, options = {}) {
  const item = interval.item ?? interval;
  const direct = normalizeSlot(item.slot ?? item.slotIndex ?? item.fixedSlot);
  if (direct !== null) {
    return direct;
  }
  const byType = options.fixedSlotsByType ?? options.slotByType ?? {};
  const keys = [
    item.type,
    item.feature,
    item.className,
    item.kind,
    item.name
  ].filter(Boolean);
  for (const key of keys) {
    const slot = normalizeSlot(byType[key]);
    if (slot !== null) {
      return slot;
    }
  }
  return null;
}

export function makeLinearIntervalCopies(items = [], options = {}) {
  const length = Number(options.length);
  const viewStart = Number(options.viewStart ?? 0);
  const viewEnd = Number(options.viewEnd ?? length);
  const copies = [];
  items.forEach((item, itemIndex) => {
    const rawParts = Array.isArray(item.displayParts) ? item.displayParts : Array.isArray(item.parts) && item.parts.length > 0
      ? item.parts
      : [{ start: item.start, end: item.end }];
    rawParts.forEach((part, partIndex) => {
      const start = Number(part.start) - 1;
      const end = Number(part.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      const intervals = Number.isFinite(length) && length > 0 && start > end
        ? [{ start, end: length }, { start: 0, end }]
        : [{ start, end }];
      for (const interval of intervals) {
        const clippedStart = Math.max(interval.start, viewStart);
        const clippedEnd = Math.min(interval.end, viewEnd);
        if (clippedEnd > clippedStart) {
          copies.push({
            item,
            itemIndex,
            partIndex,
            partCount: rawParts.length,
            start: clippedStart,
            end: clippedEnd,
            sourceStart: start,
            sourceEnd: end
          });
        }
      }
    });
  });
  return copies;
}

export function assignIntervalSlots(intervals = [], options = {}) {
  const maxSlots = Math.max(1, Number.parseInt(options.maxSlots, 10) || 8);
  const minGap = Math.max(0, Number(options.minGap) || 0);
  const allowFixedSlotOverlaps = options.allowFixedSlotOverlaps === true;
  const sorted = intervals
    .map((interval, order) => ({ ...interval, order }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
    .sort((left, right) =>
      left.start - right.start ||
      left.end - right.end ||
      left.order - right.order
    );
  const laneEnds = [];
  const placements = [];
  const hidden = [];
  for (const interval of sorted) {
    const fixedSlot = fixedSlotForInterval(interval, options);
    if (fixedSlot !== null) {
      if (fixedSlot >= maxSlots) {
        hidden.push(interval);
        continue;
      }
      const fixedLaneEnd = laneEnds[fixedSlot] ?? -Infinity;
      if (!allowFixedSlotOverlaps && interval.start < fixedLaneEnd + minGap) {
        hidden.push(interval);
        continue;
      }
      laneEnds[fixedSlot] = Math.max(fixedLaneEnd, interval.end);
      placements.push({ ...interval, slot: fixedSlot, fixedSlot: true });
      continue;
    }
    let slot = -1;
    for (let candidate = 0; candidate < Math.min(laneEnds.length, maxSlots); candidate += 1) {
      if (interval.start >= laneEnds[candidate] + minGap) {
        slot = candidate;
        break;
      }
    }
    if (slot === -1 && laneEnds.length < maxSlots) {
      slot = laneEnds.length;
    }
    if (slot === -1) {
      hidden.push(interval);
      continue;
    }
    laneEnds[slot] = interval.end;
    placements.push({ ...interval, slot });
  }
  return {
    placements: placements.sort((left, right) => left.order - right.order),
    hidden,
    slotCount: Math.max(1, laneEnds.length),
    maxSlots
  };
}

// Pack each connected model as one interval; UTR/CDS pieces share its lane.
// Offscreen models never allocate lanes. Synthetic envelopes are only geometry:
// inspection, sequence extraction and exports retain the original source items.
export function layoutFeatureModels(items = [], options = {}) {
  const viewStart = options.viewStart ?? 0, viewEnd = options.viewEnd ?? options.length;
  const groups = new Map();
  items.forEach((item, itemIndex) => {
    const key = item.layoutGroup ?? itemIndex;
    if (!groups.has(key)) groups.set(key, { members: [], ranges: [], connected: false, start: Infinity, end: -Infinity });
    const group = groups.get(key);
    const parts = makeLinearIntervalCopies([{ ...item, displayParts: undefined }], { length: options.length });
    group.ranges.push(...parts);
    group.connected ||= item.connectParts === true;
    for (const part of parts) {
      group.start = Math.min(group.start, part.start);
      group.end = Math.max(group.end, part.end);
    }
    group.members.push({ item, itemIndex });
  });
  const visible = [...groups.values()].filter(group => (group.connected ? group.start < viewEnd && group.end > viewStart : group.ranges.some(part => part.start < viewEnd && part.end > viewStart)) && (!options.visibleItemIndices || group.members.some(({itemIndex}) => options.visibleItemIndices.has(itemIndex))));
  const envelopes = visible.map((group, itemIndex) => ({ ...group, itemIndex,
    item: { start: group.start + 1, end: group.end } }));
  const packed = options.expanded
    ? createExpandedIntervalLayout(envelopes.map(entry => entry.item), { length: options.length, maxSlots: options.maxSlots })
    : assignIntervalSlots(envelopes, { maxSlots: options.maxSlots || 3, minGap: options.minGap || 0 });
  const selected = envelopes.findIndex(group => group.members.some(({item,itemIndex}) =>
    options.selectedFeatureId ? item.featureId === options.selectedFeatureId : itemIndex === options.selectedItemIndex));
  if (selected >= 0 && packed.hidden.some(entry => entry.itemIndex === selected)) {
    const entry = envelopes[selected], slot = packed.slotCount - 1;
    const displaced = packed.placements.filter(other => other.slot === slot && entry.start < other.end && other.start < entry.end);
    packed.placements = packed.placements.filter(other => !displaced.includes(other));
    packed.placements.push({ ...entry, slot });
    packed.hidden = [...packed.hidden.filter(other => other.itemIndex !== selected), ...displaced];
  }
  const slotByItem = new Map();
  for (const placement of packed.placements) {
    for (const {item} of visible[placement.itemIndex].members) slotByItem.set(item, placement.slot);
  }
  const copies = makeLinearIntervalCopies(items, { length: options.length, viewStart, viewEnd });
  const placements = [], hidden = [];
  for (const copy of copies) {
    if (slotByItem.has(copy.item)) placements.push({ ...copy, slot: slotByItem.get(copy.item) });
    else hidden.push(copy);
  }
  // Intron-only windows still need an overflow disclosure for hidden models.
  const hiddenItemIndices = new Set(hidden.map(copy => copy.itemIndex));
  for (const entry of packed.hidden) {
    const group = visible[entry.itemIndex];
    if (group.connected && !group.members.some(member => hiddenItemIndices.has(member.itemIndex))) {
      const member = group.members.find(({item}) => item.connectParts);
      hidden.push({ ...member, start: Math.max(group.start, viewStart), end: Math.min(group.end, viewEnd), connectorOnly: true });
    }
  }
  return { placements, hidden, slotByItem, slotCount: packed.slotCount, maxSlots: packed.maxSlots };
}

// Renderer-only lane assignments, including a transcript with no visible UTRs.
export function itemsWithLayoutSlots(items, layout) {
  if (!layout?.slotByItem) return items;
  return items.filter(item => layout.slotByItem.has(item)).map(item => ({ ...item, layoutSourceItem: item, slot: layout.slotByItem.get(item) }));
}

export function createStackedIntervalLayout(items = [], options = {}) {
  if (items.some(item => item.layoutGroup)) return layoutFeatureModels(items, options);
  const length = Number(options.length);
  return assignIntervalSlots(makeLinearIntervalCopies(items, {
    length,
    viewStart: 0,
    viewEnd: length
  }), {
    maxSlots: options.maxSlots,
    minGap: Math.max(0, Number(options.minGapUnits) || 0),
    fixedSlotsByType: options.fixedSlotsByType ?? options.slotByType,
    allowFixedSlotOverlaps: options.allowFixedSlotOverlaps
  });
}

// Expanded tracks pack the full record up to the caller's display limit. Keep compound and
// origin-spanning features together, so every part retains its lane on pan/zoom.
// A heap avoids scanning every occupied lane for deeply overlapping inputs.
export function createExpandedIntervalLayout(items = [], options = {}) {
  if (items.some(item => item.layoutGroup)) return layoutFeatureModels(items, { ...options, expanded: true });
  const copies = makeLinearIntervalCopies(items, { length: options.length });
  const groups = new Map();
  for (const copy of copies) {
    let group = groups.get(copy.itemIndex);
    if (!group) {
      group = { ...copy, copies: [] };
      groups.set(copy.itemIndex, group);
    }
    group.start = Math.min(group.start, copy.start);
    group.end = Math.max(group.end, copy.end);
    group.copies.push(copy);
  }
  const sorted = [...groups.values()].sort((a, b) => a.start - b.start || a.end - b.end || a.itemIndex - b.itemIndex);
  const fixedEnds = new Map();
  let nextSlot = 0;
  for (const group of sorted) {
    const fixed = fixedSlotForInterval(group, options);
    if (fixed !== null) nextSlot = Math.max(nextSlot, fixed + 1);
  }
  const heap = [];
  function push(lane) {
    let index = heap.length;
    heap.push(lane);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent].end <= lane.end) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = lane;
  }
  function pop() {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].end < heap[child].end) child++;
        if (last.end <= heap[child].end) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return first;
  }
  const placements = [];
  for (const group of sorted) {
    const fixed = fixedSlotForInterval(group, options);
    let slot;
    if (fixed !== null && (options.allowFixedSlotOverlaps || group.start >= (fixedEnds.get(fixed) ?? -Infinity))) {
      slot = fixed;
      fixedEnds.set(fixed, Math.max(fixedEnds.get(fixed) ?? -Infinity, group.end));
    } else {
      slot = heap.length && heap[0].end <= group.start ? pop().slot : nextSlot++;
      push({ slot, end: group.end });
    }
    for (const copy of group.copies) placements.push({ ...copy, slot, fixedSlot: slot === fixed });
  }
  const maxSlots = Number.isFinite(options.maxSlots) ? Math.max(1, Math.trunc(options.maxSlots)) : Infinity;
  // Promote a selected overflow feature as a whole lane, preserving every part
  // and intentional overlap. Searching never requires raising the display cap.
  const selected = placements.find(placement => options.selectedFeatureId
    ? placement.item.featureId === options.selectedFeatureId
    : placement.itemIndex === options.selectedItemIndex);
  if (selected?.slot >= maxSlots) {
    const selectedSlot = selected.slot;
    for (const placement of placements) {
      if (placement.slot === selectedSlot) placement.slot = maxSlots - 1;
      else if (placement.slot === maxSlots - 1) placement.slot = selectedSlot;
    }
  }
  return {
    placements: placements.filter(placement => placement.slot < maxSlots),
    hidden: placements.filter(placement => placement.slot >= maxSlots),
    slotCount: Math.max(1, Math.min(nextSlot, maxSlots)), maxSlots
  };
}

export function clipStackedIntervalLayout(fullLengthLayout, options = {}) {
  const viewStart = Number(options.viewStart ?? 0);
  const viewEnd = Number(options.viewEnd ?? 0);
  const visiblePlacements = [];
  const visibleHidden = [];
  for (const placement of fullLengthLayout.placements) {
    const start = Math.max(placement.start, viewStart);
    const end = Math.min(placement.end, viewEnd);
    if (end > start) {
      visiblePlacements.push({ ...placement, start, end });
    }
  }
  for (const hidden of fullLengthLayout.hidden) {
    const start = Math.max(hidden.start, viewStart);
    const end = Math.min(hidden.end, viewEnd);
    if (end > start) {
      visibleHidden.push({ ...hidden, start, end });
    }
  }
  return {
    ...fullLengthLayout,
    placements: visiblePlacements,
    hidden: visibleHidden,
    totalHidden: fullLengthLayout.hidden.length
  };
}

export function layoutStackedIntervals(items = [], options = {}) {
  return clipStackedIntervalLayout(createStackedIntervalLayout(items, options), options);
}

// Reserve ordinary annotation lanes independently of the current viewport.
// Semantic lanes (frames, transcripts, primer roles and aligned reads) retain
// their existing capacity rather than being reduced to three annotation rows.
export function hasSemanticLinearSlots(track) {
  const byType = track.fixedSlotsByType ?? track.slotByType;
  return Boolean((byType && typeof byType === "object" && Object.values(byType).some(value => normalizeSlot(value) !== null)) ||
    track.items?.some(item => [item.slot, item.slotIndex, item.fixedSlot].some(value => normalizeSlot(value) !== null) || item.alignedReadBases));
}

export function reservedLinearSlots(track) {
  if (!isStackedIntervalTrack(track)) return 0;
  const explicit = Math.trunc(Number(track.reservedSlots) || 0);
  if (explicit > 0) return Math.min(16, explicit);
  if (hasSemanticLinearSlots(track)) {
    // Use the full record, including semantic lanes absent from this window.
    const slots = (track.items ?? []).map(item => fixedSlotForInterval({ item }, track));
    if (slots.length && slots.every(slot => slot !== null)) return Math.min(16, slots.reduce((max, slot) => Math.max(max, slot), 0) + 1);
    return 16;
  }
  return Math.max(1, Math.min(3, track.items?.length || 1));
}

export function usesAutomaticLinearDensity(track) {
  return track.autoDensity === true || (track.autoDensity !== false && isStackedIntervalTrack(track) && !hasSemanticLinearSlots(track));
}

export function layoutVisibleIntervals(items = [], options = {}) {
  const intervals = makeLinearIntervalCopies(items, options);
  const minGap = Math.max(0, Number(options.minGapPixels) || 0) / Math.max(0.000001, options.pxPerBp || 1);
  const layout = assignIntervalSlots(intervals, {
    ...options,
    maxSlots: options.maxSlots || 16,
    minGap
  });
  if ((options.selectedFeatureId || Number.isInteger(options.selectedItemIndex)) && !options.fixedSlotsByType && !options.slotByType && !options.allowFixedSlotOverlaps) {
    const selected = layout.hidden.filter(({ item }) => (options.selectedFeatureId ? item.featureId === options.selectedFeatureId : items[options.selectedItemIndex] === item));
    if (selected.length && selected.every(interval => fixedSlotForInterval(interval, options) === null)) {
      const slot = layout.slotCount - 1;
      const displaced = layout.placements.filter(placement => placement.slot === slot && selected.some(interval =>
        interval.start < placement.end + minGap && placement.start < interval.end + minGap));
      layout.placements = layout.placements.filter(placement => !displaced.includes(placement));
      layout.placements.push(...selected.map(interval => ({ ...interval, slot })));
      layout.hidden = [...layout.hidden.filter(interval => !selected.includes(interval)), ...displaced];
    }
  }
  return layout;
}
