/*
 * The shared advert cache, backed by Supabase.
 *
 * Reads go through the caller's own client, because the rows are readable by
 * anyone signed in and there is nothing here to scope to a person. Writes go
 * through the service role: a client that could write this table could poison
 * every user's results at once, which is a far worse trade than the
 * convenience of letting the browser fill it.
 *
 * Nothing in here throws at the caller. A cache is an optimisation, and an
 * optimisation that can take search down is a liability — every failure is
 * swallowed and reported as a miss, which puts the search back exactly where it
 * was before this existed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchCacheStore } from "@/lib/jobs/cached-serpapi";
import type { CacheRow } from "@/lib/jobs/search-cache";
import { createAdminClient } from "@/lib/supabase/admin";

const TABLE = "job_search_cache";

/*
 * Built once per search rather than per query.
 *
 * The service-role client is only created if a write actually happens, so a
 * deployment without the key reads the cache perfectly well and simply never
 * fills it — which is the sane half-working state rather than a hard failure.
 */
export function createSearchCacheStore(supabase: SupabaseClient): SearchCacheStore {
  let admin: SupabaseClient | null = null;
  let adminUnavailable = false;

  const writer = (): SupabaseClient | null => {
    if (admin) return admin;
    if (adminUnavailable) return null;
    try {
      admin = createAdminClient();
      return admin;
    } catch {
      /* No service-role key configured. Read-only is a fine way to run. */
      adminUnavailable = true;
      return null;
    }
  };

  return {
    async read(signature) {
      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select("signature,listings,collected_at,serpapi_search_id,submitted_at")
          .eq("signature", signature)
          .maybeSingle();
        if (error || !data) return null;
        return data as CacheRow;
      } catch {
        return null;
      }
    },

    async saveListings(signature, listings) {
      const client = writer();
      if (!client) return;
      try {
        await client.from(TABLE).upsert({
          signature,
          listings,
          collected_at: new Date().toISOString(),
          /* The ticket has been redeemed; leaving it would re-read it forever. */
          serpapi_search_id: null,
          submitted_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "signature" });
      } catch {
        /* An answer that could not be stored is still an answer. */
      }
    },

    async saveTicket(signature, searchId) {
      const client = writer();
      if (!client) return;
      try {
        await client.from(TABLE).upsert({
          signature,
          serpapi_search_id: searchId,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "signature" });
      } catch {
        /*
         * The search still runs at SerpApi and is still charged for; it just
         * cannot be collected later. Back to how it worked before the cache.
         */
      }
    },

    async clearTicket(signature) {
      const client = writer();
      if (!client) return;
      try {
        await client.from(TABLE).update({
          serpapi_search_id: null,
          submitted_at: null,
          updated_at: new Date().toISOString(),
        }).eq("signature", signature);
      } catch {
        /* A dead ticket left on file costs one wasted archive read. */
      }
    },
  };
}
