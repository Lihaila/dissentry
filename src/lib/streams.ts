// Active model reply streams, kept in a leaf module so both engine and store can abort them.
const controllers = new Map<string, AbortController>();

export const isRunning = (postId: string) => controllers.has(postId);
export const trackStream = (postId: string, ctrl: AbortController) => { controllers.set(postId, ctrl); };
export const untrackStream = (postId: string) => { controllers.delete(postId); };
export const abortStream = (postId: string): boolean => {
  const ctrl = controllers.get(postId);
  if (!ctrl) return false;
  ctrl.abort();
  return true;
};
export const abortAllStreams = () => { controllers.forEach((c) => c.abort()); };
