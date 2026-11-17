export const USER_ACTIVITY_INTERVAL_MS = 60_000;

// Record real interaction only: an idle/background tab must not keep a user active.
// Leading-edge throttling bounds the timestamp's delay to one minute without
// sending a delayed request after the user has stopped interacting.
export function trackUserActivity({ recordActivity, target = document, now = Date.now }) {
  let lastAttempt = -Infinity;
  let pending = false;
  let stopped = false;
  const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'visibilitychange'];
  const options = { passive: true, capture: true };

  async function record() {
    if (stopped || pending || target.visibilityState !== 'visible') return;
    const timestamp = now();
    if (timestamp - lastAttempt < USER_ACTIVITY_INTERVAL_MS) return;

    lastAttempt = timestamp;
    pending = true;
    try {
      await recordActivity();
    } catch (error) {
      // Activity delivery must never interrupt authentication or other UI actions.
      console.warn('[userActivity] Could not record activity', error);
    } finally {
      pending = false;
    }
  }

  events.forEach((event) => target.addEventListener(event, record, options));
  void record();

  return () => {
    stopped = true;
    events.forEach((event) => target.removeEventListener(event, record, options));
  };
}
