import Link from "next/link";

export default function AdminLayout({children}:{children:React.ReactNode}){
  return <>
    <div style={{position:"sticky",top:0,zIndex:50,background:"rgba(7,18,37,.96)",borderBottom:"1px solid #244d87",backdropFilter:"blur(10px)"}}>
      <div className="container" style={{paddingTop:12,paddingBottom:12}}>
        <div className="row space">
          <strong>BUELO Admin</strong>
          <nav className="row">
            <Link className="btn btn-secondary" href="/admin">Dashboard & Reports</Link>
            <Link className="btn btn-secondary" href="/admin/manage">Reservations & Operations</Link>
            <Link className="btn btn-secondary" href="/admin/maintenance">Maintenance</Link>
            <Link className="btn btn-secondary" href="/">Customer Booking</Link>
          </nav>
        </div>
      </div>
    </div>
    {children}
  </>;
}
