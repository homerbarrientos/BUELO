import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

function authorized(code: string | null) {
  const expected = process.env.ADMIN_PASSWORD || process.env.ADMIN_ACCESS_CODE;
  return Boolean(code) && Boolean(expected) && code === expected;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("adminCode");
  if (!authorized(code)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id,
      booking_code,
      customer_name,
      customer_mobile,
      customer_email,
      total_hours,
      total_amount,
      payment_status,
      booking_status,
      proof_path,
      created_at,
      booking_slots (
        id,
        booking_date,
        start_minute,
        end_minute,
        hourly_rate,
        status,
        courts ( name )
      )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bookings = await Promise.all((data || []).map(async (booking) => {
    let proof_url: string | null = null;
    if (booking.proof_path) {
      const { data: signed } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(booking.proof_path, 60 * 60);
      proof_url = signed?.signedUrl || null;
    }
    return { ...booking, proof_url };
  }));

  return NextResponse.json({ bookings });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (!authorized(body.adminCode || null)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bookingStatus = body.bookingStatus as string | undefined;
  const paymentStatus = body.paymentStatus as string | undefined;
  const allowedBooking = ["pending", "confirmed", "cancelled", "completed"];
  const allowedPayment = ["unpaid", "pending_verification", "paid", "refunded"];

  if (bookingStatus && !allowedBooking.includes(bookingStatus)) {
    return NextResponse.json({ error: "Invalid booking status" }, { status: 400 });
  }
  if (paymentStatus && !allowedPayment.includes(paymentStatus)) {
    return NextResponse.json({ error: "Invalid payment status" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  const { data: current, error: currentError } = await supabase
    .from("bookings")
    .select("id, booking_status, payment_status")
    .eq("id", body.bookingId)
    .single();

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });

  const nextBookingStatus = bookingStatus || current.booking_status;
  const nextPaymentStatus = paymentStatus || current.payment_status;

  const updates: Record<string, string> = {};
  if (bookingStatus) updates.booking_status = bookingStatus;
  if (paymentStatus) updates.payment_status = paymentStatus;
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await supabase
    .from("bookings")
    .update(updates)
    .eq("id", body.bookingId)
    .select("id, booking_status, payment_status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let slotStatus = "pending";
  if (nextBookingStatus === "cancelled") slotStatus = "cancelled";
  else if (nextBookingStatus === "completed") slotStatus = "completed";
  else if (nextBookingStatus === "confirmed" && nextPaymentStatus === "paid") slotStatus = "confirmed";

  const { error: slotError } = await supabase
    .from("booking_slots")
    .update({ status: slotStatus })
    .eq("booking_id", body.bookingId);

  if (slotError) {
    const conflict = slotError.code === "23505";
    return NextResponse.json({
      error: conflict
        ? "This court/time slot is already booked by another confirmed and paid reservation."
        : slotError.message
    }, { status: conflict ? 409 : 500 });
  }

  return NextResponse.json({ booking: data });
}
