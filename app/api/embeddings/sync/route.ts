import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { embedText } from "@/lib/ai/embed";

export async function POST() {
  try {
    const { supabase, user } = await requireUser();

    // 1. Fetch all evidence items
    const { data: evidenceItems, error: evidenceError } = await supabase
      .from("evidence_items")
      .select("id, claim, context")
      .eq("user_id", user.id);

    if (evidenceError) throw evidenceError;
    if (!evidenceItems || evidenceItems.length === 0) {
      return NextResponse.json({ synced: 0, message: "No evidence items found." });
    }

    // 2. Fetch all existing embeddings to find the delta
    const { data: existingEmbeddings, error: embeddingsError } = await supabase
      .from("evidence_embeddings")
      .select("evidence_id")
      .eq("user_id", user.id);

    if (embeddingsError) throw embeddingsError;

    const existingIds = new Set(existingEmbeddings?.map((e) => e.evidence_id) || []);
    const pendingItems = evidenceItems.filter((item) => !existingIds.has(item.id));

    if (pendingItems.length === 0) {
      return NextResponse.json({ synced: 0, message: "All evidence is already embedded." });
    }

    let syncedCount = 0;

    // 3. Generate embeddings and insert
    // Note: Doing this sequentially for the prototype to respect rate limits.
    // In production, we'd batch the inputs to OpenAI.
    for (const item of pendingItems) {
      // Build a rich semantic string to embed
      const textToEmbed = `${item.claim}${item.context ? ` (Context: ${item.context})` : ""}`;
      
      const embedding = await embedText(textToEmbed);

      const { error: insertError } = await supabase
        .from("evidence_embeddings")
        .insert({
          user_id: user.id,
          evidence_id: item.id,
          content: textToEmbed,
          // vector type accepts stringified arrays: '[0.1, 0.2, ...]'
          embedding: `[${embedding.join(",")}]`
        });

      if (insertError) {
        console.error(`Failed to insert embedding for ${item.id}:`, insertError);
      } else {
        syncedCount++;
      }
    }

    return NextResponse.json({ 
      synced: syncedCount, 
      pending: pendingItems.length,
      message: `Successfully synchronized ${syncedCount} new career facts into the Semantic Graph.` 
    });

  } catch (error: unknown) {
    console.error("Vector Sync Error:", error);
    return NextResponse.json(
      { error: "Failed to synchronize embeddings.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
