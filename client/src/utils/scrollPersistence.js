/**
 * Debounced localStorage scroll-position persister for scrollable quiz panes.
 * Avoids synchronous getItem/JSON.parse/stringify/setItem on every wheel/touch frame,
 * while guaranteeing an explicit flush on modal close or unmount.
 */

export function createDebouncedScrollSaver({
  delayMs = 350,
  getStorage = () => (typeof localStorage !== 'undefined' ? localStorage : null),
} = {}) {
  let pendingKey = null;
  let pendingTop = 0;
  let timerId = null;

  const writeNow = (key, scrollTop) => {
    if (!key || !(scrollTop > 0)) return false;
    try {
      const storage = getStorage();
      if (!storage) return false;
      const existing = storage.getItem(key);
      const parsed = existing ? JSON.parse(existing) : {};
      parsed.savedQuizScroll = scrollTop;
      storage.setItem(key, JSON.stringify(parsed));
      return true;
    } catch (e) {
      return false;
    }
  };

  const flush = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (!pendingKey) return false;
    const key = pendingKey;
    const top = pendingTop;
    pendingKey = null;
    pendingTop = 0;
    return writeNow(key, top);
  };

  const schedule = (key, scrollTop) => {
    if (!key || !(scrollTop > 0)) return;
    if (pendingKey && pendingKey !== key) {
      flush();
    }
    pendingKey = key;
    pendingTop = scrollTop;
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(flush, delayMs);
  };

  const cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    pendingKey = null;
    pendingTop = 0;
  };

  return { schedule, flush, cancel };
}
