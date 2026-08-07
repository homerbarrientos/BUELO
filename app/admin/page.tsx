"use client";

import { useEffect, useMemo, useState } from "react";

type Court = { id: string; name: string; hourly_rate: number; is_active: boolean };
type Slot = {
  id: string;
  booking_date: string;
  start_minute: number;
  end_minute: number;
  hourly_rate: number;
  status: string;
  courts?: { name?: string } | null;
};
type Booking = {
  id: string;
  booking_code: string;
  customer_name: string;
  customer_mobile: string;
  customer_email: string;
  total_hours: number;
  total_amount: number;
  payment_status: string;
  booking_status: string;
  proof_path?: string | null;
  created_at: string;
  booking_slots?: Slot[];
};

const formatTime = (minute: number) => {
  const h24 = Math.floor(minute / 60) % 24;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:00 ${suffix}`;
};

export default function AdminPage() {
  const [code, setCode] = useState("");
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const loadCourts = () => fetch("/api/admin/courts").then(r => r.json()).then(d => setCourts(d.courts || []));
  useEffect(() => { loadCourts(); }, []);

  async function loadBookings() {
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch(`/api/admin/bookings?adminCode=${encodeURIComponent(code)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Unable to load bookings");
      setBookings(d.bookings || []);
    } catch (e: any) {
      setMsg(e.message || "Unable to load bookings");
    } finally {
      setLoading(false);
    }
  }

  async function saveCourt(c: Court) {
    setMsg("");
    const r = await fetch("/api/admin/courts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminCode: code, courtId: c.id, hourlyRate: c.hourly_rate, isActive: c.is_active })
    });
    const d = await r.json();
    setMsg(r.ok ? `${c.name} updated.` : (d.error || "Update failed"));
  }

  async function updateBooking(bookingId: string, patch: { bookingStatus?: string; paymentStatus?: string }) {
    const r = await fetch("/api/admin/bookings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminCode: code, bookingId, ...patch })
    });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error || "Update failed");
    setMsg("Booking updated.");
    await loadBookings();
  }

  const stats = useMemo(() => ({
    total: bookings.length,
    pending: bookings.filter(b => b.booking_status === "pending").length,
    confirmed: bookings.filter(b => b.booking_status === "confirmed").length,
    paid: bookings.filter(b => b.payment_status === "paid").length,
    revenue: bookings.filter(b => b.payment_status === "paid").reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
  }), [bookings]);

  return (
    <main className="container">
      <section className="hero">
        <div className="logoBox">BUELO</div>
        <div>
          <span className="pill">ADMIN DASHBOARD</span>
          <h1>Booking Management</h1>
          <p>Review reservations, verify payments, confirm bookings, and change court rates.</p>
        </div>
      </section>

      <section className="card">
        <div className="grid grid-2">
          <div>
            <label>Admin access code</label>
            <input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Enter ADMIN_ACCESS_CODE" />
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button className="btn btn-primary" onClick={loadBookings} disabled={loading || !code}>
              {loading ? "Loading..." : "Open Dashboard"}
            </button>
          </div>
        </div>
      </section>

      {bookings.length > 0 && (
        <>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginTop: 16 }}>
            <section className="card"><div className="muted">Bookings</div><div className="price">{stats.total}</div></section>
            <section className="card"><div className="muted">Pending</div><div className="price">{stats.pending}</div></section>
            <section className="card"><div className="muted">Confirmed</div><div className="price">{stats.confirmed}</div></section>
            <section className="card"><div className="muted">Paid</div><div className="price">{stats.paid}</div></section>
            <section className="card"><div className="muted">Paid Revenue</div><div className="price">₱{stats.revenue.toLocaleString()}</div></section>
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="row space"><h2>Recent Bookings</h2><button className="btn btn-secondary" onClick={loadBookings}>Refresh</button></div>
            <div className="grid">
              {bookings.map(b => (
                <article key={b.id} style={{ border: "1px solid #285363", borderRadius: 14, padding: 16, background: "#09191f" }}>
                  <div className="row space">
                    <div>
                      <strong>{b.customer_name}</strong>
                      <div className="muted">{b.booking_code} · {b.customer_mobile} · {b.customer_email}</div>
                    </div>
                    <div style={{ textAlign: "right" }}><strong>₱{Number(b.total_amount).toLocaleString()}</strong><div className="muted">{b.total_hours} hour(s)</div></div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    {(b.booking_slots || []).map(s => (
                      <div key={s.id} className="muted" style={{ marginBottom: 4 }}>
                        {s.booking_date} · {s.courts?.name || "Court"} · {formatTime(s.start_minute)} - {formatTime(s.end_minute)}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-2" style={{ marginTop: 14 }}>
                    <div>
                      <label>Booking status</label>
                      <select value={b.booking_status} onChange={e => updateBooking(b.id, { bookingStatus: e.target.value })}>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                    <div>
                      <label>Payment status</label>
                      <select value={b.payment_status} onChange={e => updateBooking(b.id, { paymentStatus: e.target.value })}>
                        <option value="unpaid">Unpaid</option>
                        <option value="pending_verification">Pending Verification</option>
                        <option value="paid">Paid</option>
                        <option value="refunded">Refunded</option>
                      </select>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      <section style={{ marginTop: 24 }}>
        <div className="row space"><div><span className="pill">COURT SETTINGS</span><h2>Rates & Availability</h2></div></div>
        <div className="grid grid-2">
          {courts.map(c => (
            <section className="card" key={c.id}>
              <h2>{c.name}</h2>
              <label>Hourly rate (PHP)</label>
              <input type="number" value={c.hourly_rate} onChange={e => setCourts(p => p.map(x => x.id === c.id ? { ...x, hourly_rate: Number(e.target.value) } : x))} />
              <div className="row" style={{ marginTop: 14 }}>
                <label style={{ margin: 0 }}><input style={{ width: "auto" }} type="checkbox" checked={c.is_active} onChange={e => setCourts(p => p.map(x => x.id === c.id ? { ...x, is_active: e.target.checked } : x))} /> Active</label>
                <button className="btn btn-primary" onClick={() => saveCourt(c)}>Save</button>
              </div>
            </section>
          ))}
        </div>
      </section>

      {msg && <p className={msg.toLowerCase().includes("updated") ? "success" : "error"}>{msg}</p>}
    </main>
  );
}
