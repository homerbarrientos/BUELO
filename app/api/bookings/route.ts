import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase-server";

const namePattern = /^[\p{L}][\p{L}\p{M} .'-]{1,79}$/u;
const phMobilePattern = /^(?:\+63|63|0)9\d{9}$/;

const schema = z.object({
  customer: z.object({
    name: z.string().trim().min(2, "Full name is required.").max(80).regex(namePattern, "Please enter a valid full name."),
    mobile: z.string().trim().transform(v => v.replace(/[\s()-]/g, "")).refine(v => phMobilePattern.test(v), "Enter a valid Philippine mobile number, e.g. 09171234567 or +639171234567."),
    email: z.string().trim().max(120).optional().default("")
  }),
  proofPath: z.string().min(1, "Proof of payment attachment is required."),
  schedules: z.array(z.object({
    date: z.string().min(8),
    courtId: z.string().uuid(),
    startMinutes: z.array(z.number().int().min(0).max(1439)).min(1)
  })).min(1)
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
  }

  const { customer, proofPath, schedules } = parsed.data;
  const supabase = getServerSupabase();
  const ids = [...new Set(schedules.map(x => x.courtId))];
  const { data: courts, error: courtError } = await supabase.from("courts").select("id,name,hourly_rate").in("id", ids);
  if (courtError) return NextResponse.json({ error: courtError.message }, { status: 500 });

  const courtMap = new Map((courts || []).map(c => [c.id, c]));
  let totalAmount = 0;
  const slots: any[] = [];

  for (const schedule of schedules) {
    const court = courtMap.get(schedule.courtId);
    if (!court) return NextResponse.json({ error: "Invalid court" }, { status: 400 });
    for (const startMinute of schedule.startMinutes) {
      totalAmount += Number(court.hourly_rate);
      slots.push({
        court_id: schedule.courtId,
        booking_date: schedule.date,
        start_minute: startMinute,
        end_minute: (startMinute + 60) % 1440,
        hourly_rate: Number(court.hourly_rate),
        status: "pending"
      });
    }
  }

  const bookingCode = `BUELO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const { data: booking, error: bookingError } = await supabase.from("bookings").insert({
    booking_code: bookingCode,
    customer_name: customer.name,
    customer_mobile: customer.mobile,
    customer_email: customer.email || "",
    proof_path: proofPath,
    total_hours: slots.length,
    total_amount: totalAmount,
    payment_status: "pending_verification",
    booking_status: "pending"
  }).select("id").single();

  if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 });

  const { error: slotError } = await supabase.from("booking_slots").insert(slots.map(x => ({ ...x, booking_id: booking.id })));
  if (slotError) {
    await supabase.from("bookings").delete().eq("id", booking.id);
    const conflict = slotError.code === "23505";
    return NextResponse.json({
      error: conflict ? "One of the selected time slots was just booked by someone else. Please refresh and choose another slot." : slotError.message
    }, { status: conflict ? 409 : 500 });
  }

  return NextResponse.json({ bookingCode, totalAmount });
}
