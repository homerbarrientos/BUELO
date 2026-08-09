import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

function authorized(code: string | null) {
  const expected = process.env.ADMIN_PASSWORD || process.env.ADMIN_ACCESS_CODE;
  return Boolean(code) && Boolean(expected) && code === expected;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("adminCode");
  if (!authorized(code)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = getServerSupabase();
  const [bookings, slots, events, refunds] = await Promise.all([
    s.from("bookings").select("id", { count: "exact", head: true }),
    s.from("booking_slots").select("id", { count: "exact", head: true }),
    s.from("booking_events").select("id", { count: "exact", head: true }),
    s.from("refunds").select("id", { count: "exact", head: true })
  ]);
  const { data: files } = await s.storage.from("payment-proofs").list("proofs", { limit: 1000 });
  return NextResponse.json({
    counts: {
      bookings: bookings.count || 0,
      slots: slots.count || 0,
      events: events.count || 0,
      refunds: refunds.count || 0,
      proofFiles: files?.length || 0
    }
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(body.adminCode || null)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const action = String(body.action || "");
  const confirmText = String(body.confirmText || "");
  const s = getServerSupabase();
  try {
    if (action === "clear_all_bookings") {
      if (confirmText !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
      await s.from("booking_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await s.from("refunds").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await s.from("booking_slots").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const { error } = await s.from("bookings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "clear_payment_proofs") {
      if (confirmText !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
      const { data: files, error: listError } = await s.storage.from("payment-proofs").list("proofs", { limit: 1000 });
      if (listError) throw listError;
      const paths = (files || []).map(f => `proofs/${f.name}`);
      if (paths.length) {
        const { error } = await s.storage.from("payment-proofs").remove(paths);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true, deleted: paths.length });
    }
    if (action === "clear_audit_trail") {
      if (confirmText !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
      const { error } = await s.from("booking_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "reset_demo_data") {
      if (confirmText !== "RESET") return NextResponse.json({ error: "Type RESET to confirm." }, { status: 400 });
      await s.from("booking_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await s.from("refunds").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await s.from("booking_slots").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const { error } = await s.from("bookings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Maintenance operation failed" }, { status: 500 });
  }
}
