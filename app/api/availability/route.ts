import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  const courtId = req.nextUrl.searchParams.get("courtId");

  if (!date || !courtId) {
    return NextResponse.json({ error: "date and courtId are required" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("booking_slots")
    .select("start_minute")
    .eq("booking_date", date)
    .eq("court_id", courtId)
    .eq("status", "confirmed");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    unavailableStartMinutes: (data || []).map(x => x.start_minute)
  });
}
