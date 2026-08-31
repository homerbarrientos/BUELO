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

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localISODate(d);
};

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const php = (value: number) => `₱${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function AdminPage() {
  const today = localISODate();
  const [code, setCode] = useState("");
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(addDays(today, 6));
  const [draftFrom, setDraftFrom] = useState(today);
  const [draftTo, setDraftTo] = useState(addDays(today, 6));
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

  function resetSevenDays() {
    const start = localISODate();
    const end = addDays(start, 6);
    setDraftFrom(start);
    setDraftTo(end);
    setFromDate(start);
    setToDate(end);
  }

  function applyDateFilter() {
    if (!draftFrom || !draftTo) return setMsg("Select both From and To dates.");
    if (draftFrom > draftTo) return setMsg("From date cannot be after To date.");
    setMsg("");
    setFromDate(draftFrom);
    setToDate(draftTo);
  }

  const scheduleRows = useMemo<ScheduleRow[]>(() => {
    const rows: ScheduleRow[] = [];
    for (const booking of bookings) {
      for (const slot of booking.booking_slots || []) {
        if (slot.booking_date < fromDate || slot.booking_date > toDate) continue;
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
      const dateCompare = a.slot.booking_date.localeCompare(b.slot.booking_date);
      if (dateCompare !== 0) return dateCompare;
      const courtCompare = (a.slot.courts?.name || "").localeCompare(b.slot.courts?.name || "");
      if (courtCompare !== 0) return courtCompare;
      return a.slot.start_minute - b.slot.start_minute;
    });
  }, [bookings, fromDate, toDate]);

  const periodReport = useMemo(() => {
    const activeRows = scheduleRows.filter(r => r.bookingStatus !== "cancelled");
    const paidRows = activeRows.filter(r => r.paymentStatus === "paid");
    const bookedRows = activeRows.filter(r => r.bookingStatus === "confirmed" && r.paymentStatus === "paid");
    const uniqueBookings = new Set(activeRows.map(r => r.bookingId)).size;
    const paidBookings = new Set(paidRows.map(r => r.bookingId)).size;
    const sales = paidRows.reduce((sum, r) => sum + Number(r.slot.hourly_rate || 0), 0);
    const bookedHours = bookedRows.length;
    const days = Math.max(1, Math.round((new Date(`${toDate}T12:00:00`).getTime() - new Date(`${fromDate}T12:00:00`).getTime()) / 86400000) + 1);
    const activeCourts = courts.filter(c => c.is_active).length;
    const totalSlots = activeCourts * 24 * days;
    const openSlots = Math.max(0, totalSlots - activeRows.length);
    const utilization = totalSlots ? (activeRows.length / totalSlots) * 100 : 0;
    return { sales, bookedHours, uniqueBookings, paidBookings, totalSlots, openSlots, utilization, days };
  }, [scheduleRows, courts, fromDate, toDate]);

  const dateSeries = useMemo(() => {
    const result: { date: string; label: string; sales: number; hours: number; booked: number; open: number }[] = [];
    const activeCourtCount = courts.filter(c => c.is_active).length;
    let cursor = fromDate;
    let guard = 0;
    while (cursor <= toDate && guard < 62) {
      const dayRows = scheduleRows.filter(r => r.slot.booking_date === cursor && r.bookingStatus !== "cancelled");
      const paid = dayRows.filter(r => r.paymentStatus === "paid");
      result.push({
        date: cursor,
        label: shortDate(cursor),
        sales: paid.reduce((sum, r) => sum + Number(r.slot.hourly_rate || 0), 0),
        hours: paid.filter(r => r.bookingStatus === "confirmed").length,
        booked: dayRows.length,
        open: Math.max(0, activeCourtCount * 24 - dayRows.length)
      });
      cursor = addDays(cursor, 1);
      guard++;
    }
    return result;
  }, [scheduleRows, courts, fromDate, toDate]);

  const maxSales = Math.max(1, ...dateSeries.map(d => d.sales));

  const availabilityByCourt = useMemo(() => {
    const activeCourts = courts.filter(c => c.is_active);
    return dateSeries.map(day => ({
      date: day.date,
      courts: activeCourts.map(court => {
        const rows = scheduleRows.filter(r => r.slot.booking_date === day.date && r.bookingStatus !== "cancelled" && (r.slot.courts?.name || "") === court.name);
        return { name: court.name, booked: rows.length, open: Math.max(0, 24 - rows.length), occupancy: (rows.length / 24) * 100 };
      })
    }));
  }, [dateSeries, courts, scheduleRows]);

  function exportCSV() {
    const rows = [
      ["Booking Date", "Court", "Time", "Booking Reference", "Customer", "Mobile", "Email", "Booking Status", "Payment Status", "Rate"],
      ...scheduleRows.map(r => [r.slot.booking_date, r.slot.courts?.name || "Court", `${formatTime(r.slot.start_minute)} - ${formatTime(r.slot.end_minute)}`, r.bookingCode, r.customerName, r.customerMobile, r.customerEmail, r.bookingStatus, r.paymentStatus, Number(r.slot.hourly_rate || 0).toFixed(2)])
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `booking-report-${fromDate}-to-${toDate}.csv`;
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
          <p>Monitor the next 7 days by default, or filter a specific date range for schedules, sales and remaining court availability.</p>
        </div>
      </section>

      <section className="card">
        <div className="grid grid-2">
          <div><label>Admin password</label><input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Enter ADMIN_PASSWORD" /></div>
          <div style={{ display: "flex", alignItems: "end" }}><button className="btn btn-primary" onClick={loadBookings} disabled={loading || !code}>{loading ? "Loading..." : "Open Dashboard"}</button></div>
        </div>
      </section>

      {bookings.length > 0 && <>
        <section className="card" style={{ marginTop: 16 }}>
          <div className="row space">
            <div><span className="pill">DASHBOARD FILTER</span><h2 style={{ marginBottom: 6 }}>Schedule Period</h2><div className="muted">Default view is today plus the next 6 days (7 days total).</div></div>
            <button className="btn btn-secondary" onClick={exportCSV}>Export CSV</button>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginTop: 16 }}>
            <div><label>From date</label><input type="date" value={draftFrom} onChange={e => setDraftFrom(e.target.value)} /></div>
            <div><label>To date</label><input type="date" value={draftTo} onChange={e => setDraftTo(e.target.value)} /></div>
            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}><button className="btn btn-primary" onClick={applyDateFilter}>Apply Filter</button><button className="btn btn-secondary" onClick={resetSevenDays}>Reset 7 Days</button><button className="btn btn-secondary" onClick={loadBookings}>Refresh</button></div>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>Showing <strong>{fromDate}</strong> to <strong>{toDate}</strong> · {periodReport.days} day(s)</p>
        </section>

        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", marginTop: 16 }}>
          <section className="card"><div className="muted">Sales</div><div className="price">{php(periodReport.sales)}</div><div className="muted">Selected period</div></section>
          <section className="card"><div className="muted">Reservations</div><div className="price">{periodReport.uniqueBookings}</div><div className="muted">Active bookings</div></section>
          <section className="card"><div className="muted">Booked Hours</div><div className="price">{periodReport.bookedHours}</div><div className="muted">Confirmed + paid</div></section>
          <section className="card"><div className="muted">Open Slots</div><div className="price">{periodReport.openSlots}</div><div className="muted">Remaining court hours</div></section>
          <section className="card"><div className="muted">Occupancy</div><div className="price">{periodReport.utilization.toFixed(1)}%</div><div className="muted">Across active courts</div></section>
          <section className="card"><div className="muted">Paid Bookings</div><div className="price">{periodReport.paidBookings}</div><div className="muted">Selected period</div></section>
        </div>

        <div className="grid grid-2" style={{ marginTop: 16 }}>
          <section className="card">
            <div className="row space"><div><span className="pill">SALES GROWTH</span><h2>{periodReport.days === 7 ? "7-Day Sales" : "Filtered Sales"}</h2></div><strong>{php(periodReport.sales)}</strong></div>
            <div style={{ display: "flex", alignItems: "end", gap: 8, height: 190, marginTop: 18, overflowX: "auto" }}>
              {dateSeries.map(day => <div key={day.date} style={{ flex: "1 0 52px", textAlign: "center" }} title={`${day.date}: ${php(day.sales)}`}>
                <div className="muted" style={{ fontSize: 10 }}>{day.sales ? php(day.sales) : "₱0"}</div>
                <div style={{ height: 125, display: "flex", alignItems: "end", justifyContent: "center" }}><div style={{ width: "70%", minHeight: 3, height: `${Math.max(3, (day.sales / maxSales) * 125)}px`, borderRadius: "8px 8px 3px 3px", background: "linear-gradient(180deg,#21d6c6,#4da7ff)" }} /></div>
                <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>{day.label}</div>
              </div>)}
            </div>
          </section>

          <section className="card">
            <span className="pill">COURT AVAILABILITY</span><h2>Remaining Open Courts</h2>
            <div className="muted" style={{ marginBottom: 12 }}>Open hourly slots for each active court in the displayed period.</div>
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {availabilityByCourt.map(day => <div key={day.date} style={{ borderBottom: "1px solid #285363", padding: "9px 0" }}>
                <strong>{shortDate(day.date)}</strong>
                {day.courts.map(c => <div key={`${day.date}-${c.name}`} className="row space" style={{ marginTop: 5 }}><span className="muted">{c.name}</span><span><strong>{c.open}</strong> open · {c.booked} booked · {c.occupancy.toFixed(0)}%</span></div>)}
              </div>)}
            </div>
          </section>
        </div>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="row space"><div><span className="pill">BOOKING SCHEDULE</span><h2>{fromDate === toDate ? `Schedule for ${fromDate}` : `${shortDate(fromDate)} – ${shortDate(toDate)}`}</h2></div><span className="pill">{scheduleRows.length} SLOT(S)</span></div>
          {scheduleRows.length === 0 ? <p className="muted">No booking schedule found for this period.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #285363" }}><th style={{ padding: 10 }}>Date</th><th style={{ padding: 10 }}>Time</th><th style={{ padding: 10 }}>Court</th><th style={{ padding: 10 }}>Customer</th><th style={{ padding: 10 }}>Booking Ref</th><th style={{ padding: 10 }}>Booking</th><th style={{ padding: 10 }}>Payment</th><th style={{ padding: 10 }}>Rate</th><th style={{ padding: 10 }}>Proof</th></tr></thead>
            <tbody>{scheduleRows.map(row => <tr key={`${row.bookingId}-${row.slot.id}`} style={{ borderBottom: "1px solid #173943" }}><td style={{ padding: 10 }}>{row.slot.booking_date}</td><td style={{ padding: 10, whiteSpace: "nowrap" }}>{formatTime(row.slot.start_minute)} - {formatTime(row.slot.end_minute)}</td><td style={{ padding: 10 }}>{row.slot.courts?.name || "Court"}</td><td style={{ padding: 10 }}><strong>{row.customerName}</strong><div className="muted" style={{ fontSize: 12 }}>{row.customerMobile}</div></td><td style={{ padding: 10 }}>{row.bookingCode}</td><td style={{ padding: 10 }}><span className="pill">{row.bookingStatus}</span></td><td style={{ padding: 10 }}><span className="pill">{row.paymentStatus.replaceAll("_", " ")}</span></td><td style={{ padding: 10 }}>{php(row.slot.hourly_rate)}</td><td style={{ padding: 10 }}>{row.proofUrl ? <a className="btn btn-secondary" href={row.proofUrl} target="_blank" rel="noreferrer">View</a> : <span className="muted">None</span>}</td></tr>)}</tbody>
          </table></div>}
        </section>
      </>}

      <section style={{ marginTop: 24 }}>
        <div className="row space"><div><span className="pill">COURT SETTINGS</span><h2>Rates & Availability</h2></div></div>
        <div className="grid grid-2">{courts.map(c => <section className="card" key={c.id}><h2>{c.name}</h2><label>Hourly rate (PHP)</label><input type="number" value={c.hourly_rate} onChange={e => setCourts(p => p.map(x => x.id === c.id ? { ...x, hourly_rate: Number(e.target.value) } : x))} /><div className="row" style={{ marginTop: 14 }}><label style={{ margin: 0 }}><input style={{ width: "auto" }} type="checkbox" checked={c.is_active} onChange={e => setCourts(p => p.map(x => x.id === c.id ? { ...x, is_active: e.target.checked } : x))} /> Active</label><button className="btn btn-primary" onClick={() => saveCourt(c)}>Save</button></div></section>)}</div>
      </section>

      {msg && <p className={msg.toLowerCase().includes("updated") ? "success" : "error"}>{msg}</p>}
    </main>
  );
}
