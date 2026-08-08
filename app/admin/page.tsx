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
  proof_url?: string | null;
  created_at: string;
  booking_slots?: Slot[];
};

type ScheduleRow = {
  bookingId: string;
  bookingCode: string;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  paymentStatus: string;
  bookingStatus: string;
  proofUrl?: string | null;
  slot: Slot;
};

const formatTime = (minute: number) => {
  const h24 = Math.floor(minute / 60) % 24;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:00 ${suffix}`;
};

const localISODate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const php = (value: number) => `₱${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function AdminPage() {
  const [code, setCode] = useState("");
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { setReportDate(localISODate()); }, []);

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

  const filteredBookings = useMemo(() => {
    if (!selectedDate) return bookings;
    return bookings.filter(b => (b.booking_slots || []).some(s => s.booking_date === selectedDate));
  }, [bookings, selectedDate]);

  const stats = useMemo(() => ({
    total: filteredBookings.length,
    pending: filteredBookings.filter(b => b.booking_status === "pending").length,
    confirmed: filteredBookings.filter(b => b.booking_status === "confirmed").length,
    paid: filteredBookings.filter(b => b.payment_status === "paid").length,
    revenue: filteredBookings.filter(b => b.payment_status === "paid").reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
  }), [filteredBookings]);

  const scheduleRows = useMemo<ScheduleRow[]>(() => {
    const rows: ScheduleRow[] = [];
    for (const booking of bookings) {
      for (const slot of booking.booking_slots || []) {
        if (slot.booking_date !== reportDate) continue;
        rows.push({
          bookingId: booking.id,
          bookingCode: booking.booking_code,
          customerName: booking.customer_name,
          customerMobile: booking.customer_mobile,
          customerEmail: booking.customer_email,
          paymentStatus: booking.payment_status,
          bookingStatus: booking.booking_status,
          proofUrl: booking.proof_url,
          slot
        });
      }
    }
    return rows.sort((a, b) => {
      const courtCompare = (a.slot.courts?.name || "").localeCompare(b.slot.courts?.name || "");
      if (courtCompare !== 0) return courtCompare;
      return a.slot.start_minute - b.slot.start_minute;
    });
  }, [bookings, reportDate]);

  const dailyReport = useMemo(() => {
    const paidRows = scheduleRows.filter(r => r.paymentStatus === "paid" && r.bookingStatus !== "cancelled");
    const confirmedRows = scheduleRows.filter(r => r.bookingStatus === "confirmed" && r.paymentStatus === "paid");
    const uniqueBookings = new Set(scheduleRows.map(r => r.bookingId)).size;
    const uniquePaidBookings = new Set(paidRows.map(r => r.bookingId)).size;
    const sales = paidRows.reduce((sum, r) => sum + Number(r.slot.hourly_rate || 0), 0);
    const bookedHours = confirmedRows.length;
    const activeCourts = Math.max(1, courts.filter(c => c.is_active).length);
    const availableHours = activeCourts * 24;
    const utilization = availableHours ? (bookedHours / availableHours) * 100 : 0;
    const pendingPayments = new Set(scheduleRows.filter(r => r.paymentStatus === "pending_verification").map(r => r.bookingId)).size;
    return { sales, bookedHours, uniqueBookings, uniquePaidBookings, utilization, pendingPayments };
  }, [scheduleRows, courts]);

  const salesGrowth = useMemo(() => {
    const base = reportDate ? new Date(`${reportDate}T12:00:00`) : new Date();
    const result: { date: string; label: string; sales: number; hours: number }[] = [];
    for (let offset = 6; offset >= 0; offset--) {
      const date = new Date(base);
      date.setDate(base.getDate() - offset);
      const iso = localISODate(date);
      let sales = 0;
      let hours = 0;
      for (const booking of bookings) {
        if (booking.payment_status !== "paid" || booking.booking_status === "cancelled") continue;
        for (const slot of booking.booking_slots || []) {
          if (slot.booking_date === iso) {
            sales += Number(slot.hourly_rate || 0);
            hours += 1;
          }
        }
      }
      result.push({ date: iso, label: shortDate(iso), sales, hours });
    }
    return result;
  }, [bookings, reportDate]);

  const growthSummary = useMemo(() => {
    const current = salesGrowth[salesGrowth.length - 1]?.sales || 0;
    const previous = salesGrowth[salesGrowth.length - 2]?.sales || 0;
    const percent = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100;
    const weekTotal = salesGrowth.reduce((sum, d) => sum + d.sales, 0);
    const weekHours = salesGrowth.reduce((sum, d) => sum + d.hours, 0);
    return { current, previous, percent, weekTotal, weekHours };
  }, [salesGrowth]);

  const maxGrowthSales = Math.max(1, ...salesGrowth.map(d => d.sales));

  function exportDailyCSV() {
    const rows = [
      ["Booking Date", "Court", "Time", "Booking Reference", "Customer", "Mobile", "Email", "Booking Status", "Payment Status", "Rate"],
      ...scheduleRows.map(r => [
        r.slot.booking_date,
        r.slot.courts?.name || "Court",
        `${formatTime(r.slot.start_minute)} - ${formatTime(r.slot.end_minute)}`,
        r.bookingCode,
        r.customerName,
        r.customerMobile,
        r.customerEmail,
        r.bookingStatus,
        r.paymentStatus,
        Number(r.slot.hourly_rate || 0).toFixed(2)
      ])
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buelo-booking-report-${reportDate || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="container">
      <section className="hero">
        <div className="logoBox">BUELO</div>
        <div>
          <span className="pill">ADMIN DASHBOARD</span>
          <h1>Booking & Sales Dashboard</h1>
          <p>Monitor sales, booking schedules, payment verification, court utilization, reservations, and court rates.</p>
        </div>
      </section>

      <section className="card">
        <div className="grid grid-2">
          <div>
            <label>Admin password</label>
            <input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Enter ADMIN_PASSWORD" />
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
          <section className="card" style={{ marginTop: 16 }}>
            <div className="row space">
              <div>
                <span className="pill">DAILY OPERATIONS</span>
                <h2 style={{ marginBottom: 6 }}>Sales & Schedule Report</h2>
                <div className="muted">Select a date to review sales and every court schedule for that operating day.</div>
              </div>
              <button className="btn btn-secondary" onClick={exportDailyCSV}>Export CSV</button>
            </div>
            <div className="grid grid-2" style={{ marginTop: 16 }}>
              <div>
                <label>Report date</label>
                <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} />
              </div>
              <div style={{ display: "flex", alignItems: "end", gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setReportDate(localISODate())}>Today</button>
                <button className="btn btn-secondary" onClick={loadBookings}>Refresh Data</button>
              </div>
            </div>
          </section>

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", marginTop: 16 }}>
            <section className="card"><div className="muted">Sales for the Day</div><div className="price">{php(dailyReport.sales)}</div><div className="muted">Paid schedule slots</div></section>
            <section className="card"><div className="muted">Bookings Today</div><div className="price">{dailyReport.uniqueBookings}</div><div className="muted">Unique reservations</div></section>
            <section className="card"><div className="muted">Booked Hours</div><div className="price">{dailyReport.bookedHours}</div><div className="muted">Confirmed + paid</div></section>
            <section className="card"><div className="muted">Court Utilization</div><div className="price">{dailyReport.utilization.toFixed(1)}%</div><div className="muted">Across active courts</div></section>
            <section className="card"><div className="muted">Paid Bookings</div><div className="price">{dailyReport.uniquePaidBookings}</div><div className="muted">For selected date</div></section>
            <section className="card"><div className="muted">Payments to Verify</div><div className="price">{dailyReport.pendingPayments}</div><div className="muted">Pending verification</div></section>
          </div>

          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <section className="card">
              <div className="row space">
                <div><span className="pill">SALES GROWTH</span><h2>Last 7 Days</h2></div>
                <div style={{ textAlign: "right" }}>
                  <strong style={{ fontSize: 22 }}>{growthSummary.percent >= 0 ? "+" : ""}{growthSummary.percent.toFixed(1)}%</strong>
                  <div className="muted">vs previous day</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "end", gap: 10, height: 190, marginTop: 18, paddingBottom: 4 }}>
                {salesGrowth.map(day => (
                  <div key={day.date} style={{ flex: 1, minWidth: 0, textAlign: "center" }} title={`${day.date}: ${php(day.sales)}`}>
                    <div className="muted" style={{ fontSize: 11, marginBottom: 5 }}>{day.sales ? php(day.sales) : "₱0"}</div>
                    <div style={{ height: 125, display: "flex", alignItems: "end", justifyContent: "center" }}>
                      <div style={{ width: "70%", minHeight: 3, height: `${Math.max(3, (day.sales / maxGrowthSales) * 125)}px`, borderRadius: "8px 8px 3px 3px", background: "linear-gradient(180deg,#21d6c6,#4da7ff)" }} />
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 7 }}>{day.label}</div>
                  </div>
                ))}
              </div>
              <div className="row space" style={{ marginTop: 10, borderTop: "1px solid #285363", paddingTop: 12 }}>
                <span className="muted">7-day sales</span><strong>{php(growthSummary.weekTotal)}</strong>
                <span className="muted">Booked hours</span><strong>{growthSummary.weekHours}</strong>
              </div>
            </section>

            <section className="card">
              <span className="pill">BUSINESS SNAPSHOT</span>
              <h2>Management Summary</h2>
              <div className="grid" style={{ gap: 10 }}>
                <div className="row space" style={{ borderBottom: "1px solid #285363", paddingBottom: 10 }}><span className="muted">Total loaded bookings</span><strong>{bookings.length}</strong></div>
                <div className="row space" style={{ borderBottom: "1px solid #285363", paddingBottom: 10 }}><span className="muted">Pending reservations</span><strong>{bookings.filter(b => b.booking_status === "pending").length}</strong></div>
                <div className="row space" style={{ borderBottom: "1px solid #285363", paddingBottom: 10 }}><span className="muted">Confirmed reservations</span><strong>{bookings.filter(b => b.booking_status === "confirmed").length}</strong></div>
                <div className="row space" style={{ borderBottom: "1px solid #285363", paddingBottom: 10 }}><span className="muted">Payments awaiting verification</span><strong>{bookings.filter(b => b.payment_status === "pending_verification").length}</strong></div>
                <div className="row space" style={{ borderBottom: "1px solid #285363", paddingBottom: 10 }}><span className="muted">All-time paid revenue loaded</span><strong>{php(bookings.filter(b => b.payment_status === "paid").reduce((sum, b) => sum + Number(b.total_amount || 0), 0))}</strong></div>
                <div className="row space"><span className="muted">Active courts</span><strong>{courts.filter(c => c.is_active).length}</strong></div>
              </div>
            </section>
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="row space">
              <div><span className="pill">BOOKING SCHEDULE</span><h2>{reportDate ? `Schedule for ${reportDate}` : "Daily Schedule"}</h2></div>
              <span className="pill">{scheduleRows.length} SLOT(S)</span>
            </div>
            {scheduleRows.length === 0 ? (
              <p className="muted">No booking schedule found for this date.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #285363" }}>
                      <th style={{ padding: 10 }}>Time</th>
                      <th style={{ padding: 10 }}>Court</th>
                      <th style={{ padding: 10 }}>Customer</th>
                      <th style={{ padding: 10 }}>Booking Ref</th>
                      <th style={{ padding: 10 }}>Booking</th>
                      <th style={{ padding: 10 }}>Payment</th>
                      <th style={{ padding: 10 }}>Rate</th>
                      <th style={{ padding: 10 }}>Proof</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.map(row => (
                      <tr key={`${row.bookingId}-${row.slot.id}`} style={{ borderBottom: "1px solid #173943" }}>
                        <td style={{ padding: 10, whiteSpace: "nowrap" }}>{formatTime(row.slot.start_minute)} - {formatTime(row.slot.end_minute)}</td>
                        <td style={{ padding: 10 }}>{row.slot.courts?.name || "Court"}</td>
                        <td style={{ padding: 10 }}><strong>{row.customerName}</strong><div className="muted" style={{ fontSize: 12 }}>{row.customerMobile}</div></td>
                        <td style={{ padding: 10 }}>{row.bookingCode}</td>
                        <td style={{ padding: 10 }}><span className="pill">{row.bookingStatus}</span></td>
                        <td style={{ padding: 10 }}><span className="pill">{row.paymentStatus.replaceAll("_", " ")}</span></td>
                        <td style={{ padding: 10 }}>{php(Number(row.slot.hourly_rate || 0))}</td>
                        <td style={{ padding: 10 }}>{row.proofUrl ? <a className="btn btn-secondary" href={row.proofUrl} target="_blank" rel="noreferrer">View</a> : <span className="muted">None</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="grid grid-2">
              <div>
                <label>Filter reservation cards by booking date</label>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
              </div>
              <div style={{ display: "flex", alignItems: "end", gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setSelectedDate("")}>Show All Dates</button>
                <button className="btn btn-secondary" onClick={loadBookings}>Refresh</button>
              </div>
            </div>
            {selectedDate && <p className="muted" style={{ marginBottom: 0 }}>Showing reservations that contain a slot on <strong>{selectedDate}</strong>.</p>}
          </section>

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginTop: 16 }}>
            <section className="card"><div className="muted">Bookings</div><div className="price">{stats.total}</div></section>
            <section className="card"><div className="muted">Pending</div><div className="price">{stats.pending}</div></section>
            <section className="card"><div className="muted">Confirmed</div><div className="price">{stats.confirmed}</div></section>
            <section className="card"><div className="muted">Paid</div><div className="price">{stats.paid}</div></section>
            <section className="card"><div className="muted">Paid Revenue</div><div className="price">{php(stats.revenue)}</div></section>
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="row space"><h2>{selectedDate ? `Bookings on ${selectedDate}` : "Reservation Details"}</h2><span className="pill">{filteredBookings.length} RESULT(S)</span></div>
            {filteredBookings.length === 0 ? (
              <p className="muted">No bookings found for the selected date.</p>
            ) : (
              <div className="grid">
                {filteredBookings.map(b => (
                  <article key={b.id} style={{ border: "1px solid #285363", borderRadius: 14, padding: 16, background: "#09191f" }}>
                    <div className="row space">
                      <div>
                        <strong>{b.customer_name}</strong>
                        <div className="muted">{b.booking_code} · {b.customer_mobile} · {b.customer_email}</div>
                      </div>
                      <div style={{ textAlign: "right" }}><strong>{php(Number(b.total_amount))}</strong><div className="muted">{b.total_hours} hour(s)</div></div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      {(b.booking_slots || []).filter(s => !selectedDate || s.booking_date === selectedDate).map(s => (
                        <div key={s.id} className="muted" style={{ marginBottom: 4 }}>
                          {s.booking_date} · {s.courts?.name || "Court"} · {formatTime(s.start_minute)} - {formatTime(s.end_minute)}
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <label>Proof of payment attachment</label>
                      {b.proof_url ? (
                        <div className="row" style={{ alignItems: "flex-start" }}>
                          <a className="btn btn-secondary" href={b.proof_url} target="_blank" rel="noreferrer">Open Attachment</a>
                          <img src={b.proof_url} alt={`Proof of payment for ${b.booking_code}`} style={{ width: 120, maxHeight: 120, objectFit: "cover", borderRadius: 10, border: "1px solid #285363" }} />
                        </div>
                      ) : (
                        <div className="muted">No attachment uploaded.</div>
                      )}
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
            )}
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
