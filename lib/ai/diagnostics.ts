import { unstable_cache } from "next/cache";
import { probeProviders, type ProviderProbe } from "./provider";

export type ProviderHealthSnapshot = {
  checkedAt: string;
  providers: ProviderProbe[];
};

/*
 * One tiny active-provider request is shared across the diagnostics page and
 * API for five minutes. This is deliberately server-side: the authenticated
 * response itself is never cached in a browser or shared proxy.
 */
export const getCachedProviderHealth = unstable_cache(
  async (): Promise<ProviderHealthSnapshot> => ({
    checkedAt: new Date().toISOString(),
    providers: await probeProviders(),
  }),
  ["sartho-active-provider-health-v1"],
  { revalidate: 300 },
);
