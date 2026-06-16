import { useState, useRef, useEffect } from "react";

const API = "http://localhost:5000";
const hdrs = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

/* ─── Language strings ───────────────────────────────────────────────────── */
const L = {
  en: {
    title:        "Prenatal Report Analyser",
    subtitle:     "Upload your lab report PDF — our AI agent will explain every value",
    upload:       "Drop your PDF here or click to browse",
    uploadSub:    "Supports text-based PDF lab reports",
    analysing:    ["Reading your report…", "Extracting test values…", "Cross-checking normal ranges…", "Generating your personalised explanation…"],
    analyseBtn:   "🔬 Analyse Report",
    langLabel:    "Report language",
    pastReports:  "Past Reports",
    noReports:    "No reports analysed yet.",
    riskLow:      "All values look good",
    riskMod:      "A few values need attention",
    riskHigh:     "Several values need review",
    normal:       "Normal",
    high:         "High",
    low:          "Low",
    unknown:      "Unclassified",
    normalRange:  "Normal range",
    yourValue:    "Your value",
    explanation:  "AI Explanation & Doctor Questions",
    tests:        "Test Results",
    summary:      "Summary",
    trimester:    (t) => `Trimester ${t}`,
    anomalies:    "Values needing attention",
    allNormal:    "All classified values are within normal range ✓",
    disclaimer:   "⚠️ This is for informational purposes only. Always consult your doctor.",
    close:        "✕ Close",
    viewReport:   "View Analysis",
    deleteOk:     "Report deleted",
  },
  ta: {
    title:        "மகப்பேறு அறிக்கை பகுப்பாய்வாளர்",
    subtitle:     "உங்கள் லேப் ரிப்போர்ட் PDF ஐ பதிவேற்றுங்கள் — AI ஒவ்வொரு மதிப்பையும் விளக்கும்",
    upload:       "PDF ஐ இங்கே இழுக்கவும் அல்லது கிளிக் செய்யவும்",
    uploadSub:    "உரை-அடிப்படையிலான PDF ஆதரிக்கப்படுகிறது",
    analysing:    ["அறிக்கையை படிக்கிறோம்…", "சோதனை மதிப்புகளை பிரித்தெடுக்கிறோம்…", "இயல்பான வரம்புகளை சரிபார்க்கிறோம்…", "உங்கள் விளக்கத்தை தயாரிக்கிறோம்…"],
    analyseBtn:   "🔬 அறிக்கையை பகுப்பாய்வு செய்",
    langLabel:    "அறிக்கை மொழி",
    pastReports:  "கடந்த அறிக்கைகள்",
    noReports:    "இதுவரை அறிக்கைகள் இல்லை.",
    riskLow:      "அனைத்து மதிப்புகளும் நல்லது",
    riskMod:      "சில மதிப்புகள் கவனிக்க வேண்டும்",
    riskHigh:     "பல மதிப்புகள் மதிப்பாய்வு தேவை",
    normal:       "இயல்பு",
    high:         "அதிகம்",
    low:          "குறைவு",
    unknown:      "வகைப்படுத்தப்படவில்லை",
    normalRange:  "இயல்பான வரம்பு",
    yourValue:    "உங்கள் மதிப்பு",
    explanation:  "AI விளக்கம் & மருத்துவர் கேள்விகள்",
    tests:        "சோதனை முடிவுகள்",
    summary:      "சுருக்கம்",
    trimester:    (t) => `${t}வது மூன்று மாத காலம்`,
    anomalies:    "கவனிக்க வேண்டிய மதிப்புகள்",
    allNormal:    "அனைத்து மதிப்புகளும் இயல்பான வரம்பில் உள்ளன ✓",
    disclaimer:   "⚠️ இது தகவல் நோக்கங்களுக்கு மட்டுமே. எப்போதும் உங்கள் மருத்துவரை அணுகவும்.",
    close:        "✕ மூடு",
    viewReport:   "பகுப்பாய்வு காண்க",
    deleteOk:     "அறிக்கை நீக்கப்பட்டது",
  },
};

const RISK_META = {
  LOW:      { color:"#22C55E", bg:"rgba(34,197,94,0.1)",   border:"#166534", icon:"✅" },
  MODERATE: { color:"#F97316", bg:"rgba(249,115,22,0.1)",  border:"#7C2D12", icon:"⚠️" },
  HIGH:     { color:"#EF4444", bg:"rgba(239,68,68,0.1)",   border:"#7F1D1D", icon:"🚨" },
};
const STATUS_META = {
  NORMAL:  { color:"#22C55E", bg:"rgba(34,197,94,0.08)",  label: (l) => L[l].normal  },
  HIGH:    { color:"#EF4444", bg:"rgba(239,68,68,0.08)",  label: (l) => L[l].high    },
  LOW:     { color:"#EAB308", bg:"rgba(234,179,8,0.08)",  label: (l) => L[l].low     },
  UNKNOWN: { color:"#64748B", bg:"rgba(100,116,139,0.08)",label: (l) => L[l].unknown },
};

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function ReportAnalyser() {
  const [lang,        setLang]        = useState("en");
  const [file,        setFile]        = useState(null);
  const [dragging,    setDragging]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [loadStep,    setLoadStep]    = useState(0);
  const [analysis,    setAnalysis]    = useState(null); // current result
  const [pastReports, setPastReports] = useState([]);
  const [error,       setError]       = useState(null);
  const [view,        setView]        = useState("upload"); // "upload" | "result" | "history"
  const fileRef = useRef();
  const T = L[lang];

  useEffect(() => { loadHistory(); }, []);

  // Rotate loading steps
  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setLoadStep(p => (p + 1) % T.analysing.length), 1800);
    return () => clearInterval(iv);
  }, [loading]);

  async function loadHistory() {
    try {
      const r = await fetch(`${API}/my-reports`, { headers: hdrs() });
      const d = await r.json();
      setPastReports(d.reports || []);
    } catch(e) { console.error(e); }
  }

  function handleFile(f) {
    if (!f || f.type !== "application/pdf") { setError("Please upload a PDF file."); return; }
    setFile(f);
    setError(null);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  async function toBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  async function handleAnalyse() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setLoadStep(0);
    try {
      const pdfBase64 = await toBase64(file);
      const r = await fetch(`${API}/analyse-report`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ pdfBase64, fileName: file.name, language: lang }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Analysis failed");
      setAnalysis(d.analysis);
      setView("result");
      loadHistory();
    } catch(e) {
      setError(e.message);
    }
    setLoading(false);
  }

  function openPastReport(report) {
    setAnalysis(report.analysis);
    setView("result");
  }

  /* ── Render ── */
  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=Lora:ital,wght@0,600;1,400&family=Noto+Sans+Tamil:wght@400;600;700&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:5px;} ::-webkit-scrollbar-thumb{background:#334155;border-radius:4px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .nav-tab:hover{color:#E2E8F0!important;}
        .report-row:hover{background:#1E293B!important;}
        .upload-zone:hover{border-color:#6366F1!important;background:rgba(99,102,241,0.05)!important;}
      `}</style>

      {/* ── Header ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>{T.title}</h1>
          <p style={S.subtitle}>{T.subtitle}</p>
        </div>

        {/* Language + Nav */}
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          {/* Lang toggle */}
          <div style={{ display:"flex", background:"#1E293B", borderRadius:20, padding:3, gap:2 }}>
            {["en","ta"].map(l => (
              <button key={l} onClick={() => setLang(l)} style={{
                background:  lang===l ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "transparent",
                border:      "none",
                color:       lang===l ? "#fff" : "#475569",
                borderRadius:16, padding:"5px 14px",
                fontSize:    l==="ta" ? 12 : 12, fontWeight:700, cursor:"pointer",
                fontFamily:  l==="ta" ? "'Noto Sans Tamil',sans-serif" : "'Sora',sans-serif",
                transition:  "all .2s",
              }}>
                {l==="en" ? "🇬🇧 EN" : "🇮🇳 தமிழ்"}
              </button>
            ))}
          </div>

          {/* Nav */}
          {["upload","history"].map(v => (
            <button key={v} className="nav-tab" onClick={() => setView(v)} style={{
              background: view===v ? "rgba(99,102,241,0.15)" : "transparent",
              border:     `1px solid ${view===v ? "#6366F1" : "#1E293B"}`,
              color:      view===v ? "#818CF8" : "#475569",
              borderRadius:8, padding:"7px 16px", fontSize:12, fontWeight:700,
              cursor:"pointer", fontFamily:"'Sora',sans-serif", transition:"all .2s",
            }}>
              {v === "upload" ? "📤 Upload" : `📂 ${T.pastReports}`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"0 24px 32px" }}>

        {/* ══ UPLOAD VIEW ══════════════════════════════════════════════════ */}
        {view === "upload" && (
          <div style={{ maxWidth:640, margin:"0 auto", animation:"fadeUp .3s ease" }}>

            {/* Drop zone */}
            <div
              className="upload-zone"
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current.click()}
              style={{
                border:       `2px dashed ${dragging ? "#6366F1" : file ? "#22C55E" : "#334155"}`,
                borderRadius: 16,
                padding:      "48px 24px",
                textAlign:    "center",
                cursor:       "pointer",
                background:   dragging ? "rgba(99,102,241,0.05)" : file ? "rgba(34,197,94,0.03)" : "#0F172A",
                transition:   "all .2s",
                marginBottom: 20,
              }}
            >
              <input ref={fileRef} type="file" accept=".pdf" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])} />
              <div style={{ fontSize:52, marginBottom:12 }}>{file ? "📄" : "📋"}</div>
              {file ? (
                <>
                  <div style={{ color:"#22C55E", fontWeight:700, fontSize:16 }}>{file.name}</div>
                  <div style={{ color:"#475569", fontSize:12, marginTop:4 }}>{(file.size/1024).toFixed(1)} KB · Click to change</div>
                </>
              ) : (
                <>
                  <div style={{ color:"#94A3B8", fontWeight:600, fontSize:15 }}>{T.upload}</div>
                  <div style={{ color:"#475569", fontSize:12, marginTop:6 }}>{T.uploadSub}</div>
                </>
              )}
            </div>

            {error && (
              <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid #7F1D1D", borderRadius:10, padding:"12px 16px", color:"#FCA5A5", fontSize:13, marginBottom:16 }}>
                ❌ {error}
              </div>
            )}

            <button
              onClick={handleAnalyse}
              disabled={!file || loading}
              style={{
                width:"100%", padding:"16px",
                background: !file || loading ? "#1E293B" : "linear-gradient(135deg,#6366F1,#8B5CF6)",
                color:  !file || loading ? "#475569" : "#fff",
                border: "none", borderRadius:12,
                fontSize:15, fontWeight:800,
                cursor: !file || loading ? "not-allowed" : "pointer",
                fontFamily:"'Sora',sans-serif",
                transition:"all .2s",
              }}
            >
              {loading ? (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
                  <div style={{ width:18, height:18, border:"3px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
                  <span style={{ fontFamily: lang==="ta" ? "'Noto Sans Tamil',sans-serif" : "'Sora',sans-serif" }}>
                    {T.analysing[loadStep]}
                  </span>
                </div>
              ) : T.analyseBtn}
            </button>

            {/* Info pills */}
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:20, justifyContent:"center" }}>
              {["🔒 Private & secure","🤖 AI-powered","🌐 Tamil & English","📊 Trimester-aware"].map(p => (
                <span key={p} style={{ background:"#0F172A", border:"1px solid #1E293B", borderRadius:20, padding:"4px 12px", fontSize:11, color:"#475569" }}>{p}</span>
              ))}
            </div>
          </div>
        )}

        {/* ══ RESULT VIEW ══════════════════════════════════════════════════ */}
        {view === "result" && analysis && (
          <div style={{ animation:"fadeUp .3s ease" }}>

            {/* Back button */}
            <button onClick={() => setView("upload")} style={{ background:"none", border:"1px solid #334155", color:"#64748B", borderRadius:8, padding:"6px 14px", fontSize:12, cursor:"pointer", marginBottom:20, fontFamily:"'Sora',sans-serif" }}>
              ← Back
            </button>

            {/* Risk Banner */}
            {(() => {
              const rm = RISK_META[analysis.summary?.riskLevel || "LOW"];
              const riskText = analysis.summary?.riskLevel === "LOW" ? T.riskLow : analysis.summary?.riskLevel === "MODERATE" ? T.riskMod : T.riskHigh;
              return (
                <div style={{ background:rm.bg, border:`1px solid ${rm.border}`, borderRadius:14, padding:"16px 20px", marginBottom:20, display:"flex", alignItems:"center", gap:14 }}>
                  <span style={{ fontSize:32 }}>{rm.icon}</span>
                  <div>
                    <div style={{ color:rm.color, fontWeight:800, fontSize:16, fontFamily: lang==="ta" ? "'Noto Sans Tamil'" : "'Lora',serif" }}>{riskText}</div>
                    <div style={{ color:"#64748B", fontSize:12, marginTop:3 }}>
                      {T.trimester(analysis.trimester)} · {analysis.summary?.totalTests || 0} tests · {analysis.summary?.anomalyCount || 0} flagged
                    </div>
                  </div>
                </div>
              );
            })()}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>

              {/* Left: Test Results */}
              <div>
                <h2 style={S.sectionTitle}>🧪 {T.tests}</h2>

                {/* Anomalies */}
                {analysis.anomalies?.length > 0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ color:"#F97316", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>{T.anomalies}</div>
                    {analysis.anomalies.map((item, i) => {
                      const sm = STATUS_META[item.status] || STATUS_META.UNKNOWN;
                      return (
                        <div key={i} style={{ background:sm.bg, border:`1px solid ${sm.color}22`, borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                            <span style={{ color:"#E2E8F0", fontWeight:700, fontSize:13 }}>{item.name}</span>
                            <span style={{ background:sm.color, color:"#fff", borderRadius:12, padding:"2px 10px", fontSize:10, fontWeight:800 }}>{sm.label(lang)}</span>
                          </div>
                          <div style={{ display:"flex", gap:16, marginTop:6 }}>
                            <div>
                              <div style={{ color:"#64748B", fontSize:10 }}>{T.yourValue}</div>
                              <div style={{ color:sm.color, fontWeight:800, fontSize:18 }}>{item.value} <span style={{ fontSize:11 }}>{item.unit}</span></div>
                            </div>
                            {item.normalRange && (
                              <div>
                                <div style={{ color:"#64748B", fontSize:10 }}>{T.normalRange}</div>
                                <div style={{ color:"#94A3B8", fontSize:13, marginTop:2 }}>{item.normalRange}</div>
                              </div>
                            )}
                          </div>
                          {item.warning && <div style={{ color:"#F97316", fontSize:11, marginTop:6 }}>⚠️ {item.warning}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Normal values */}
                {analysis.normals?.length > 0 ? (
                  <div>
                    <div style={{ color:"#22C55E", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>✓ {T.normal}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      {analysis.normals.map((item, i) => (
                        <div key={i} style={{ background:"rgba(34,197,94,0.05)", border:"1px solid rgba(34,197,94,0.15)", borderRadius:8, padding:"8px 10px" }}>
                          <div style={{ color:"#94A3B8", fontSize:10 }}>{item.name}</div>
                          <div style={{ color:"#22C55E", fontWeight:700, fontSize:14 }}>{item.value} <span style={{ fontSize:10, color:"#475569" }}>{item.unit}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  analysis.anomalies?.length === 0 && (
                    <div style={{ color:"#22C55E", fontSize:13, padding:"12px", background:"rgba(34,197,94,0.05)", borderRadius:10 }}>{T.allNormal}</div>
                  )
                )}
              </div>

              {/* Right: AI Explanation */}
              <div>
                <h2 style={S.sectionTitle}>🤖 {T.explanation}</h2>
                <div style={{ background:"#0F172A", border:"1px solid #1E293B", borderRadius:14, padding:"18px", fontSize:13, lineHeight:1.8, color:"#CBD5E1", whiteSpace:"pre-wrap", fontFamily: lang==="ta" ? "'Noto Sans Tamil',sans-serif" : "'Sora',sans-serif", maxHeight:500, overflowY:"auto" }}>
                  {analysis.explanation}
                </div>
                <div style={{ background:"rgba(234,179,8,0.08)", border:"1px solid rgba(234,179,8,0.2)", borderRadius:8, padding:"10px 14px", marginTop:12, fontSize:11, color:"#EAB308", fontFamily: lang==="ta" ? "'Noto Sans Tamil',sans-serif" : "'Sora',sans-serif" }}>
                  {T.disclaimer}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ HISTORY VIEW ═════════════════════════════════════════════════ */}
        {view === "history" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <h2 style={S.sectionTitle}>📂 {T.pastReports}</h2>
            {pastReports.length === 0 ? (
              <div style={{ color:"#475569", textAlign:"center", padding:"48px", fontSize:14 }}>{T.noReports}</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {pastReports.map(rep => {
                  const rm = rep.analysis?.summary?.riskLevel ? RISK_META[rep.analysis.summary.riskLevel] : RISK_META.LOW;
                  return (
                    <div key={rep.$id} className="report-row" style={{ background:"#0F172A", border:`1px solid #1E293B`, borderRadius:12, padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", transition:"background .15s", cursor:"pointer", borderLeft:`4px solid ${rm.color}` }}
                      onClick={() => openPastReport(rep)}>
                      <div>
                        <div style={{ color:"#E2E8F0", fontWeight:700, fontSize:14 }}>📄 {rep.fileName}</div>
                        <div style={{ color:"#475569", fontSize:12, marginTop:3 }}>
                          {T.trimester(rep.trimester)} · {rep.analysis?.summary?.totalTests || "?"} tests · {rep.analysis?.summary?.anomalyCount || 0} flagged
                          {" · "}{new Date(rep.createdAt).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ color:rm.color, fontSize:20 }}>{rm.icon}</span>
                        <span style={{ background:"linear-gradient(135deg,#6366F1,#8B5CF6)", color:"#fff", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700 }}>{T.viewReport}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const S = {
  root:         { fontFamily:"'Sora',sans-serif", background:"#0A0F1E", minHeight:"100vh", color:"#E2E8F0" },
  header:       { padding:"28px 24px 20px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:16, borderBottom:"1px solid #1E293B", marginBottom:24 },
  title:        { fontFamily:"'Lora',serif", fontSize:28, fontWeight:700, margin:0, color:"#F1F5F9" },
  subtitle:     { color:"#475569", fontSize:13, margin:"4px 0 0" },
  sectionTitle: { fontFamily:"'Lora',serif", fontSize:16, fontWeight:600, color:"#F1F5F9", margin:"0 0 14px" },
};