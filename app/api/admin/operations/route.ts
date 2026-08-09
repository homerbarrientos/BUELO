import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

function authorized(code: string | null) {
  const expected = process.env.ADMIN_PASSWORD || process.env.ADMIN_ACCESS_CODE;
  return Boolean(code) && Boolean(expected) && code === expected;
}

async function addEvent(s: ReturnType<typeof getServerSupabase>, bookingId: string, eventType: string, details: Record<string, unknown> = {}) {
  await s.from("booking_events").insert({ booking_id: bookingId, event_type: eventType, details });
}

async function recalcBooking(s: ReturnType<typeof getServerSupabase>, bookingId: string) {
  const { data: slots, error } = await s.from("booking_slots").select("hourly_rate,status").eq("booking_id", bookingId);
  if (error) throw error;
  const active = (slots || []).filter(x => x.status !== "cancelled");
  const total = active.reduce((sum, x) => sum + Number(x.hourly_rate || 0), 0);
  await s.from("bookings").update({ total_hours: active.length, total_amount: total, updated_at: new Date().toISOString() }).eq("id", bookingId);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("adminCode");
  if (!authorized(code)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = getServerSupabase();

  const [{ data: bookings, error: be }, { data: refunds, error: re }, { data: events, error: ee }, { data: courts, error: ce }] = await Promise.all([
    s.from("bookings").select(`id,booking_code,customer_name,customer_mobile,customer_email,total_hours,total_amount,payment_status,booking_status,proof_path,admin_notes,created_at,updated_at,booking_slots(id,booking_date,start_minute,end_minute,hourly_rate,status,court_id,courts(id,name))`).order("created_at", { ascending: false }).limit(500),
    s.from("refunds").select("*").order("requested_at", { ascending: false }).limit(500),
    s.from("booking_events").select("*").order("created_at", { ascending: false }).limit(1000),
    s.from("courts").select("id,name,hourly_rate,is_active").order("name")
  ]);
  const firstError = be || re || ee || ce;
  if (firstError) return NextResponse.json({ error: firstError.message, setupRequired: true }, { status: 500 });

  const withProof = await Promise.all((bookings || []).map(async b => {
    let proof_url: string | null = null;
    if (b.proof_path) {
      const { data } = await s.storage.from("payment-proofs").createSignedUrl(b.proof_path, 3600);
      proof_url = data?.signedUrl || null;
    }
    return { ...b, proof_url };
  }));

  return NextResponse.json({ bookings: withProof, refunds: refunds || [], events: events || [], courts: courts || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(body.adminCode || null)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = getServerSupabase();
  const action = String(body.action || "");
  const bookingId = String(body.bookingId || "");
  if (!bookingId) return NextResponse.json({ error: "bookingId is required" }, { status: 400 });

  try {
    if (action === "verify_payment") {
      const { error } = await s.from("bookings").update({ payment_status: "verified", updated_at: new Date().toISOString() }).eq("id", bookingId);
      if (error) throw error;
      await addEvent(s, bookingId, "payment_verified");
    } else if (action === "reject_payment") {
      const reason = String(body.reason || "Payment proof rejected");
      const { error } = await s.from("bookings").update({ payment_status: "rejected", updated_at: new Date().toISOString() }).eq("id", bookingId);
      if (error) throw error;
      await addEvent(s, bookingId, "payment_rejected", { reason });
    } else if (action === "confirm_booking") {
      const { data: booking, error: findError } = await s.from("bookings").select("payment_status").eq("id", bookingId).single();
      if (findError) throw findError;
      if (!booking || !["verified", "paid"].includes(booking.payment_status)) return NextResponse.json({ error: "Verify payment before confirming this booking." }, { status: 400 });
      const { error: slotError } = await s.from("booking_slots").update({ status: "confirmed" }).eq("booking_id", bookingId).neq("status", "cancelled");
      if (slotError) throw slotError;
      const { error } = await s.from("bookings").update({ booking_status: "confirmed", payment_status: "paid", updated_at: new Date().toISOString() }).eq("id", bookingId);
      if (error) throw error;
      await addEvent(s, bookingId, "booking_confirmed");
    } else if (action === "cancel_booking") {
      const reason = String(body.reason || "Cancelled by admin");
      const { error: slotError } = await s.from("booking_slots").update({ status: "cancelled" }).eq("booking_id", bookingId);
      if (slotError) throw slotError;
      const { error } = await s.from("bookings").update({ booking_status: "cancelled", updated_at: new Date().toISOString() }).eq("id", bookingId);
      if (error) throw error;
      await addEvent(s, bookingId, "booking_cancelled", { reason });
    } else if (action === "save_note") {
      const note = String(body.note || "").slice(0, 3000);
      const { error } = await s.from("bookings").update({ admin_notes: note, updated_at: new Date().toISOString() }).eq("id", bookingId);
      if (error) throw error;
      await addEvent(s, bookingId, "admin_note_updated", { note });
    } else if (action === "request_refund") {
      const { data: booking, error: findError } = await s.from("bookings").select("total_amount").eq("id", bookingId).single();
      if (findError) throw findError;
      const amount = Number(body.amount ?? booking?.total_amount ?? 0);
      const reason = String(body.reason || "Customer refund request");
      const { error } = await s.from("refunds").upsert({ booking_id: bookingId, amount, reason, status: "requested", updated_at: new Date().toISOString() }, { onConflict: "booking_id" });
      if (error) throw error;
      await addEvent(s, bookingId, "refund_requested", { amount, reason });
    } else if (action === "approve_refund") {
      const { error } = await s.from("refunds").update({ status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      if (error) throw error;
      await addEvent(s, bookingId, "refund_approved");
    } else if (action === "complete_refund") {
      const { error: refundError } = await s.from("refunds").update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      if (refundError) throw refundError;
      await s.from("booking_slots").update({ status: "cancelled" }).eq("booking_id", bookingId);
      const { error } = await s.from("bookings").update({ payment_status: "refunded", booking_status: "cancelled", updated_at: new Date().toISOString() }).eq("id", bookingId);
      if (error) throw error;
      await addEvent(s, bookingId, "refund_completed");
    } else if (action === "reject_refund") {
      const reason = String(body.reason || "Refund rejected");
      const { error } = await s.from("refunds").update({ status: "rejected", notes: reason, updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      if (error) throw error;
      await addEvent(s, bookingId, "refund_rejected", { reason });
    } else if (action === "reschedule_slot") {
      const slotId = String(body.slotId || "");
      const bookingDate = String(body.bookingDate || "");
      const courtId = String(body.courtId || "");
      const startMinute = Number(body.startMinute);
      if (!slotId || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || !courtId || !Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) {
        return NextResponse.json({ error: "Invalid reschedule details" }, { status: 400 });
      }

      const { data: oldSlot, error: oldError } = await s.from("booking_slots")
        .select("id,booking_date,start_minute,end_minute,court_id,status,courts(name)")
        .eq("id", slotId).eq("booking_id", bookingId).single();
      if (oldError) throw oldError;
      if (!oldSlot || oldSlot.status === "cancelled") return NextResponse.json({ error: "Cancelled slots cannot be rescheduled." }, { status: 400 });

      const { data: court, error: courtError } = await s.from("courts").select("id,name,hourly_rate,is_active").eq("id", courtId).single();
      if (courtError) throw courtError;
      if (!court?.is_active) return NextResponse.json({ error: "Selected court is inactive." }, { status: 400 });

      const { data: conflictRows, error: conflictError } = await s.from("booking_slots")
        .select("id")
        .eq("booking_date", bookingDate)
        .eq("court_id", courtId)
        .eq("start_minute", startMinute)
        .eq("status", "confirmed")
        .neq("id", slotId)
        .limit(1);
      if (conflictError) throw conflictError;
      if ((conflictRows || []).length > 0) {
        return NextResponse.json({ error: "That court/time is already booked. Choose another date, court, or time." }, { status: 409 });
      }

      // A single UPDATE moves the confirmed slot. PostgreSQL removes the old unique-key
      // value and inserts the new one atomically: old schedule becomes free, new one locks.
      const { error: updateError } = await s.from("booking_slots").update({
        booking_date: bookingDate,
        court_id: courtId,
        start_minute: startMinute,
        end_minute: (startMinute + 60) % 1440,
        hourly_rate: Number(court.hourly_rate),
        status: "confirmed"
      }).eq("id", slotId).eq("booking_id", bookingId);
      if (updateError) {
        if (updateError.code === "23505") return NextResponse.json({ error: "That court/time was just booked by someone else. Please choose another slot." }, { status: 409 });
        throw updateError;
      }

      await recalcBooking(s, bookingId);
      await addEvent(s, bookingId, "slot_rescheduled", {
        from: oldSlot,
        to: { bookingDate, courtId, courtName: court.name, startMinute }
      });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Operation failed", setupRequired: /relation .* does not exist|column .* does not exist/i.test(error?.message || "") }, { status: 500 });
  }
}
