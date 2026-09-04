import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { GmailRecruiterAgent } from "@/lib/agents/gmail-agent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // 1. Authenticate the Cron Job or the Manual Trigger
    const { supabase, user } = await getAuthenticatedUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch the user's Sartho profile to ground the agent
    const workspace = await getCareerWorkspace(supabase, user.id);

    // 3. Retrieve the user's stored Google OAuth Token (with Gmail Scopes)
    // (In production, you'd fetch this from a 'user_integrations' table)
    const mockAccessToken = "ya29.a0AfB_by..."; 

    // 4. Initialize and run the Agent
    const agent = new GmailRecruiterAgent({
      accessToken: mockAccessToken,
      userProfile: workspace
    });

    const draftsCreated = await agent.processInbox();

    return NextResponse.json({ 
      success: true, 
      draftsCreated,
      message: \`Successfully scanned inbox and created \${draftsCreated} drafts.\`
    });

  } catch (error) {
    console.error("Gmail Agent Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
