import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

function authorized(code: string | null) {
  const expected = process.env.ADMIN_PASSWORD || process.env.ADMIN_ACCESS_CODE;
  return Boolean(code) && Boolean(expected) && code === expected;
}

async function deleteAllRows(s: ReturnType<typeof getServerSupabase>, table: string) {
  // Supabase requires a filter for DELETE. All primary keys are non-null, so this targets every row.
  const { error } = await s.from(table).delete().not("id", "is", null);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function clearBookingData(s: ReturnType<typeof getServerSupabase>) {
  // Delete children before parents to respect foreign-key constraints.
  await deleteAllRows(s, "booking_events");
  await deleteAllRows(s, "refunds");
  await deleteAllRows(s, "booking_slots");
  await deleteAllRows(s, "bookings");
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

  const countError = bookings.error || slots.error || events.error || refunds.error;
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  const { data: files, error: storageError } = await s.storage.from("payment-proofs").list("proofs", { limit: 1000 });
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });

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
  const confirmText = String(body.confirmText || "").trim().toUpperCase();
  const s = getServerSupabase();

  try {
    if (action === "clear_all_bookings") {
      if (confirmText !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
      await clearBookingData(s);
      return NextResponse.json({ ok: true, message: "All booking data was deleted." });
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
      return NextResponse.json({ ok: true, deleted: paths.length, message: `${paths.length} payment proof file(s) deleted.` });
    }

    if (action === "clear_audit_trail") {
      if (confirmText !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
      await deleteAllRows(s, "booking_events");
      return NextResponse.json({ ok: true, message: "Audit trail deleted." });
    }

    if (action === "reset_demo_data") {
      if (confirmText !== "RESET") return NextResponse.json({ error: "Type RESET to confirm." }, { status: 400 });
      await clearBookingData(s);

      const { data: files, error: listError } = await s.storage.from("payment-proofs").list("proofs", { limit: 1000 });
      if (listError) throw listError;
      const paths = (files || []).map(f => `proofs/${f.name}`);
      if (paths.length) {
        const { error } = await s.storage.from("payment-proofs").remove(paths);
        if (error) throw error;
      }

      return NextResponse.json({ ok: true, message: "Test data and payment proofs were reset." });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Maintenance operation failed" }, { status: 500 });
  }
}
