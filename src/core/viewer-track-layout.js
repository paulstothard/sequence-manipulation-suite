export function isStackedIntervalTrack(track) {
  return track?.type === "features" || track?.layout === "stacked-intervals";
}

function normalizeSlot(value) {
  const slot = Number.parseInt(value, 10);
  return Number.isFinite(slot) && slot >= 0 ? slot : null;
}

function fixedSlotForInterval(interval, options = {}) {
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
    const rawParts = Array.isArray(item.parts) && item.parts.length > 0
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

export function createStackedIntervalLayout(items = [], options = {}) {
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
