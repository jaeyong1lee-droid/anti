/**
 * Batched table column width persistence & layout restoration manager.
 *
 * Coalesces bursts of restoration requests into a single animation frame, caches
 * parsed localStorage entries, skips already-fixed tables, and strictly separates
 * DOM reads from DOM writes to prevent forced synchronous reflow storms.
 */

const MIN_COL_WIDTH_PX = 84;
const COL0_MAX_PX = 90;
const REMAINING_COL_BUDGET_PX = 170;
const TABLE_SELECTOR = '.markdown-table-container table, .table-quiz-container table';

function formatCssWidth(widthValue) {
  if (typeof widthValue === 'number') return `${widthValue}px`;
  const str = String(widthValue);
  return (str.includes('px') || str.includes('%')) ? str : `${str}px`;
}

function applySavedWidths(table, allThs, config) {
  const widths = config?.widths || config;
  if (!Array.isArray(widths) || widths.length === 0) return;

  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    if (allThs[i] && w) {
      const widthVal = formatCssWidth(w);
      allThs[i].style.setProperty('width', widthVal, 'important');
      allThs[i].style.setProperty('min-width', widthVal, 'important');
      allThs[i].style.setProperty('max-width', widthVal, 'important');
    }
  }

  if (config?.tableWidth) {
    table.style.setProperty('width', config.tableWidth, 'important');
    table.style.setProperty('min-width', config.tableWidth, 'important');
  }
  table.classList.remove('table-auto');
  table.classList.add('table-fixed');
}

function applyAutoDistributedWidths(measurement) {
  const { table, allThs, containerWidth, naturalWidths } = measurement;
  const colCount = allThs.length;
  if (colCount === 0) return;

  const finalCol0Width = Math.min(naturalWidths[0], COL0_MAX_PX);
  allThs[0].style.setProperty('width', `${finalCol0Width}px`, 'important');
  allThs[0].style.setProperty('max-width', `${finalCol0Width}px`, 'important');
  allThs[0].style.setProperty('min-width', `${finalCol0Width}px`, 'important');

  const numRemCols = colCount - 1;
  if (numRemCols > 0) {
    const maxRemBudgetPx = numRemCols * REMAINING_COL_BUDGET_PX;
    const availableRemWidth = containerWidth - finalCol0Width;
    const targetRemTotalPx = Math.max(maxRemBudgetPx, availableRemWidth);
    let sumRemNaturalWidths = 0;
    for (let i = 1; i < colCount; i++) {
      sumRemNaturalWidths += naturalWidths[i];
    }

    for (let i = 1; i < colCount; i++) {
      let finalW = naturalWidths[i];
      if (sumRemNaturalWidths > targetRemTotalPx && sumRemNaturalWidths > 0) {
        finalW = (naturalWidths[i] / sumRemNaturalWidths) * targetRemTotalPx;
      }
      finalW = Math.max(MIN_COL_WIDTH_PX, finalW);
      allThs[i].style.setProperty('width', `${finalW}px`, 'important');
      allThs[i].style.setProperty('max-width', `${finalW}px`, 'important');
      allThs[i].style.setProperty('min-width', `${MIN_COL_WIDTH_PX}px`, 'important');
    }
  }

  table.classList.remove('table-auto');
  table.classList.add('table-fixed');
  table.style.setProperty('min-width', '100%', 'important');
  table.style.setProperty('max-width', 'none', 'important');
}

export function createTableColumnWidthManager({
  doc = typeof document !== 'undefined' ? document : null,
  getStorage = () => (typeof localStorage !== 'undefined' ? localStorage : null),
  scheduleFrame = typeof requestAnimationFrame !== 'undefined'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 0),
  cancelFrame = typeof cancelAnimationFrame !== 'undefined'
    ? (id) => cancelAnimationFrame(id)
    : (id) => clearTimeout(id),
} = {}) {
  const configCache = new Map();
  const pendingTargets = new Set();
  let versionSeq = 0;
  let pendingFrameId = 0;

  const getCachedEntry = (key) => {
    if (configCache.has(key)) {
      return configCache.get(key);
    }
    let parsedConfig = null;
    try {
      const storage = getStorage();
      const savedStr = storage?.getItem?.(key);
      if (savedStr) {
        const parsed = JSON.parse(savedStr);
        const widths = parsed?.widths || parsed;
        if (Array.isArray(widths) && widths.length > 0) {
          parsedConfig = parsed;
        }
      }
    } catch (e) {}

    const entry = { version: 0, config: parsedConfig };
    configCache.set(key, entry);
    return entry;
  };

  const saveTableColumnWidths = (table) => {
    if (!table) return;
    const key = table.getAttribute('data-table-key');
    if (!key) return;

    const ths = Array.from(table.querySelectorAll('th'));
    if (ths.length === 0) return;

    const widths = ths.map((th) => th.offsetWidth);
    const tableWidth = table.style.width || '100%';
    const config = { widths, tableWidth };
    const nextVersion = ++versionSeq;

    configCache.set(key, { version: nextVersion, config });
    if (table.dataset) {
      table.dataset.antiWidthKey = key;
      table.dataset.antiWidthVer = String(nextVersion);
    }

    try {
      const storage = getStorage();
      storage?.setItem?.(key, JSON.stringify(config));
    } catch (e) {}
  };

  const invalidateTableWidthMark = (table) => {
    if (!table?.dataset) return;
    delete table.dataset.antiWidthKey;
    delete table.dataset.antiWidthVer;
  };

  const collectUniqueTables = (targets) => {
    const tables = new Set();
    const scanTargets = (doc && targets.has(doc)) ? [doc] : Array.from(targets);

    for (const target of scanTargets) {
      if (!target?.querySelectorAll) continue;
      const found = target.querySelectorAll(TABLE_SELECTOR);
      for (const table of found) {
        tables.add(table);
      }
    }
    return Array.from(tables);
  };

  const flushRestoreQueue = () => {
    pendingFrameId = 0;
    if (pendingTargets.size === 0) return;

    const targets = new Set(pendingTargets);
    pendingTargets.clear();

    const tables = collectUniqueTables(targets);
    if (tables.length === 0) return;

    const savedJobs = [];
    const autoReadCandidates = [];

    for (const table of tables) {
      const key = table.getAttribute('data-table-key');
      if (key) {
        const entry = getCachedEntry(key);
        if (entry.config) {
          const alreadyApplied =
            table.classList.contains('table-fixed') &&
            table.dataset?.antiWidthKey === key &&
            table.dataset?.antiWidthVer === String(entry.version);
          if (!alreadyApplied) {
            const allThs = Array.from(table.querySelectorAll('th'));
            if (allThs.length > 0) {
              savedJobs.push({ table, allThs, key, entry });
            }
          }
          continue;
        }
      }

      if (table.classList.contains('table-fixed')) {
        continue;
      }

      const tableContainer = table.closest('.markdown-table-container') || table.parentElement;
      if (!tableContainer) continue;
      const allThs = Array.from(table.querySelectorAll('th'));
      if (allThs.length === 0) continue;

      autoReadCandidates.push({ table, tableContainer, allThs });
    }

    // Phase 1 (READ ONLY): measure all un-fixed tables before modifying any styles.
    const autoMeasurements = [];
    for (const candidate of autoReadCandidates) {
      const containerWidth = candidate.tableContainer.clientWidth;
      if (!containerWidth) continue;
      const naturalWidths = candidate.allThs.map((h) => h.offsetWidth);
      autoMeasurements.push({
        table: candidate.table,
        allThs: candidate.allThs,
        containerWidth,
        naturalWidths,
      });
    }

    // Phase 2 (WRITE ONLY): apply all saved configs and auto-distributed widths.
    for (const job of savedJobs) {
      applySavedWidths(job.table, job.allThs, job.entry.config);
      if (job.table.dataset) {
        job.table.dataset.antiWidthKey = job.key;
        job.table.dataset.antiWidthVer = String(job.entry.version);
      }
    }

    for (const measurement of autoMeasurements) {
      applyAutoDistributedWidths(measurement);
    }
  };

  const scheduleRestore = (container = doc) => {
    if (!container) return;
    if (doc && pendingTargets.has(doc)) return;
    if (container === doc) {
      pendingTargets.clear();
    }
    pendingTargets.add(container);

    if (!pendingFrameId) {
      pendingFrameId = scheduleFrame(flushRestoreQueue);
    }
  };

  const dispose = () => {
    if (pendingFrameId) {
      cancelFrame(pendingFrameId);
      pendingFrameId = 0;
    }
    pendingTargets.clear();
    configCache.clear();
  };

  return {
    saveTableColumnWidths,
    invalidateTableWidthMark,
    scheduleRestore,
    flushRestoreQueue,
    dispose,
  };
}
