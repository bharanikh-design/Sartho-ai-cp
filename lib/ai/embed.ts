

export async function embedText(text: string): Promise<number[]> {
  const provider = (process.env.AI_PROVIDER || "openai").trim().toLowerCase();

  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured in the environment.");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] },
        // Native output is 768. We will zero-pad to 1536 so it matches our pgvector schema.
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini Embedding failed: ${response.status} - ${errorText}`);
    }

    const json = await response.json();
    if (!json.embedding?.values) {
      throw new Error("Invalid embedding response format from Gemini.");
    }
    
    const vec = json.embedding.values as number[];
    // Zero-pad to 1536 dimensions so we don't have to rebuild the vector database
    while (vec.length < 1536) vec.push(0);
    return vec;
  }

  // Fallback to OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured in the environment. Set AI_PROVIDER=gemini to use Google.");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 1536,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Embedding failed: ${response.status} - ${errorText}`);
  }

  const json = await response.json();
  if (!json.data || !json.data[0] || !json.data[0].embedding) {
    throw new Error("Invalid embedding response format from OpenAI.");
  }

  return json.data[0].embedding;
}
