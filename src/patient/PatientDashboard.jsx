import { Link, Routes, Route, useLocation } from "react-router-dom";
import PregnancyProfile from "./PregnancyProfile";
import BookAppointment from "./BookAppointment";
import MyAppointments from "./MyAppointments";
import PatientReportSimplifier from "./PatientReportSimplifier";
import BabyDevelopmentDashboard from "./BabyDevelopmentDashboard";
import HealthTracker from "./HealthTracker";
import HealthReminders from "./HealthReminders";
import ReportAnalyser from "./ReportAnalyser";
import { useState } from "react";

const NAV = [
  { to:"/patient_dashboard/profile",        icon:"👤", label:"My Profile"         },
  { to:"/patient_dashboard/book",           icon:"📅", label:"Book Appointment"   },
  { to:"/patient_dashboard/myappointments", icon:"📋", label:"My Appointments"    },
  { to:"/patient_dashboard/baby",           icon:"👶", label:"Baby Development"   },
  { to:"/patient_dashboard/health",         icon:"❤️", label:"Health Tracker"     },
  { to:"/patient_dashboard/reminders",      icon:"🔔", label:"Reminders"          },
  { to:"/patient_dashboard/reports",        icon:"🩺", label:"Simplify Reports"   },
  { to:"/patient_dashboard/analyser",       icon:"📄", label:"Report Analyser"    },
];

export default function PatientDashboard() {
  const location  = useLocation();
  const [open, setOpen] = useState(false); // mobile drawer

  const activeLabel = NAV.find(n => location.pathname.includes(n.to.split("/")[2]))?.label || "Dashboard";

  function logout() {
    if (window.confirm("Logout?")) {
      localStorage.removeItem("token");
      window.location.href = "/";
    }
  }

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,500&family=Nunito:wght@300;400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#1a3a4a;border-radius:3px;}
        @keyframes fadeIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        .nav-link:hover{ background:rgba(122,226,207,0.1) !important; color:#7AE2CF !important; }
        .nav-link:hover .nav-icon{ transform:scale(1.15); }
        .logout-btn:hover{ background:rgba(239,68,68,0.12) !important; color:#fca5a5 !important; }
        @media(max-width:700px){
          .sidebar{ transform:translateX(-100%); transition:transform .25s ease; position:fixed!important; z-index:200; }
          .sidebar.open{ transform:translateX(0); }
          .overlay{ display:block!important; }
        }
      `}</style>

      {/* Mobile overlay */}
      <div className="overlay" onClick={()=>setOpen(false)}
        style={{ display:"none", position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:199 }} />

      {/* ── Sidebar ── */}
      <aside className={`sidebar${open?" open":""}`} style={S.sidebar}>

        {/* Logo */}
        <div style={S.logo}>
          <div style={S.logoIcon}>🌸</div>
          <div>
            <div style={S.logoName}>NurtureWell</div>
            <div style={S.logoSub}>Pregnancy Companion</div>
          </div>
        </div>

        <div style={S.divider}/>

        {/* Nav label */}
        <div style={S.navSection}>Menu</div>

        {/* Nav links */}
        <nav style={{ flex:1 }}>
          {NAV.map(({ to, icon, label }) => {
            const seg    = to.split("/")[2];
            const active = location.pathname.includes(seg);
            return (
              <Link key={to} to={to} className="nav-link"
                onClick={()=>setOpen(false)}
                style={{
                  ...S.navLink,
                  background: active ? "rgba(122,226,207,0.12)" : "transparent",
                  color:      active ? "#7AE2CF" : "#94a3b8",
                  borderLeft: active ? "3px solid #7AE2CF" : "3px solid transparent",
                  fontWeight: active ? 700 : 500,
                }}>
                <span className="nav-icon" style={{ fontSize:17, transition:"transform .15s", flexShrink:0 }}>{icon}</span>
                <span style={{ fontSize:13 }}>{label}</span>
                {active && <div style={{ marginLeft:"auto", width:6, height:6, borderRadius:"50%", background:"#7AE2CF" }}/>}
              </Link>
            );
          })}
        </nav>

        <div style={S.divider}/>

        {/* Logout */}
        <button className="logout-btn" onClick={logout} style={S.logoutBtn}>
          <span style={{ fontSize:16 }}>🚪</span>
          <span style={{ fontSize:13 }}>Logout</span>
        </button>

        {/* Version */}
        <div style={{ fontSize:10, color:"#1a3a4a", textAlign:"center", marginTop:14 }}>NurtureWell v1.0</div>
      </aside>

      {/* ── Main ── */}
      <div style={S.main}>

        {/* Top bar */}
        <div style={S.topbar}>
          {/* Mobile hamburger */}
          <button onClick={()=>setOpen(v=>!v)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color:"#7AE2CF", display:"none", padding:0 }} className="hamburger">☰</button>
          <style>{`.hamburger{display:none!important} @media(max-width:700px){.hamburger{display:block!important}}`}</style>

          <div style={S.breadcrumb}>
            <span style={{ color:"#334155" }}>Patient</span>
            <span style={{ color:"#1a3a4a", margin:"0 6px" }}>›</span>
            <span style={{ color:"#7AE2CF", fontWeight:700 }}>{activeLabel}</span>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:12, marginLeft:"auto" }}>
            {/* Online indicator */}
            <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:20, padding:"4px 12px" }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:"#22C55E" }}/>
              <span style={{ fontSize:11, color:"#86efac", fontWeight:600 }}>Active</span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div style={S.content}>
          <Routes>
            <Route path="profile"        element={<PregnancyProfile />} />
            <Route path="book"           element={<BookAppointment />} />
            <Route path="myappointments" element={<MyAppointments />} />
            <Route path="reports"        element={<PatientReportSimplifier />} />
            <Route path="baby"           element={<BabyDevelopmentDashboard />} />
            <Route path="health"         element={<HealthTracker />} />
            <Route path="reminders"      element={<HealthReminders />} />
            <Route path="analyser"       element={<ReportAnalyser />} />
            {/* Default landing */}
            <Route path="*" element={<DashboardHome />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

/* ── Default home page shown when no route is active ── */
function DashboardHome() {
  const cards = [
    { to:"/patient_dashboard/book",           icon:"📅", label:"Book Appointment",  sub:"Schedule with a doctor",    color:"#7AE2CF" },
    { to:"/patient_dashboard/baby",           icon:"👶", label:"Baby Development",  sub:"Week-by-week growth",       color:"#F472B6" },
    { to:"/patient_dashboard/health",         icon:"❤️", label:"Health Tracker",    sub:"BP & weight logs",          color:"#34D399" },
    { to:"/patient_dashboard/reminders",      icon:"🔔", label:"Reminders",         sub:"Daily health nudges",       color:"#FBBF24" },
    { to:"/patient_dashboard/reports",        icon:"🩺", label:"Simplify Reports",  sub:"Understand medical docs",   color:"#A78BFA" },
    { to:"/patient_dashboard/myappointments", icon:"📋", label:"My Appointments",   sub:"View & manage bookings",    color:"#60A5FA" },
      { to:"/patient_dashboard/analyser",       icon:"📄", label:"Report Analyser",   sub:"In-depth report insights", color:"#F87171" },
  ];
  return (
    <div style={{ padding:28 }}>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, color:"#f0fffe", margin:"0 0 6px" }}>
          Welcome back 🌸
        </h1>
        <p style={{ color:"#4a8a8c", fontSize:14 }}>What would you like to do today?</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:14 }}>
        {cards.map(c => (
          <Link key={c.to} to={c.to} style={{ textDecoration:"none" }}>
            <div style={{ background:"rgba(122,226,207,0.04)", border:"1px solid rgba(122,226,207,0.1)", borderRadius:16, padding:"22px 18px", cursor:"pointer", transition:"all .2s", borderTop:`3px solid ${c.color}` }}
              onMouseEnter={e=>{ e.currentTarget.style.background="rgba(122,226,207,0.09)"; e.currentTarget.style.transform="translateY(-2px)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.background="rgba(122,226,207,0.04)"; e.currentTarget.style.transform="translateY(0)"; }}>
              <div style={{ fontSize:32, marginBottom:12 }}>{c.icon}</div>
              <div style={{ fontWeight:800, color:"#e0f7f5", fontSize:15, marginBottom:4 }}>{c.label}</div>
              <div style={{ fontSize:12, color:"#4a8a8c" }}>{c.sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const S = {
  root:      { display:"flex", height:"100vh", fontFamily:"'Nunito',sans-serif", background:"#06202B", overflow:"hidden" },
  sidebar:   { width:230, background:"linear-gradient(180deg,#06202B 0%,#082535 100%)", borderRight:"1px solid rgba(122,226,207,0.08)", display:"flex", flexDirection:"column", padding:"22px 14px 18px", flexShrink:0, height:"100vh", overflowY:"auto" },
  logo:      { display:"flex", alignItems:"center", gap:12, marginBottom:22 },
  logoIcon:  { width:38, height:38, borderRadius:10, background:"linear-gradient(135deg,#077A7D,#7AE2CF)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 },
  logoName:  { fontFamily:"'Playfair Display',serif", fontSize:16, color:"#f0fffe", fontWeight:700, lineHeight:1.2 },
  logoSub:   { fontSize:10, color:"#334155", marginTop:1 },
  divider:   { height:1, background:"rgba(122,226,207,0.08)", margin:"10px 0" },
  navSection:{ fontSize:10, color:"#1a3a4a", fontWeight:700, textTransform:"uppercase", letterSpacing:.8, marginBottom:8, paddingLeft:12 },
  navLink:   { display:"flex", alignItems:"center", gap:11, padding:"10px 12px", borderRadius:9, textDecoration:"none", marginBottom:3, transition:"all .15s" },
  logoutBtn: { display:"flex", alignItems:"center", gap:11, padding:"10px 12px", borderRadius:9, background:"transparent", border:"none", cursor:"pointer", color:"#475569", fontFamily:"'Nunito',sans-serif", width:"100%", marginTop:4, transition:"all .15s" },
  main:      { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar:    { height:52, background:"rgba(8,37,53,0.95)", borderBottom:"1px solid rgba(122,226,207,0.08)", display:"flex", alignItems:"center", padding:"0 20px", gap:12, flexShrink:0 },
  breadcrumb:{ fontSize:13, fontWeight:600, display:"flex", alignItems:"center" },
  content:   { flex:1, overflowY:"auto", background:"#06202B" },
};