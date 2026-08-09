"use client";

import { useState } from "react";

type Counts = { bookings:number; slots:number; events:number; refunds:number; proofFiles:number };

export default function MaintenancePage(){
  const [code,setCode]=useState("");
  const [counts,setCounts]=useState<Counts|null>(null);
  const [msg,setMsg]=useState("");
  const [loading,setLoading]=useState(false);

  const load=async()=>{
    setLoading(true); setMsg("");
    try{
      const r=await fetch(`/api/admin/maintenance?adminCode=${encodeURIComponent(code)}`);
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Unable to load maintenance data");
      setCounts(d.counts);
    }catch(e:any){setMsg(e.message||"Unable to load");}
    finally{setLoading(false);}
  };

  const run=async(action:string, word:"DELETE"|"RESET", label:string)=>{
    const typed=prompt(`${label}\n\nType ${word} to continue.`) || "";
    if(typed!==word){ if(typed) setMsg(`Cancelled. You must type ${word} exactly.`); return; }
    setLoading(true); setMsg("");
    try{
      const r=await fetch("/api/admin/maintenance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({adminCode:code,action,confirmText:typed})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Operation failed");
      setMsg(`${label} completed successfully.`); await load();
    }catch(e:any){setMsg(e.message||"Operation failed");}
    finally{setLoading(false);}
  };

  return <main className="container">
    <section className="hero"><div className="logoBox">BUELO</div><div><span className="pill">ADMIN TOOLS</span><h1>System Maintenance</h1><p>Safely clear test data, payment proofs, and audit history while keeping the BUELO database structure intact.</p></div></section>

    <section className="card">
      <div className="grid grid-2">
        <div><label>Admin password</label><input type="password" value={code} onChange={e=>setCode(e.target.value)} placeholder="Enter ADMIN_PASSWORD"/></div>
        <div style={{display:"flex",alignItems:"end"}}><button className="btn btn-primary" disabled={!code||loading} onClick={load}>{loading?"Working...":"Open Maintenance"}</button></div>
      </div>
      {msg&&<p className={msg.includes("successfully")?"success":"error"}>{msg}</p>}
    </section>

    {counts&&<>
      <div className="grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",marginTop:16}}>
        <section className="card"><div className="muted">Bookings</div><div className="price">{counts.bookings}</div></section>
        <section className="card"><div className="muted">Booking Slots</div><div className="price">{counts.slots}</div></section>
        <section className="card"><div className="muted">Audit Events</div><div className="price">{counts.events}</div></section>
        <section className="card"><div className="muted">Refunds</div><div className="price">{counts.refunds}</div></section>
        <section className="card"><div className="muted">Payment Proof Files</div><div className="price">{counts.proofFiles}</div></section>
      </div>

      <section className="card" style={{marginTop:16,borderColor:"#9a4050"}}>
        <span className="pill">DANGER ZONE</span><h2>Booking Data</h2><p className="muted">Deletes reservations, slots, refunds, and their audit trail. Courts, rates, settings, and database tables are preserved.</p>
        <button className="btn btn-danger" disabled={loading} onClick={()=>run("clear_all_bookings","DELETE","Clear all booking data")}>🗑 Clear All Bookings</button>
      </section>

      <section className="card" style={{marginTop:16}}>
        <h2>Payment Proof Storage</h2><p className="muted">Removes uploaded customer payment receipts from the private payment-proofs storage bucket. Booking records are not deleted.</p>
        <button className="btn btn-danger" disabled={loading} onClick={()=>run("clear_payment_proofs","DELETE","Clear all payment proof files")}>🗑 Clear Payment Proofs</button>
      </section>

      <section className="card" style={{marginTop:16}}>
        <h2>Audit Trail</h2><p className="muted">Clears reservation activity history only. Bookings and schedules remain intact.</p>
        <button className="btn btn-danger" disabled={loading} onClick={()=>run("clear_audit_trail","DELETE","Clear audit trail")}>🗑 Clear Audit Trail</button>
      </section>

      <section className="card" style={{marginTop:16,borderColor:"#9f7a23"}}>
        <h2>Reset Test Data</h2><p className="muted">Returns booking-related database records to a clean testing state. Court configuration remains untouched.</p>
        <button className="btn btn-secondary" disabled={loading} onClick={()=>run("reset_demo_data","RESET","Reset booking test data")}>♻ Reset Test Data</button>
      </section>
    </>}
  </main>;
}
