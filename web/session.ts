/** Invalidates in-flight private reads when the displayed account changes. */
export function createSessionScope() {
  let version = 0;
  let owner: string | null = null;
  let networkReady = false;
  return {
    snapshot: () => ({version, owner, networkReady}),
    bind(user: string, verifiedOnline = true) {
      if (owner !== user || networkReady !== verifiedOnline) version++;
      owner = user;
      networkReady = verifiedOnline;
    },
    invalidate() { version++; owner = null; networkReady = false; },
    current(snapshot: {version: number}) { return snapshot.version === version; },
  };
}
export const sessionScope = createSessionScope();
