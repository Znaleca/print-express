const MINUTE_MS = 60_000;
const BOUNDARY_GRACE_MS = 100;

export function millisecondsUntilNextMinute(now = Date.now()) {
  return MINUTE_MS - (now % MINUTE_MS) + BOUNDARY_GRACE_MS;
}

export function startMinuteAlignedRefresh(refresh) {
  let intervalId = null;
  const timeoutId = setTimeout(() => {
    void refresh();
    intervalId = setInterval(() => void refresh(), MINUTE_MS);
  }, millisecondsUntilNextMinute());

  return () => {
    clearTimeout(timeoutId);
    if (intervalId !== null) clearInterval(intervalId);
  };
}
