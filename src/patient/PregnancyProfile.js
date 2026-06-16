import { useState, useEffect, useRef } from "react";

const API = "http://localhost:5000";
const hdrs = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const CONDITIONS    = ["None", "Diabetes", "Hypertension", "Thyroid", "Anemia", "PCOS", "Other"];

export default function PatientProfile() {
  const [profile,   setProfile]   = useState(null);
  const [patient,   setPatient]   = useState(null);
  const [user,      setUser]      = useState(null);
  const [editing,   setEditing]   = useState(false);
  const [section,   setSection]   = useState("overview"); // overview | pregnancy | health | account
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState(null);
  const [loading,   setLoading]   = useState(true);
const [form, setForm] = useState({});
const avatarColors = ["#077A7D","#e76f51","#a855f7","#0ea5e9","#f59e0b"];

function showToast(msg, type = "success") {
  setToast({ msg, type });
  setTimeout(() => setToast(null), 3000);
}

useEffect(() => { loadAll(); }, []);

async function loadAll() {
  setLoading(true);
  try {
    const [profRes, patRes] = await Promise.all([
      fetch(`${API}/pregnancy-profile`, { headers: hdrs() }),
      fetch(`${API}/patient-details`,   { headers: hdrs() }),
    ]);

    // 404 on pregnancy profile is expected for new users — don't treat as error
    const profData = profRes.ok ? await profRes.json() : {};
    const patData  = patRes.ok  ? await patRes.json()  : {};

    const p = profData.profile || null;
    const d = patData.patient  || null;

    setProfile(p);
    setPatient(d);

    const token = localStorage.getItem("token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUser(payload);
      } catch {}
    }

    setForm({
      fullName:           d?.fullName            || "",
      phoneNumber:        d?.phoneNumber          || "",
      dateOfBirth:        d?.dateOfBirth          || "",
      bloodGroup:         d?.bloodGroup           || "",
      pregnancyWeek:      p?.pregnancyWeek        || "",
      pregnancyMonth:     p?.pregnancyMonth       || "",
      expectedDueDate:    p?.expectedDueDate      || "",
      LMP:                p?.LMP                  || "",
      firstPregnancy:     p?.firstPregnancy       ?? true,
      existingConditions: p?.existingConditions   || "None",
    });
  } catch (e) {
    console.error(e);
    showToast("Could not load profile", "error");
  }
  setLoading(false);
}

  async function saveChanges() {
  setSaving(true);
  try {
    // Personal details — already handles upsert on the server
    const r1 = await fetch(`${API}/patient-details`, {
      method: "PUT", headers: hdrs(),
      body: JSON.stringify({
        fullName:    form.fullName,
        phoneNumber: form.phoneNumber,
        dateOfBirth: form.dateOfBirth,
        bloodGroup:  form.bloodGroup,
      }),
    });

    // Pregnancy profile — try PUT first, fall back to POST if no profile exists yet
    let r2 = await fetch(`${API}/pregnancy-profile`, {
      method: "PUT", headers: hdrs(),
      body: JSON.stringify({
        pregnancyWeek:      Number(form.pregnancyWeek),
        pregnancyMonth:     Number(form.pregnancyMonth),
        expectedDueDate:    form.expectedDueDate,
        LMP:                form.LMP,
        firstPregnancy:     form.firstPregnancy,
        existingConditions: form.existingConditions,
      }),
    });

    // 404 means no profile exists yet — create one instead
    if (r2.status === 404) {
      r2 = await fetch(`${API}/pregnancy-profile`, {
        method: "POST", headers: hdrs(),
        body: JSON.stringify({
          pregnancyWeek:      Number(form.pregnancyWeek),
          pregnancyMonth:     Number(form.pregnancyMonth),
          expectedDueDate:    form.expectedDueDate,
          LMP:                form.LMP,
          firstPregnancy:     form.firstPregnancy,
          existingConditions: form.existingConditions,
        }),
      });
    }

    if (r1.ok && r2.ok) {
      showToast("Profile updated! ✅");
      setEditing(false);
      loadAll();
    } else {
      const err = await r2.json().catch(() => ({}));
      showToast(err.message || "Some fields failed to save", "error");
    }
  } catch (e) {
    showToast("Network error", "error");
  }
  setSaving(false);
}
  // Derived values
  const weeksLeft  = profile?.pregnancyWeek ? 40 - Number(profile.pregnancyWeek) : null;
  const progress   = profile?.pregnancyWeek ? Math.round((Number(profile.pregnancyWeek) / 40) * 100) : 0;
  const trimester  = profile?.pregnancyWeek
    ? Number(profile.pregnancyWeek) <= 12 ? 1 : Number(profile.pregnancyWeek) <= 26 ? 2 : 3
    : null;
  const trimLabel  = ["", "First Trimester", "Second Trimester", "Third Trimester"][trimester || 0];
  const initials   = (form.fullName || "P").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
  const avatarBg   = avatarColors[(initials.charCodeAt(0) || 0) % avatarColors.length];
  const age        = form.dateOfBirth
    ? Math.floor((new Date() - new Date(form.dateOfBirth)) / (1000 * 60 * 60 * 24 * 365.25))
    : null;

  const F = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const TABS = [
    { id:"overview",  label:"Overview",        emoji:"🏠" },
    { id:"pregnancy", label:"Pregnancy Info",   emoji:"🤰" },
    { id:"health",    label:"Health Details",   emoji:"❤️" },
    { id:"account",   label:"Account",          emoji:"👤" },
  ];

  if (loading) return (
    <div style={{ background:"#c5d3d8", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, animation:"float 2s ease-in-out infinite" }}>🤰</div>
        <p style={{ color:"#7AE2CF", fontFamily:"'Nunito',sans-serif", marginTop:12 }}>Loading your profile…</p>
      </div>
    </div>
  );

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,500&family=Nunito:wght@300;400;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #1a3a4a; border-radius:4px; }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes toastIn { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }
        .tab-btn:hover { background: hsla(169, 64%, 68%, 0.12) !important; }
        .inp:focus { border-color: #7AE2CF !important; outline: none; }
        .inp:focus + label, .inp:not(:placeholder-shown) + label { display: none; }
        .edit-btn:hover { background: rgba(122,226,207,0.2) !important; }
        .save-btn:hover { filter: brightness(1.1); }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ ...S.toast,
          background: toast.type==="error" ? "rgba(239,68,68,0.95)" : "rgba(7,122,125,0.95)",
          animation: "toastIn .3s ease" }}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div style={S.header}>
        <div style={S.headerInner}>
          {/* Avatar */}
          <div style={{ ...S.avatar, background: avatarBg }}>
            {initials}
            {!editing && (
              <div style={S.avatarEditDot} title="Edit profile">✏️</div>
            )}
          </div>

          {/* Name + status */}
          <div style={{ flex:1, minWidth:0 }}>
            <h1 style={S.heroName}>{form.fullName || "Your Name"}</h1>
            <div style={S.heroBadges}>
              {trimester && (
                <span style={S.badge}>
                  {["","🌸","🌿","⭐"][trimester]} {trimLabel}
                </span>
              )}
              {profile?.pregnancyWeek && (
                <span style={{ ...S.badge, background:"rgba(7,122,125,0.3)", border:"1px solid #077A7D" }}>
                  Week {profile.pregnancyWeek}
                </span>
              )}
              {age && <span style={S.badge}>{age} yrs</span>}
              {form.bloodGroup && (
                <span style={{ ...S.badge, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.4)", color:"#fca5a5" }}>
                  🩸 {form.bloodGroup}
                </span>
              )}
            </div>
          </div>

          {/* Edit / Save buttons */}
          <div style={{ display:"flex", gap:10, flexShrink:0 }}>
            {editing ? (
              <>
                <button className="save-btn" style={S.saveBtn} onClick={saveChanges} disabled={saving}>
                  {saving ? "Saving…" : "💾 Save Changes"}
                </button>
                <button style={S.cancelBtn} onClick={() => { setEditing(false); loadAll(); }}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="edit-btn" style={S.editBtn} onClick={() => setEditing(true)}>
                ✏️ Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {profile?.pregnancyWeek && (
          <div style={S.progressWrap}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#4a8a8c", marginBottom:6 }}>
              <span>Pregnancy Progress</span>
              <span style={{ color:"#7AE2CF", fontWeight:700 }}>{progress}% · {weeksLeft} weeks to go</span>
            </div>
            <div style={S.progressTrack}>
              <div style={{ ...S.progressFill, width:`${progress}%` }} />
              <div style={{ ...S.progressDot, left:`calc(${progress}% - 7px)` }} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-around", fontSize:10, color:"#4a8a8c", marginTop:5 }}>
              {["1st Trim","2nd Trim","3rd Trim"].map(t => <span key={t}>{t}</span>)}
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={S.tabBar}>
        {TABS.map(t => (
          <button key={t.id} className="tab-btn" onClick={() => setSection(t.id)}
            style={{ ...S.tab, color: section===t.id ? "#7AE2CF" : "#4a8a8c",
              borderBottom: section===t.id ? "2px solid #7AE2CF" : "2px solid transparent" }}>
            <span style={{ fontSize:16 }}>{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={S.content} key={section}>

        {/* ── OVERVIEW ── */}
        {section === "overview" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <div style={S.grid2}>
              <InfoCard icon="🗓️" label="Due Date"   value={profile?.expectedDueDate ? new Date(profile.expectedDueDate).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}) : "Not set"} />
              <InfoCard icon="🤰" label="Week"        value={profile?.pregnancyWeek ? `Week ${profile.pregnancyWeek} of 40` : "Not set"} />
              <InfoCard icon="🩸" label="Blood Group" value={patient?.bloodGroup || "Not set"} />
              <InfoCard icon="📞" label="Phone"       value={patient?.phoneNumber || "Not set"} />
              <InfoCard icon="🎂" label="Age"         value={age ? `${age} years old` : "Not set"} />
              <InfoCard icon="💊" label="Conditions"  value={profile?.existingConditions || "None"} />
            </div>

            {/* Quick summary strip */}
            <div style={S.summaryStrip}>
              {[
                { label:"Trimester",    value: trimLabel || "—" },
                { label:"Weeks Left",   value: weeksLeft !== null ? `${weeksLeft} weeks` : "—" },
                { label:"First Preg.", value: profile?.firstPregnancy ? "Yes" : "No" },
                { label:"LMP",          value: profile?.LMP ? new Date(profile.LMP).toLocaleDateString("en-IN",{day:"numeric",month:"short"}) : "—" },
              ].map(s => (
                <div key={s.label} style={S.summaryItem}>
                  <div style={{ fontSize:11, color:"#4a8a8c", textTransform:"uppercase", letterSpacing:.5 }}>{s.label}</div>
                  <div style={{ fontSize:16, fontWeight:800, color:"#7AE2CF", marginTop:3 }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PREGNANCY INFO ── */}
        {section === "pregnancy" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <SectionTitle>🤰 Pregnancy Details</SectionTitle>
            <div style={S.formGrid}>
              <Field label="Current Week" editing={editing}>
                {editing
                  ? <input className="inp" style={S.inp} type="number" min="1" max="40" value={form.pregnancyWeek} onChange={e=>F("pregnancyWeek",e.target.value)} />
                  : <Val>{profile?.pregnancyWeek ? `Week ${profile.pregnancyWeek}` : "—"}</Val>}
              </Field>
              <Field label="Current Month" editing={editing}>
                {editing
                  ? <input className="inp" style={S.inp} type="number" min="1" max="9" value={form.pregnancyMonth} onChange={e=>F("pregnancyMonth",e.target.value)} />
                  : <Val>{profile?.pregnancyMonth ? `Month ${profile.pregnancyMonth}` : "—"}</Val>}
              </Field>
              <Field label="Expected Due Date" editing={editing}>
                {editing
                  ? <input className="inp" style={S.inp} type="date" value={form.expectedDueDate?.slice(0,10) || ""} onChange={e=>F("expectedDueDate",e.target.value)} />
                  : <Val>{profile?.expectedDueDate ? new Date(profile.expectedDueDate).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}) : "—"}</Val>}
              </Field>
              <Field label="Last Menstrual Period (LMP)" editing={editing}>
                {editing
                  ? <input className="inp" style={S.inp} type="date" value={form.LMP?.slice(0,10) || ""} onChange={e=>F("LMP",e.target.value)} />
                  : <Val>{profile?.LMP ? new Date(profile.LMP).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}) : "—"}</Val>}
              </Field>
              <Field label="First Pregnancy?" editing={editing}>
                {editing
                  ? <div style={{ display:"flex", gap:12, marginTop:4 }}>
                      {["Yes","No"].map(opt => (
                        <button key={opt} onClick={() => F("firstPregnancy", opt==="Yes")}
                          style={{ padding:"8px 20px", borderRadius:8,
                            border:`1px solid ${form.firstPregnancy===(opt==="Yes") ? "#7AE2CF" : "#1a3a4a"}`,
                            background: form.firstPregnancy===(opt==="Yes") ? "rgba(122,226,207,0.15)" : "transparent",
                            color: form.firstPregnancy===(opt==="Yes") ? "#7AE2CF" : "#4a8a8c",
                            cursor:"pointer", fontFamily:"'Nunito',sans-serif", fontSize:14 }}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  : <Val>{profile?.firstPregnancy ? "Yes" : "No"}</Val>}
              </Field>
              <Field label="Existing Conditions" editing={editing}>
                {editing
                  ? <select className="inp" style={S.inp} value={form.existingConditions} onChange={e=>F("existingConditions",e.target.value)}>
                      {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  : <Val>{profile?.existingConditions || "None"}</Val>}
              </Field>
            </div>
          </div>
        )}

        {/* ── HEALTH DETAILS ── */}
        {section === "health" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <SectionTitle>❤️ Personal & Health Info</SectionTitle>
            <div style={S.formGrid}>
              <Field label="Full Name" editing={editing}>
                {editing
                  ? <input className="inp" style={S.inp} placeholder="Your full name" value={form.fullName} onChange={e=>F("fullName",e.target.value)} />
                  : <Val>{patient?.fullName || "—"}</Val>}
              </Field>
              <Field label="Date of Birth" editing={editing}>
                {editing
                  ? <input className="inp" style={S.inp} type="date" value={form.dateOfBirth?.slice(0,10)||""} onChange={e=>F("dateOfBirth",e.target.value)} />
                  : <Val>{patient?.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}) : "—"}</Val>}
              </Field>
              <Field label="Phone Number" editing={editing}>
                {editing
                  ? <input className="inp" style={S.inp} placeholder="+91 XXXXX XXXXX" value={form.phoneNumber} onChange={e=>F("phoneNumber",e.target.value)} />
                  : <Val>{patient?.phoneNumber || "—"}</Val>}
              </Field>
              <Field label="Blood Group" editing={editing}>
                {editing
                  ? <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
                      {BLOOD_GROUPS.map(bg => (
                        <button key={bg} onClick={() => F("bloodGroup", bg)}
                          style={{ padding:"6px 14px", borderRadius:8,
                            border:`1px solid ${form.bloodGroup===bg ? "#e05252" : "#1a3a4a"}`,
                            background: form.bloodGroup===bg ? "rgba(239,68,68,0.15)" : "transparent",
                            color: form.bloodGroup===bg ? "#fca5a5" : "#4a8a8c",
                            cursor:"pointer", fontFamily:"'Nunito',sans-serif", fontWeight: form.bloodGroup===bg ? 700 : 400 }}>
                          {bg}
                        </button>
                      ))}
                    </div>
                  : <Val>{patient?.bloodGroup || "—"}</Val>}
              </Field>
            </div>
          </div>
        )}

        {/* ── ACCOUNT ── */}
        {section === "account" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <SectionTitle>👤 Account Information</SectionTitle>
            <div style={S.formGrid}>
              <Field label="Name">
                <Val>{form.fullName || "—"}</Val>
              </Field>
              <Field label="Role">
                <span style={{ ...S.badge, background:"rgba(122,226,207,0.15)" }}>Patient</span>
              </Field>
            </div>

            <div style={{ ...S.card, marginTop:20, borderColor:"rgba(239,68,68,0.2)" }}>
              <div style={{ fontWeight:700, color:"#fca5a5", marginBottom:6, fontSize:14 }}>⚠️ Danger Zone</div>
              <p style={{ color:"#4a8a8c", fontSize:13, marginBottom:12 }}>
                To change your email or password, please contact support or use the account settings in the main menu.
              </p>
              <button style={{ background:"rgba(239,68,68,0.1)", color:"#fca5a5", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"8px 18px", cursor:"pointer", fontFamily:"'Nunito',sans-serif", fontSize:13 }}
                onClick={() => {
                  if (window.confirm("Are you sure you want to logout?")) {
                    localStorage.removeItem("token");
                    window.location.href="/";
                  }
                }}>
                Logout
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Small sub-components ─────────────────────────────────────────────────────
function InfoCard({ icon, label, value }) {
  return (
    <div style={S.infoCard}>
      <div style={{ fontSize:24, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:11, color:"#4a8a8c", textTransform:"uppercase", letterSpacing:.5, fontWeight:700 }}>{label}</div>
      <div style={{ fontSize:16, fontWeight:700, color:"#e0f7f5", marginTop:3 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#7AE2CF", fontSize:20, margin:"0 0 20px", fontWeight:600 }}>{children}</h2>;
}

function Field({ label, editing, children }) {
  return (
    <div style={{ padding:"14px 0", borderBottom:"1px solid rgba(122,226,207,0.08)" }}>
      <div style={{ fontSize:11, color:"#4a8a8c", textTransform:"uppercase", letterSpacing:.5, fontWeight:700, marginBottom:6 }}>{label}</div>
      {children}
    </div>
  );
}

function Val({ children }) {
  return <div style={{ fontSize:15, color:"#c8f0eb", fontWeight:600 }}>{children}</div>;
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root:    { fontFamily:"'Nunito',sans-serif", background:"#06202B", minHeight:"100vh", color:"#e0f7f5" },
  header:  { background:"linear-gradient(135deg,#06202B,#0a3040)", borderBottom:"1px solid rgba(122,226,207,0.1)", padding:"28px 28px 20px" },
  headerInner: { display:"flex", alignItems:"flex-start", gap:20, flexWrap:"wrap", marginBottom:16 },
  avatar:  { width:72, height:72, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:800, color:"#fff", flexShrink:0, position:"relative", letterSpacing:1 },
  avatarEditDot: { position:"absolute", bottom:0, right:0, width:22, height:22, borderRadius:"50%", background:"#077A7D", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, border:"2px solid #06202B" },
  heroName:  { fontFamily:"'Playfair Display',serif", fontSize:"clamp(20px,3vw,28px)", margin:"0 0 8px", color:"#f0fffe", lineHeight:1.2 },
  heroBadges:{ display:"flex", gap:8, flexWrap:"wrap" },
  badge:     { background:"rgba(122,226,207,0.12)", border:"1px solid rgba(122,226,207,0.25)", borderRadius:20, padding:"3px 12px", fontSize:12, color:"#7AE2CF", fontWeight:600 },
  editBtn:   { background:"transparent", border:"1px solid rgba(122,226,207,0.3)", borderRadius:10, padding:"10px 18px", color:"#7AE2CF", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Nunito',sans-serif", transition:"background .15s" },
  saveBtn:   { background:"linear-gradient(135deg,#077A7D,#0a9a9e)", color:"#fff", border:"none", borderRadius:10, padding:"10px 22px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Nunito',sans-serif" },
  cancelBtn: { background:"transparent", border:"1px solid #1a3a4a", borderRadius:10, padding:"10px 16px", color:"#4a8a8c", fontSize:13, cursor:"pointer", fontFamily:"'Nunito',sans-serif" },
  progressWrap: { maxWidth:560 },
  progressTrack:{ height:8, background:"rgba(122,226,207,0.1)", borderRadius:8, position:"relative", overflow:"visible" },
  progressFill: { height:"100%", background:"linear-gradient(90deg,#077A7D,#7AE2CF)", borderRadius:8, transition:"width 1s ease" },
  progressDot:  { position:"absolute", top:"50%", width:14, height:14, borderRadius:"50%", background:"#7AE2CF", transform:"translateY(-50%)", border:"3px solid #06202B", boxShadow:"0 0 8px #7AE2CF66", transition:"left 1s ease" },
  tabBar: { display:"flex", gap:0, borderBottom:"1px solid rgba(122,226,207,0.1)", background:"#06202B", overflowX:"auto", paddingLeft:16 },
  tab:    { padding:"14px 20px", border:"none", background:"transparent", cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"'Nunito',sans-serif", display:"flex", alignItems:"center", gap:7, whiteSpace:"nowrap", transition:"all .15s" },
  content:  { padding:"24px 28px", maxWidth:860 },
  grid2:    { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12, marginBottom:20 },
  infoCard: { background:"rgba(122,226,207,0.05)", border:"1px solid rgba(122,226,207,0.1)", borderRadius:14, padding:"18px 20px" },
  summaryStrip: { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", background:"rgba(7,122,125,0.1)", border:"1px solid rgba(7,122,125,0.2)", borderRadius:14, padding:"16px 20px", gap:16 },
  summaryItem:  { textAlign:"center" },
  formGrid: { display:"grid", gridTemplateColumns:"1fr", gap:0 },
  inp:      { width:"100%", background:"rgba(122,226,207,0.07)", border:"1px solid rgba(122,226,207,0.15)", borderRadius:8, padding:"10px 14px", color:"#e0f7f5", fontSize:14, fontFamily:"'Nunito',sans-serif", transition:"border-color .15s" },
  card:     { background:"rgba(122,226,207,0.04)", border:"1px solid rgba(122,226,207,0.1)", borderRadius:14, padding:"18px 20px" },
  toast:    { position:"fixed", top:20, right:20, zIndex:9999, padding:"12px 20px", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, boxShadow:"0 8px 24px rgba(0,0,0,0.4)" },
};