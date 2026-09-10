import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "Developer in New York";
  
  const key = process.env.JSEARCH_RAPIDAPI_KEY?.trim() || process.env.RAPIDAPI_KEY?.trim();
  
  if (!key) {
    return NextResponse.json({ 
      error: "API Key not found in environment", 
      env_keys: Object.keys(process.env).filter(k => k.includes("API") || k.includes("JSEARCH")) 
    }, { status: 500 });
  }

  const searchParams = new URLSearchParams({
    query,
    page: "1",
    num_pages: "1"
  });

  try {
    const startedAt = Date.now();
    const response = await fetch(`https://jsearch.p.rapidapi.com/search-v2?${searchParams.toString()}`, {
      method: "GET",
      headers: {
        "x-rapidapi-key": key,
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
      },
    });
    
    const elapsed = Date.now() - startedAt;

    let body;
    try {
      body = await response.json();
    } catch (e) {
      body = { parse_error: "Failed to parse JSON", raw_text: await response.text() };
    }

    return NextResponse.json({
      status: response.status,
      ok: response.ok,
      elapsed_ms: elapsed,
      headers: Object.fromEntries(response.headers.entries()),
      body
    });
  } catch (error) {
    return NextResponse.json({ 
      error: "Fetch threw an exception", 
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
