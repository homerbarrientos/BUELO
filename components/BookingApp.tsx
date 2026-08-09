"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { TIME_SLOTS } from "@/lib/time-slots";

type Court = { id: string; name: string; hourly_rate: number; is_active: boolean };
type Schedule = { id: string; date: string; courtId: string; selected: number[]; unavailable: number[] };

const MAYA_QR_PAYLOAD = "00020101021127780012com.p2pqrpay0111PAPHPHM1XXX02089996440304126396700177220515+63-967-00177225204601653036085802PH5920DEBIE MAE ANDAG UNOS6013Cotabato City63043909";
const uid = () => Math.random().toString(36).slice(2);
const emptySchedule = (): Schedule => ({ id: uid(), date: "", courtId: "", selected: [], unavailable: [] });

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function validName(value: string) {
  return /^[\p{L}][\p{L}\p{M} .'-]{1,79}$/u.test(value.trim());
}

function normalizeMobile(value: string) {
  return value.replace(/[\s()-]/g, "");
}

function validPhilippineMobile(value: string) {
  return /^(?:\+63|63|0)9\d{9}$/.test(normalizeMobile(value));
}

export default function BookingApp() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([emptySchedule()]);
  const [customer, setCustomer] = useState({ name: "", mobile: "", email: "" });
  const [proof, setProof] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [repeatCount, setRepeatCount] = useState(4);

  useEffect(() => {
    fetch("/api/admin/courts")
      .then(r => r.json())
      .then(d => setCourts(d.courts || []));
  }, []);

  const patch = (id: string, p: Partial<Schedule>) =>
    setSchedules(prev => prev.map(s => (s.id === id ? { ...s, ...p } : s)));

  const availability = async (s: Schedule) => {
    if (!s.date || !s.courtId) return;
    const r = await fetch(`/api/availability?date=${encodeURIComponent(s.date)}&courtId=${encodeURIComponent(s.courtId)}`);
    const d = await r.json();
    setSchedules(prev =>
      prev.map(x =>
        x.id === s.id
          ? {
              ...x,
              unavailable: d.unavailableStartMinutes || [],
              selected: x.selected.filter(v => !(d.unavailableStartMinutes || []).includes(v))
            }
          : x
      )
    );
  };

  const total = useMemo(
    () =>
      schedules.reduce((sum, s) => {
        const c = courts.find(x => x.id === s.courtId);
        return sum + (c ? c.hourly_rate * s.selected.length : 0);
      }, 0),
    [schedules, courts]
  );

  const totalHours = schedules.reduce((sum, s) => sum + s.selected.length, 0);

  async function copySchedule(source: Schedule) {
    if (schedules.length >= 30) return setMessage("Maximum of 30 schedule entries per booking.");
    const next: Schedule = {
      id: uid(),
      date: source.date ? addDays(source.date, 1) : "",
      courtId: source.courtId,
      selected: [...source.selected],
      unavailable: []
    };
    setSchedules(prev => [...prev, next]);
    if (next.date && next.courtId) setTimeout(() => availability(next), 0);
  }

  async function repeatWeekly(source: Schedule) {
    if (!source.date || !source.courtId || source.selected.length === 0) {
      return setMessage("Choose a date, court, and time slot first before creating weekly repeats.");
    }
    const count = Math.max(1, Math.min(12, repeatCount));
    if (schedules.length + count > 30) return setMessage("Weekly repeats would exceed the 30-schedule soft limit.");

    const additions: Schedule[] = Array.from({ length: count }, (_, i) => ({
      id: uid(),
      date: addDays(source.date, 7 * (i + 1)),
      courtId: source.courtId,
      selected: [...source.selected],
      unavailable: []
    }));

    setSchedules(prev => [...prev, ...additions]);
    for (const item of additions) await availability(item);
  }

  async function submit() {
    setMessage("");

    if (!validName(customer.name)) {
      return setMessage("Please enter a valid full name using letters, spaces, apostrophes, periods, or hyphens only.");
    }
    if (!validPhilippineMobile(customer.mobile)) {
      return setMessage("Please enter a valid Philippine mobile number, e.g. 09171234567 or +639171234567.");
    }
    if (!proof) {
      return setMessage("Please attach your proof of MAYA payment before submitting.");
    }
    if (proof.size > 5 * 1024 * 1024) {
      return setMessage("Proof of payment must be 5 MB or smaller.");
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(proof.type)) {
      return setMessage("Proof of payment must be a JPG, PNG, or WEBP image.");
    }
    if (schedules.some(s => !s.date || !s.courtId || s.selected.length === 0)) {
      return setMessage("Each schedule needs a date, court, and at least one time slot.");
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", proof);
      const uploadResponse = await fetch("/api/upload-proof", { method: "POST", body: fd });
      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadData.error || "Proof upload failed");

      const r = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: customer.name.trim(),
            mobile: normalizeMobile(customer.mobile),
            email: customer.email.trim()
          },
          proofPath: uploadData.path,
          schedules: schedules.map(s => ({ date: s.date, courtId: s.courtId, startMinutes: s.selected }))
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Booking failed");

      setMessage(`Booking submitted. Reference: ${d.bookingCode}. Total: ₱${d.totalAmount.toLocaleString()}. Payment is pending verification.`);
      setSchedules([emptySchedule()]);
      setProof(null);
      setCustomer({ name: "", mobile: "", email: "" });
    } catch (e: any) {
      setMessage(e.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid" style={{ paddingBottom: 60 }}>
      <section className="card">
        <span className="pill">CUSTOMER INFORMATION</span>
        <h2>Customer details</h2>
        <div className="grid grid-2">
          <div>
            <label>Full name *</label>
            <input
              value={customer.name}
              maxLength={80}
              autoComplete="name"
              placeholder="Juan Dela Cruz"
              onChange={e => setCustomer({ ...customer, name: e.target.value })}
              aria-invalid={customer.name.length > 0 && !validName(customer.name)}
            />
            {customer.name.length > 0 && !validName(customer.name) && <div className="field-error">Enter a valid full name.</div>}
          </div>
          <div>
            <label>Mobile number *</label>
            <input
              type="tel"
              value={customer.mobile}
              maxLength={16}
              autoComplete="tel"
              placeholder="09171234567"
              onChange={e => setCustomer({ ...customer, mobile: e.target.value })}
              aria-invalid={customer.mobile.length > 0 && !validPhilippineMobile(customer.mobile)}
            />
            <div className="field-help">Accepted: 09XXXXXXXXX, 639XXXXXXXXX, or +639XXXXXXXXX.</div>
            {customer.mobile.length > 0 && !validPhilippineMobile(customer.mobile) && <div className="field-error">Enter a valid Philippine mobile number.</div>}
          </div>
          <div>
            <label>Email address <span className="muted">(optional)</span></label>
            <input
              type="text"
              value={customer.email}
              maxLength={120}
              placeholder="Leave blank if not needed"
              onChange={e => setCustomer({ ...customer, email: e.target.value })}
            />
            <div className="field-help">Email is optional and may be left blank.</div>
          </div>
        </div>
      </section>

      <section className="card payment-card">
        <div className="row space" style={{ alignItems: "flex-start" }}>
          <div>
            <span className="pill">MAYA PAYMENT</span>
            <h2>Scan to Pay</h2>
            <p className="muted">Scan this QR using MAYA or a supported InstaPay banking app, then pay the exact booking total.</p>
            <div className="payment-name">DEBIE MAE UNOS</div>
            <div className="payment-phone">+63 *** *** 7722</div>
            <div className="payment-total">Amount to pay: <strong>₱{total.toLocaleString()}</strong></div>
          </div>
          <div className="qr-wrap" aria-label="MAYA InstaPay payment QR code">
            <QRCodeSVG value={MAYA_QR_PAYLOAD} size={250} level="M" bgColor="#ffffff" fgColor="#000000" includeMargin />
          </div>
        </div>
        <div className="payment-note">After payment, take a screenshot of the successful transaction and attach it below.</div>
        <div style={{ marginTop: 18 }}>
          <label>Proof of MAYA payment * <span className="muted">(JPG, PNG or WEBP · max 5 MB)</span></label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            onChange={e => setProof(e.target.files?.[0] || null)}
          />
          {proof && <div className="success" style={{ marginTop: 8 }}>✓ Attached: {proof.name}</div>}
        </div>
      </section>

      <section className="card">
        <div className="row space">
          <div>
            <span className="pill">MULTI-DATE BOOKING</span>
            <h2 style={{ marginBottom: 6 }}>Build your schedule</h2>
            <div className="muted">Add as many dates as needed. Soft limit: 30 schedule entries per booking.</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="muted">Schedules</div>
            <div className="price">{schedules.length}</div>
          </div>
        </div>
      </section>

      {schedules.map((s, i) => {
        const c = courts.find(x => x.id === s.courtId);
        return (
          <section className="card" key={s.id}>
            <div className="row space">
              <div>
                <span className="pill">SCHEDULE {i + 1}</span>
                <h2>Choose date, court & time</h2>
                <div className="muted">Operating day: 4:00 AM to 4:00 AM next day</div>
              </div>
              <div className="row">
                <button className="btn btn-secondary" onClick={() => copySchedule(s)}>Copy + Next Day</button>
                {schedules.length > 1 && (
                  <button className="btn btn-danger" onClick={() => setSchedules(p => p.filter(x => x.id !== s.id))}>Remove</button>
                )}
              </div>
            </div>

            <div className="grid grid-2" style={{ marginTop: 18 }}>
              <div>
                <label>Booking date</label>
                <input
                  type="date"
                  value={s.date}
                  onChange={async e => {
                    const n = { ...s, date: e.target.value };
                    patch(s.id, { date: e.target.value });
                    await availability(n);
                  }}
                />
              </div>
              <div>
                <label>Court</label>
                <select
                  value={s.courtId}
                  onChange={async e => {
                    const n = { ...s, courtId: e.target.value };
                    patch(s.id, { courtId: e.target.value });
                    await availability(n);
                  }}
                >
                  <option value="">Select court</option>
                  {courts.filter(x => x.is_active).map(x => (
                    <option key={x.id} value={x.id}>{x.name} — ₱{x.hourly_rate}/hr</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="schedule">
              <label>Available time slots</label>
              <div className="slot-grid">
                {TIME_SLOTS.map(slot => {
                  const unavailable = s.unavailable.includes(slot.startMinute);
                  const selected = s.selected.includes(slot.startMinute);
                  return (
                    <div
                      key={slot.startMinute}
                      className={`slot ${selected ? "selected" : ""} ${unavailable ? "unavailable" : ""}`}
                      onClick={() => {
                        if (unavailable) return;
                        patch(s.id, {
                          selected: selected ? s.selected.filter(x => x !== slot.startMinute) : [...s.selected, slot.startMinute]
                        });
                      }}
                    >
                      {slot.label}{unavailable ? " · BOOKED" : ""}
                    </div>
                  );
                })}
              </div>

              <div className="row space" style={{ marginTop: 14 }}>
                <span className="muted">{s.selected.length} hour(s) selected</span>
                <strong>{c ? `₱${(c.hourly_rate * s.selected.length).toLocaleString()}` : "₱0"}</strong>
              </div>

              <div className="card" style={{ marginTop: 14, padding: 14 }}>
                <div className="row space">
                  <div>
                    <strong>Weekly recurring booking</strong>
                    <div className="muted">Repeat this same court and time every 7 days.</div>
                  </div>
                  <div className="row">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={repeatCount}
                      onChange={e => setRepeatCount(Number(e.target.value) || 1)}
                      style={{ width: 90 }}
                      aria-label="Number of weekly repeats"
                    />
                    <button className="btn btn-secondary" onClick={() => repeatWeekly(s)}>Add Weekly Dates</button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <button
        className="btn btn-secondary"
        onClick={() => {
          if (schedules.length >= 30) return setMessage("Maximum of 30 schedule entries per booking.");
          setSchedules(p => [...p, emptySchedule()]);
        }}
      >
        + Add Another Date / Schedule
      </button>

      <section className="card">
        <div className="row space">
          <div>
            <div className="muted">Total booking</div>
            <div className="price">₱{total.toLocaleString()}</div>
            <div className="muted">{totalHours} total hour(s) · {schedules.length} schedule(s)</div>
          </div>
          <button className="btn btn-primary" disabled={submitting} onClick={submit}>
            {submitting ? "Submitting..." : "Submit booking"}
          </button>
        </div>
        {message && <p className={message.startsWith("Booking submitted") ? "success" : "error"}>{message}</p>}
      </section>
    </div>
  );
}
