require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const sdk = require("node-appwrite");
const axios = require("axios");
const app = express();
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '50mb' }));

/* =============================
   APPWRITE CONFIG
============================= */

const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new sdk.Databases(client);

// ✅ Use sdk.ID and sdk.Query — NOT from "appwrite" (client SDK)
const { ID, Query } = sdk;

const { RtcTokenBuilder, RtcRole } = require("agora-access-token");

const APP_ID = process.env.AGORA_APP_ID;
const DATABASE_ID = process.env.DATABASE_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;
const nodemailer = require("nodemailer");
const CUSTOM_METRICS_COL = "custom_metrics";
const BABY_DEV_COL  = "baby_development";
const PREGNANCY_COL = "pregnancy_profiles";
const HEALTH_LOGS_COL = "health_logs";
const REMINDERS_COL = "health_reminders";


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

const { Vonage } = require("@vonage/server-sdk");
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET
});

/* =============================
   AUTH MIDDLEWARE
   ✅ One function, two names so all routes work
============================= */

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
}

// ✅ alias so baby-dev routes using authenticateToken also work
const authenticateToken = verifyToken;

function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN" && req.user?.role !== "DOCTOR") {
    return res.status(403).json({ message: "Admin/Doctor access required" });
  }
  next();
}

// ============================================================
//  ADD THESE ROUTES TO YOUR EXISTING Express server (index.js)
//  Place them alongside your other routes
// ============================================================


// ─── Ollama config ────────────────────────────────────────────────────────────
const OLLAMA_URL = "http://localhost:11434";   // default Ollama port
const OLLAMA_MODEL = "gemma3:4b";               // change to any model you have pulled
// ─── System prompt for pregnancy assistant ────────────────────────────────────
const PREGNANCY_SYSTEM_PROMPT = `You are Numi, a warm and knowledgeable pregnancy assistant for NurtureWell, a maternal health app used in India.

Your role:
- Answer pregnancy-related questions clearly and compassionately
- Provide evidence-based information about prenatal care, nutrition, symptoms, development
- Give culturally relevant advice suitable for Indian mothers
- Always recommend consulting a doctor for medical concerns
- Keep responses concise (3–5 sentences max unless a list is helpful)
- Use simple, friendly language — avoid heavy jargon
- Add a relevant emoji occasionally to keep tone warm

You do NOT:
- Diagnose conditions
- Replace professional medical advice
- Discuss topics unrelated to pregnancy, maternal health, or baby care

If asked to book an appointment, tell the user you'll help them book one and ask them to type "book appointment".`;

// ─── Route 1: Intent Detection ────────────────────────────────────────────────
// Determines if user wants to book an appointment or ask a pregnancy question
app.post("/api/chat-intent", async (req, res) => {
  const { message } = req.body;

  if (!message) return res.json({ intent: "GENERAL" });

  // Fast keyword check first (no need to hit Ollama for obvious cases)
  const lower = message.toLowerCase();
  const bookingKeywords = [
    "book", "appointment", "schedule", "doctor", "consult",
    "meeting", "visit", "see a doctor", "book an", "make an appointment"
  ];
  if (bookingKeywords.some((k) => lower.includes(k))) {
    return res.json({ intent: "BOOK_APPOINTMENT" });
  }

  // Use Ollama for ambiguous cases
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `Classify this message into exactly one category: BOOK_APPOINTMENT or PREGNANCY_QA.
Message: "${message}"
Reply with only the category name, nothing else.`,
        stream: false,
        options: { temperature: 0, num_predict: 10 },
      }),
    });

    const data = await response.json();
    const intent = data.response?.trim().toUpperCase();

    if (intent === "BOOK_APPOINTMENT") {
      return res.json({ intent: "BOOK_APPOINTMENT" });
    }
    return res.json({ intent: "PREGNANCY_QA" });
  } catch (err) {
    console.error("Intent detection error:", err.message);
    return res.json({ intent: "PREGNANCY_QA" });
  }
});

// ─── Route 2: Pregnancy Q&A Chat ─────────────────────────────────────────────
// Sends conversation to Ollama and returns the reply
app.post("/api/chat", async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // Build conversation history for context
  const conversationHistory = history
    .map((m) => `${m.role === "user" ? "User" : "Numi"}: ${m.content}`)
    .join("\n");

  const fullPrompt = conversationHistory
    ? `${conversationHistory}\nUser: ${message}\nNumi:`
    : `User: ${message}\nNumi:`;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: PREGNANCY_SYSTEM_PROMPT,
        prompt: fullPrompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 400,
          top_p: 0.9,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Ollama error:", errText);
      return res.status(500).json({ error: "Ollama request failed", detail: errText });
    }

    const data = await response.json();
    const reply = data.response?.trim() || "I'm not sure about that. Please consult your doctor.";

    return res.json({ reply });
  } catch (err) {
    console.error("Chat route error:", err.message);

    // Friendly error if Ollama isn't running
    if (err.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "Ollama is not running",
        reply: "I'm offline right now. Please make sure Ollama is running by typing `ollama serve` in your terminal.",
      });
    }

    return res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  OPTIONAL: Streaming version (for real-time token display)
//  Uncomment if you want character-by-character streaming
// ============================================================

/*
app.post("/api/chat-stream", async (req, res) => {
  const { message, history = [] } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const conversationHistory = history
    .map((m) => `${m.role === "user" ? "User" : "Numi"}: ${m.content}`)
    .join("\n");

  const fullPrompt = conversationHistory
    ? `${conversationHistory}\nUser: ${message}\nNumi:`
    : `User: ${message}\nNumi:`;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: PREGNANCY_SYSTEM_PROMPT,
        prompt: fullPrompt,
        stream: true,
        options: { temperature: 0.7, num_predict: 400 },
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.response) {
            res.write(`data: ${JSON.stringify({ token: json.response })}\n\n`);
          }
          if (json.done) {
            res.write(`data: [DONE]\n\n`);
          }
        } catch {}
      }
    }
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});
*/
/* =====================================================================
   HEALTH LOGS ROUTES — add these to your existing server.js
   Collection: health_logs
   ===================================================================== */
 
 app.get("/health-logs", verifyToken, async (req, res) => {
  try {
    const queries = [sdk.Query.orderAsc("date"), sdk.Query.limit(200)];
 
    if (req.user.role === "PATIENT") {
      queries.push(sdk.Query.equal("userId", req.user.userId));
    } else if (req.query.userId) {
      queries.push(sdk.Query.equal("userId", req.query.userId));
    }
 
    const result = await databases.listDocuments(DATABASE_ID, HEALTH_LOGS_COL, queries);
 
    // ✅ Parse customValues JSON string back into an object for each log
    const logs = result.documents.map(log => ({
      ...log,
      customValues: (() => {
        try { return log.customValues ? JSON.parse(log.customValues) : {}; }
        catch { return {}; }
      })(),
    }));
 
    res.json({ logs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch health logs" });
  }
});
 
 
// ============================================================
//  STEP 3: Replace your existing health-logs POST route with this
//  (find: app.post("/health-logs", verifyToken, async (req, res) => {)
// ============================================================
 
app.post("/health-logs", verifyToken, async (req, res) => {
  try {
    const { date, systolic, diastolic, weight, notes, customValues } = req.body;
 
    if (!date) return res.status(400).json({ message: "Date is required" });
 
    if (systolic  && (systolic  < 60  || systolic  > 250)) return res.status(400).json({ message: "Systolic out of range (60–250)" });
    if (diastolic && (diastolic < 40  || diastolic > 150)) return res.status(400).json({ message: "Diastolic out of range (40–150)" });
    if (weight    && (weight    < 30  || weight    > 200)) return res.status(400).json({ message: "Weight out of range (30–200 kg)" });
 
    const doc = await databases.createDocument(
      DATABASE_ID,
      HEALTH_LOGS_COL,
      sdk.ID.unique(),
      {
        userId:       req.user.userId,
        date,
        systolic:     systolic  ? parseInt(systolic)  : null,
        diastolic:    diastolic ? parseInt(diastolic) : null,
        weight:       weight    ? parseFloat(weight)  : null,
        notes:        notes || null,
        // ✅ Serialise custom metric values as a JSON string
        customValues: customValues && Object.keys(customValues).length > 0
          ? JSON.stringify(customValues)
          : null,
      }
    );
 
    // Auto-alert: check for 2+ recent high BP readings
    const recentLogs = await databases.listDocuments(
      DATABASE_ID,
      HEALTH_LOGS_COL,
      [
        sdk.Query.equal("userId", req.user.userId),
        sdk.Query.orderDesc("date"),
        sdk.Query.limit(3),
      ]
    );
 
    const highBPCount = recentLogs.documents.filter(
      l => l.systolic >= 140 || l.diastolic >= 90
    ).length;
 
    const alert = highBPCount >= 2
      ? { preeclampsia: true, message: "BP ≥140/90 detected in multiple readings. Possible preeclampsia risk." }
      : null;
 
    res.json({ success: true, log: doc, alert });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to save health log" });
  }
});

app.get("/custom-metrics", verifyToken, async (req, res) => {
  try {
    const queries = [];
 
    if (req.user.role === "PATIENT") {
      queries.push(Query.equal("userId", req.user.userId));
    } else if (req.query.userId) {
      queries.push(Query.equal("userId", req.query.userId));
    }
 
    queries.push(Query.orderAsc("$createdAt"));
 
    const result = await databases.listDocuments(DATABASE_ID, CUSTOM_METRICS_COL, queries);
    res.json({ metrics: result.documents });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to fetch custom metrics" });
  }
});
 
// ── POST /custom-metrics  (create a new metric definition) ───────────────────

app.post("/custom-metrics", verifyToken, async (req, res) => {
  try {
    const { name, unit, baseline, rangeLow, rangeHigh, color, targetUserId } = req.body;
 
    if (!name) return res.status(400).json({ message: "Metric name is required" });
 
    // Doctors can create metrics for a specific patient via targetUserId
    // Patients always create for themselves
    const ownerUserId = req.user.role === "PATIENT"
      ? req.user.userId
      : (targetUserId || req.user.userId);
 
    const doc = await databases.createDocument(
      DATABASE_ID,
      CUSTOM_METRICS_COL,
      ID.unique(),
      {
        userId:    ownerUserId,      // ← metric belongs to this user (the patient)
        name,
        unit:      unit      || null,
        baseline:  baseline  ? parseFloat(baseline)  : null,
        rangeLow:  rangeLow  ? parseFloat(rangeLow)  : null,
        rangeHigh: rangeHigh ? parseFloat(rangeHigh) : null,
        color:     color     || "#A78BFA",
      }
    );
    res.json({ success: true, metric: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to create custom metric" });
  }
});
 
// ── PATCH /custom-metrics/:id  (edit name / baseline / range / colour) ───────
app.patch("/custom-metrics/:id", verifyToken, async (req, res) => {
  try {
    const { name, unit, baseline, rangeLow, rangeHigh, color } = req.body;
 
    // Ownership check
    const existing = await databases.getDocument(DATABASE_ID, CUSTOM_METRICS_COL, req.params.id);
    if (existing.userId !== req.user.userId && req.user.role !== "DOCTOR") {
      return res.status(403).json({ message: "Not authorized" });
    }
 
    const doc = await databases.updateDocument(
      DATABASE_ID,
      CUSTOM_METRICS_COL,
      req.params.id,
      {
        name,
        unit:      unit      || null,
        baseline:  baseline  ? parseFloat(baseline)  : null,
        rangeLow:  rangeLow  ? parseFloat(rangeLow)  : null,
        rangeHigh: rangeHigh ? parseFloat(rangeHigh) : null,
        color:     color     || "#A78BFA",
      }
    );
    res.json({ success: true, metric: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to update custom metric" });
  }
});
 
// ── DELETE /custom-metrics/:id ────────────────────────────────────────────────
app.delete("/custom-metrics/:id", verifyToken, async (req, res) => {
  try {
    const existing = await databases.getDocument(DATABASE_ID, CUSTOM_METRICS_COL, req.params.id);
    if (existing.userId !== req.user.userId && req.user.role !== "DOCTOR") {
      return res.status(403).json({ message: "Not authorized" });
    }
 
    await databases.deleteDocument(DATABASE_ID, CUSTOM_METRICS_COL, req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to delete custom metric" });
  }
});
 
 
// ── DELETE a log entry ────────────────────────────────────────────────────────
app.delete("/health-logs/:id", verifyToken, async (req, res) => {
  try {
    // Verify ownership before deleting
    const doc = await databases.getDocument(DATABASE_ID, HEALTH_LOGS_COL, req.params.id);
 
    if (doc.userId !== req.user.userId && req.user.role !== "DOCTOR") {
      return res.status(403).json({ message: "Not authorized to delete this log" });
    }
 
    await databases.deleteDocument(DATABASE_ID, HEALTH_LOGS_COL, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete log" });
  }
});
 
// ── GET summary stats for a patient (for doctor portal) ──────────────────────
app.get("/health-logs/summary/:userId", verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await databases.listDocuments(
      DATABASE_ID,
      HEALTH_LOGS_COL,
      [sdk.Query.equal("userId", req.params.userId), sdk.Query.orderDesc("date"), sdk.Query.limit(50)]
    );
 
    const logs = result.documents;
    const bpLogs    = logs.filter(l => l.systolic && l.diastolic);
    const weightLogs = logs.filter(l => l.weight);
 
    const highBP       = bpLogs.filter(l => l.systolic >= 140 || l.diastolic >= 90);
    const recentHighBP = bpLogs.slice(0, 3).filter(l => l.systolic >= 140 || l.diastolic >= 90);
 
    const avgSys = bpLogs.length
      ? Math.round(bpLogs.reduce((a, l) => a + l.systolic, 0) / bpLogs.length)
      : null;
    const avgDia = bpLogs.length
      ? Math.round(bpLogs.reduce((a, l) => a + l.diastolic, 0) / bpLogs.length)
      : null;
 
    const firstWeight  = weightLogs[weightLogs.length - 1]?.weight || null;
    const latestWeight = weightLogs[0]?.weight || null;
    const weightGained = firstWeight && latestWeight ? +(latestWeight - firstWeight).toFixed(1) : null;
 
    res.json({
      totalLogs:      logs.length,
      avgBP:          avgSys ? `${avgSys}/${avgDia}` : null,
      latestBP:       bpLogs[0] ? `${bpLogs[0].systolic}/${bpLogs[0].diastolic}` : null,
      highBPCount:    highBP.length,
      preeclampsiaRisk: recentHighBP.length >= 2,
      firstWeight,
      latestWeight,
      weightGained,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to get summary" });
  }
});

/* =============================
   BABY DEVELOPMENT ROUTES
============================= */

// GET all weeks (patient gets their own; doctor gets all or by userId param)
app.get("/baby-development", authenticateToken, async (req, res) => {
  try {
    const queries = [Query.orderAsc("week"), Query.limit(40)];

    // If a doctor passes ?userId=xxx, filter by that patient
    const targetUserId = req.query.userId;
    if (targetUserId) {
      queries.push(Query.equal("userId", targetUserId));
    } else if (req.user.role === "PATIENT") {
      // Patients only see their own data
      queries.push(Query.equal("userId", req.user.userId));
    }
    // Doctors/Admins with no userId param get ALL weeks (template data)

    const result = await databases.listDocuments(DATABASE_ID, BABY_DEV_COL, queries);
    res.json({ weeks: result.documents });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch baby development data" });
  }
});

// GET single week by week number
app.get("/baby-development/week/:week", authenticateToken, async (req, res) => {
  try {
    const weekNum = parseInt(req.params.week);
    const queries = [Query.equal("week", weekNum)];

    if (req.user.role === "PATIENT") {
      queries.push(Query.equal("userId", req.user.userId));
    }

    const result = await databases.listDocuments(DATABASE_ID, BABY_DEV_COL, queries);
    if (!result.documents.length) {
      return res.status(404).json({ message: "Week not found" });
    }
    res.json({ week: result.documents[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch week data" });
  }
});

// GET all patients list (for admin to select patient)
app.get("/patients-list", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await databases.listDocuments(
      DATABASE_ID,
      PREGNANCY_COL,
      [Query.limit(100)]
    );

    // Enrich with user names
    const enriched = await Promise.all(
      result.documents.map(async (profile) => {
        try {
          const userResult = await databases.listDocuments(
            DATABASE_ID,
            process.env.USERS_COLLECTION_ID,
            [Query.equal("$id", profile.userId)]
          );
          const user = userResult.documents[0];
          return {
            ...profile,
            userName: user?.name || "Unknown",
            userEmail: user?.email || ""
          };
        } catch {
          return { ...profile, userName: "Unknown", userEmail: "" };
        }
      })
    );

    res.json({ patients: enriched });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch patients" });
  }
});

// POST create week entry (admin assigns to a specific patient via userId)
app.post("/baby-development", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      userId,  // ✅ which patient this entry belongs to
      week, fruit, fruitEmoji, sizeCm, weightGrams,
      milestone, systemDeveloping, healthTip, funFact, trimester
    } = req.body;

    const doc = await databases.createDocument(
      DATABASE_ID,
      BABY_DEV_COL,
      ID.unique(),
      { userId, week, fruit, fruitEmoji, sizeCm, weightGrams, milestone, systemDeveloping, healthTip, funFact, trimester }
    );
    res.json({ success: true, week: doc });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create week data" });
  }
});

// PUT update existing week entry
app.put("/baby-development/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      userId,
      week, fruit, fruitEmoji, sizeCm, weightGrams,
      milestone, systemDeveloping, healthTip, funFact, trimester
    } = req.body;

    const updateData = { week, fruit, fruitEmoji, sizeCm, weightGrams, milestone, systemDeveloping, healthTip, funFact, trimester };
    if (userId) updateData.userId = userId;  // allow reassigning patient

    const doc = await databases.updateDocument(
      DATABASE_ID,
      BABY_DEV_COL,
      req.params.id,
      updateData
    );
    res.json({ success: true, week: doc });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update week data" });
  }
});

// POST seed all 40 weeks for a specific patient (bulk operation)
app.post("/baby-development/seed/:userId", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { weeks } = req.body; // array of 40 week objects

    // Check which weeks already exist for this patient
    const existing = await databases.listDocuments(
      DATABASE_ID,
      BABY_DEV_COL,
      [Query.equal("userId", userId), Query.limit(40)]
    );
    const existingWeekNums = existing.documents.map(d => d.week);

    const results = [];
    for (const w of weeks) {
      const existingDoc = existing.documents.find(d => d.week === w.week);
      if (existingDoc) {
        // Update
        const doc = await databases.updateDocument(
          DATABASE_ID, BABY_DEV_COL, existingDoc.$id,
          { ...w, userId }
        );
        results.push(doc);
      } else {
        // Create
        const doc = await databases.createDocument(
          DATABASE_ID, BABY_DEV_COL, ID.unique(),
          { ...w, userId }
        );
        results.push(doc);
      }
    }

    res.json({ success: true, count: results.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Seed failed: " + error.message });
  }
});

/* =============================
   PREGNANCY PROFILE
============================= */

app.post("/pregnancy-profile", verifyToken, async (req, res) => {
  try {
    const { LMP, expectedDueDate, pregnancyWeek, pregnancyMonth, firstPregnancy, existingConditions } = req.body;

    await databases.createDocument(
      process.env.DATABASE_ID,
      "pregnancy_profiles",
      sdk.ID.unique(),
      {
        userId: req.user.userId,
        LMP,
        expectedDueDate,
        pregnancyWeek: Number(pregnancyWeek),
        pregnancyMonth: Number(pregnancyMonth),
        firstPregnancy: Boolean(firstPregnancy),
        existingConditions
      }
    );

    res.json({ message: "Pregnancy Profile Created Successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create profile" });
  }
});

// GET pregnancy profile for logged-in patient
app.get("/pregnancy-profile", verifyToken, async (req, res) => {
  try {
    const result = await databases.listDocuments(
      DATABASE_ID,
      PREGNANCY_COL,
      [Query.equal("userId", req.user.userId)]
    );
    if (!result.documents.length) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.json({ profile: result.documents[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

/* =============================
   CLAUDE / SARVAM AI PROXY
============================= */
let pdfjsLib;
(async () => { pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs"); })();

// ── Paste this to REPLACE your existing app.post('/api/claude', ...) in server.js ──

app.post('/api/claude', async (req, res) => {
  try {
    let userMessage = "";
    const messages = req.body.messages;
    const langCode = req.body.language || "en"; // ← receive language from frontend

    const LANG_MAP = {
      en: "English",
      ta: "Tamil",
      hi: "Hindi",
      ml: "Malayalam",
      te: "Telugu",
      kn: "Kannada",
      bn: "Bengali",
      mr: "Marathi",
    };
    const langName = LANG_MAP[langCode] || "English";

    const firstMessage = messages[0];

    if (Array.isArray(firstMessage.content)) {
      let extractedText = "";
      let promptText = "";

      for (const block of firstMessage.content) {
        if (block.type === "document" && block.source?.type === "base64") {
          const buffer = Buffer.from(block.source.data, "base64");
          const uint8Array = new Uint8Array(buffer);
          const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
          const pdf = await loadingTask.promise;
          let text = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            content.items.forEach(item => { text += item.str + "\n"; });
          }
          extractedText = text;
        }
        if (block.type === "text") promptText = block.text;
      }

      userMessage = `${promptText}\n\nHere is the medical report:\n----------------------------\n${extractedText}\n----------------------------`;
    } else {
      userMessage = firstMessage.content;
    }

    // ── Call Sarvam AI with language instruction ──────────────────────────────
    const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API-Subscription-Key": process.env.SARVAM_API_KEY,
      },
      body: JSON.stringify({
        model: "sarvam-30b",
        messages: [{ role: "user", content: userMessage }],
        max_tokens: 1500,
        // Sarvam supports a language hint — pass it when not English
        ...(langCode !== "en" && { language: langCode }),
      }),
    });

    const data = await response.json();
    // const text = data.choices?.[0]?.message?.content || "";
    const message = data.choices?.[0]?.message || {};
    const text =
      message.content ??
      message.reasoning_content ??
      "";
    if (!text) throw new Error("No response from Sarvam");
    res.json({ content: [{ text }] });

  } catch (err) {
    console.error("Sarvam API Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =============================
   REGISTER
============================= */

app.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await databases.listDocuments(
      process.env.DATABASE_ID,
      process.env.USERS_COLLECTION_ID,
      [sdk.Query.equal("email", email)]
    );

    if (existingUser.total > 0) return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    await databases.createDocument(
      process.env.DATABASE_ID,
      process.env.USERS_COLLECTION_ID,
      sdk.ID.unique(),
      { name, email, password: hashedPassword, role: role || "PATIENT" }
    );

    res.json({ message: "User Registered Successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Registration Failed" });
  }
});

/* =============================
   LOGIN
============================= */

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const userList = await databases.listDocuments(
      process.env.DATABASE_ID,
      process.env.USERS_COLLECTION_ID,
      [sdk.Query.equal("email", email)]
    );

    if (userList.total === 0) return res.status(400).json({ message: "User not found" });

    const user = userList.documents[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
      { userId: user.$id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token, role: user.role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Login Failed" });
  }
});

/* =============================
   APPOINTMENTS
============================= */

app.post("/book-appointment", verifyToken, async (req, res) => {
  try {
    const {
      doctorId, appointmentDate, appointmentTime,
      consultationType, reason,
      patientEmail, patientPhone,
      doctorEmail, doctorName,   // ← add these two fields from your frontend
    } = req.body;
 
    const userId = req.user.userId;
 
    let audioChannelName = null;
    let audioToken       = null;
    let audioCallLink    = null;   // ← new: the full joinable URL
    let videoRoomUrl     = null;
 
    // ── AUDIO: generate token + call link + send emails ──────────────────────
    if (consultationType === "AUDIO") {
      const channelName        = `audio-${Math.random().toString(36).substring(2, 10)}`;
      const uid                = 0;
      const role               = RtcRole.PUBLISHER;
      const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 3600;
 
      const token = RtcTokenBuilder.buildTokenWithUid(
        APP_ID,
        APP_CERTIFICATE,
        channelName,
        uid,
        role,
        privilegeExpiredTs
      );
 
      audioChannelName = channelName;
      audioToken       = token;
      audioCallLink    = `http://localhost:5173/join-call?channel=${encodeURIComponent(channelName)}&token=${encodeURIComponent(token)}`;
 
      // ── Email to patient ──────────────────────────────────────────────────
      await transporter.sendMail({
        from:    process.env.MAIL_USER,
        to:      patientEmail,
        subject: "Your Audio Consultation Link — NurtureWell",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #f0e6f6;">
            <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;">
              <div style="font-size:48px;margin-bottom:8px;">📞</div>
              <h1 style="color:#fff;margin:0;font-size:22px;">Audio Consultation Scheduled</h1>
            </div>
            <div style="padding:28px 32px;">
              <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">Hello,</p>
              <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 8px;">
                Your audio consultation has been booked.
              </p>
              <table style="width:100%;margin:16px 0;font-size:14px;color:#555;">
                <tr><td style="padding:6px 0;font-weight:600;width:120px;">Doctor</td><td>${doctorName || "Your Doctor"}</td></tr>
                <tr><td style="padding:6px 0;font-weight:600;">Date</td><td>${appointmentDate}</td></tr>
                <tr><td style="padding:6px 0;font-weight:600;">Time</td><td>${appointmentTime}</td></tr>
              </table>
              <div style="text-align:center;margin:24px 0;">
                <a href="${audioCallLink}"
                   style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                  🎧 Join Audio Call
                </a>
              </div>
              <p style="color:#999;font-size:12px;text-align:center;">This link is valid for 1 hour from the time of booking.</p>
            </div>
          </div>
        `,
      });
 
      // ── Email to doctor ───────────────────────────────────────────────────
      if (doctorEmail) {
        await transporter.sendMail({
          from:    process.env.MAIL_USER,
          to:      doctorEmail,
          subject: `Patient Audio Consultation — ${patientEmail}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #f0e6f6;">
              <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;">
                <div style="font-size:48px;margin-bottom:8px;">📞</div>
                <h1 style="color:#fff;margin:0;font-size:22px;">Incoming Audio Consultation</h1>
              </div>
              <div style="padding:28px 32px;">
                <p style="color:#333;font-size:15px;margin:0 0 8px;">Hello <strong>${doctorName || "Doctor"}</strong>,</p>
                <p style="color:#555;font-size:14px;margin:0 0 16px;">A patient has booked an audio consultation with you.</p>
                <table style="width:100%;margin:16px 0;font-size:14px;color:#555;">
                  <tr><td style="padding:6px 0;font-weight:600;width:120px;">Patient</td><td>${patientEmail}</td></tr>
                  <tr><td style="padding:6px 0;font-weight:600;">Date</td><td>${appointmentDate}</td></tr>
                  <tr><td style="padding:6px 0;font-weight:600;">Time</td><td>${appointmentTime}</td></tr>
                  <tr><td style="padding:6px 0;font-weight:600;">Reason</td><td>${reason || "Not specified"}</td></tr>
                </table>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${audioCallLink}"
                     style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                    🎧 Join Audio Call
                  </a>
                </div>
                <p style="color:#999;font-size:12px;text-align:center;">This link is valid for 1 hour from the time of booking.</p>
              </div>
            </div>
          `,
        });
      }
    }
 
    // ── VIDEO: generate Whereby room ─────────────────────────────────────────
    if (consultationType === "VIDEO") {
      const expiryTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const response = await axios.post(
        "https://api.whereby.dev/v1/meetings",
        { endDate: expiryTime, fields: ["hostRoomUrl"] },
        { headers: { Authorization: `Bearer ${process.env.WHEREBY_API_KEY}`, "Content-Type": "application/json" } }
      );
      videoRoomUrl = response.data.hostRoomUrl;
    }
 
    // ── Save appointment to DB ────────────────────────────────────────────────
    const appointment = await databases.createDocument(
      DATABASE_ID,
      "appointments",
      ID.unique(),
      {
        userId,
        doctorId,
        appointmentDate,
        appointmentTime,
        consultationType,
        reason,
        status:           "BOOKED",
        audioChannelName: audioChannelName || null,
        audioToken:       audioToken       || null,
        audioCallLink:    audioCallLink    || null,   // ← store the full link too
        videoRoomUrl:     videoRoomUrl     || null,
        patientEmail,
        patientPhone,
      }
    );
 
    // ── Confirmation email (VIDEO / IN-PERSON) — audio already handled above ─
    if (consultationType !== "AUDIO") {
      await transporter.sendMail({
        from:    process.env.MAIL_USER,
        to:      patientEmail,
        subject: "Appointment Confirmed — NurtureWell",
        text:    `Your appointment has been booked.\n\nDate: ${appointmentDate}\nTime: ${appointmentTime}\nType: ${consultationType}${videoRoomUrl ? `\nVideo Link: ${videoRoomUrl}` : ""}`,
      });
    }
 
    // ── SMS ───────────────────────────────────────────────────────────────────
    try {
      const smsText = consultationType === "AUDIO"
        ? `Your audio consultation is on ${appointmentDate} at ${appointmentTime}. Check your email for the call link.`
        : `Your appointment is confirmed on ${appointmentDate} at ${appointmentTime}.`;
      await vonage.sms.send({ to: patientPhone, from: "NurtureWell", text: smsText });
    } catch (smsError) {
      console.error("SMS error:", smsError);
    }
 
    res.json({
      success:          true,
      appointmentId:    appointment.$id,
      audioChannelName,
      audioToken,
      audioCallLink,    // ← returned to frontend if needed
      videoRoomUrl,
    });
 
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/my-appointments", verifyToken, async (req, res) => {
  try {
    const response = await databases.listDocuments(DATABASE_ID, "appointments", [Query.equal("userId", req.user.userId)]);
    res.json({ appointments: response.documents });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching appointments" });
  }
});

app.get("/doctor/appointments", verifyToken, async (req, res) => {
  try {
    const response = await databases.listDocuments(DATABASE_ID, "appointments", [Query.equal("doctorId", req.user.userId)]);
    res.json(response.documents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching appointments" });
  }
});

app.post("/doctor/schedule", verifyToken, async (req, res) => {
  try {
    const { appointmentId } = req.body;
    const appointment = await databases.updateDocument(
      DATABASE_ID, "appointments", appointmentId,
      { status: "COMPLETED" }  // ← changed from "CONFIRMED"
    );
    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: appointment.patientEmail,
      subject: "Doctor Confirmed Appointment",
      text: `Your appointment has been confirmed.\n\nDate: ${appointment.appointmentDate}\nTime: ${appointment.appointmentTime}\nJoin: ${appointment.videoRoomUrl || "Audio consultation"}`
    });
    res.json({ message: "Appointment confirmed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error confirming appointment" });
  }
});

app.put("/reschedule-appointment/:id", verifyToken, async (req, res) => {
  try {
    const { appointmentDate, appointmentTime } = req.body;
    const updated = await databases.updateDocument(DATABASE_ID, "appointments", req.params.id, { appointmentDate, appointmentTime, status: "RESCHEDULED" });
    res.json({ success: true, updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

app.put("/cancel-appointment/:id", verifyToken, async (req, res) => {
  try {
    await databases.updateDocument(DATABASE_ID, "appointments", req.params.id, { status: "CANCELLED" });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

/* =============================
   DOCTORS
============================= */

app.post("/doctor/register", async (req, res) => {
  try {
    const { name, email, password, specialization, experienceYears, qualification, phone, clinicAddress, consultationFee, availableDays, availableTime, licenseNumber } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await databases.createDocument(process.env.DATABASE_ID, process.env.USERS_COLLECTION_ID, sdk.ID.unique(), { name, email, password: hashedPassword, role: "DOCTOR" });
    await databases.createDocument(process.env.DATABASE_ID, process.env.DOCTOR_COLLECTION, sdk.ID.unique(), { name, doctorId: user.$id, specialization, experienceYears, qualification, phone, clinicAddress, consultationFee: parseInt(consultationFee), availableDays, availableTime, licenseNumber });

    res.json({ message: "Doctor registered successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating doctor" });
  }
});

app.get("/doctors", async (req, res) => {
  try {
    const list = await databases.listDocuments(DATABASE_ID, process.env.DOCTOR_COLLECTION);
    res.json({ success: true, doctors: list.documents });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

/* =============================
   MISC
============================= */

app.get("/profile", verifyToken, (req, res) => {
  res.json({ message: "Protected data accessed", userId: req.user.userId, role: req.user.role });
});
// ============================================================
//  HEALTH REMINDERS — routes to paste into your server.js
//  Paste BEFORE app.listen(...)
// ============================================================


// ── GET /reminders  (patient: own | doctor: all or ?userId=xxx) ──────────────
app.get("/reminders", verifyToken, async (req, res) => {
  try {
    const queries = [];
    if (req.user.role === "PATIENT") {
      queries.push(Query.equal("userId", req.user.userId));
    } else if (req.query.userId) {
      queries.push(Query.equal("userId", req.query.userId));
    }
    queries.push(Query.orderAsc("reminderTime"));

    const result = await databases.listDocuments(DATABASE_ID, REMINDERS_COL, queries);
    res.json({ success: true, reminders: result.documents });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── POST /reminders  (doctor creates for patient | patient creates own) ──────
app.post("/reminders", verifyToken, async (req, res) => {
  try {
    const {
      targetUserId, title, message, reminderTime,
      frequency, category, isActive
    } = req.body;

    const userId = req.user.role === "PATIENT" ? req.user.userId : targetUserId;
    if (!userId) return res.status(400).json({ success: false, message: "userId required" });

    const doc = await databases.createDocument(DATABASE_ID, REMINDERS_COL, ID.unique(), {
      userId,
      title:        title       || "Health Reminder",
      message:      message     || "",
      reminderTime: reminderTime || "09:00",   // HH:MM 24hr
      frequency:    frequency   || "daily",    // daily | weekly | once
      category:     category    || "general",  // general | medication | appointment | exercise | nutrition | water
      isActive:     isActive !== false,
      createdBy:    req.user.userId,
      lastSentAt:   null,
    });
    res.json({ success: true, reminder: doc });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── PUT /reminders/:id  (toggle active / edit) ───────────────────────────────
app.put("/reminders/:id", verifyToken, async (req, res) => {
  try {
    const { title, message, reminderTime, frequency, category, isActive } = req.body;
    const updates = {};
    if (title        !== undefined) updates.title        = title;
    if (message      !== undefined) updates.message      = message;
    if (reminderTime !== undefined) updates.reminderTime = reminderTime;
    if (frequency    !== undefined) updates.frequency    = frequency;
    if (category     !== undefined) updates.category     = category;
    if (isActive     !== undefined) updates.isActive     = isActive;

    const doc = await databases.updateDocument(DATABASE_ID, REMINDERS_COL, req.params.id, updates);
    res.json({ success: true, reminder: doc });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── DELETE /reminders/:id ────────────────────────────────────────────────────
app.delete("/reminders/:id", verifyToken, async (req, res) => {
  try {
    await databases.deleteDocument(DATABASE_ID, REMINDERS_COL, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── POST /reminders/send-now/:id  (manual trigger for testing) ───────────────
app.post("/reminders/send-now/:id", verifyToken, async (req, res) => {
  try {
    const reminder = await databases.getDocument(DATABASE_ID, REMINDERS_COL, req.params.id);

    // Get patient email
    const userDoc = await databases.getDocument(DATABASE_ID, "users", reminder.userId);
    const email   = userDoc.email;

    await sendReminderEmail(email, userDoc.name, reminder);

    // Update lastSentAt
    await databases.updateDocument(DATABASE_ID, REMINDERS_COL, req.params.id, {
      lastSentAt: new Date().toISOString(),
    });

    res.json({ success: true, message: `Reminder sent to ${email}` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── POST /reminders/trigger-daily  (called by n8n / cron every minute) ───────
// n8n hits this endpoint → server checks which reminders are due → sends emails
app.post("/reminders/trigger-daily", async (req, res) => {
  // Simple secret header check so random people can't spam your server
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const now   = new Date();
    const hhmm  = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const today = now.toISOString().slice(0,10);
    const dow   = now.getDay(); // 0=Sun … 6=Sat

    // Fetch all active reminders scheduled for this exact HH:MM
    const result = await databases.listDocuments(DATABASE_ID, REMINDERS_COL, [
      Query.equal("isActive", true),
      Query.equal("reminderTime", hhmm),
    ]);

    let sent = 0;
    for (const reminder of result.documents) {
      // Skip if already sent today (for daily) or this week (weekly)
      if (reminder.lastSentAt) {
        const lastDate = reminder.lastSentAt.slice(0,10);
        if (reminder.frequency === "daily"  && lastDate === today)  continue;
        if (reminder.frequency === "weekly" && lastDate >= getWeekStart(now)) continue;
        if (reminder.frequency === "once"   && lastDate)            continue;
      }

      try {
        const userDoc = await databases.getDocument(DATABASE_ID, "users", reminder.userId);
        await sendReminderEmail(userDoc.email, userDoc.name, reminder);
        await databases.updateDocument(DATABASE_ID, REMINDERS_COL, reminder.$id, {
          lastSentAt: new Date().toISOString(),
        });
        sent++;
      } catch (err) {
        console.error(`Reminder send failed for ${reminder.$id}:`, err.message);
      }
    }

    res.json({ success: true, sent, checkedAt: hhmm });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Helper: send reminder email via your existing nodemailer transporter ──────
async function sendReminderEmail(toEmail, toName, reminder) {
  const CATEGORY_EMOJI = {
    general:     "💊",
    medication:  "💊",
    appointment: "📅",
    exercise:    "🏃‍♀️",
    nutrition:   "🥗",
    water:       "💧",
  };
  const emoji = CATEGORY_EMOJI[reminder.category] || "🌸";

  await transporter.sendMail({
    from:    `"NurtureWell" <${process.env.EMAIL_USER}>`,
    to:      toEmail,
    subject: `${emoji} ${reminder.title} — NurtureWell Reminder`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #f0e6f6;">
        <div style="background:linear-gradient(135deg,#f472b6,#a855f7);padding:28px 32px;text-align:center;">
          <div style="font-size:48px;margin-bottom:8px;">${emoji}</div>
          <h1 style="color:#fff;margin:0;font-size:22px;">${reminder.title}</h1>
        </div>
        <div style="padding:28px 32px;">
          <p style="color:#333;font-size:16px;line-height:1.7;margin:0 0 20px;">Hi <strong>${toName || "there"}</strong>,</p>
          <div style="background:#fdf4ff;border-left:4px solid #a855f7;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="color:#555;font-size:15px;margin:0;line-height:1.7;">${reminder.message}</p>
          </div>
          <p style="color:#888;font-size:13px;margin:0;">This is an automated reminder from NurtureWell. Take care of yourself and your baby! 💕</p>
        </div>
        <div style="background:#f9f9f9;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
          <p style="color:#aaa;font-size:12px;margin:0;">NurtureWell · Your Pregnancy Companion</p>
        </div>
      </div>
    `,
  });
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0,10);
}

// ============================================================
//  PROFILE ROUTES — paste into server.js before app.listen()
//  These add GET + PUT for patient personal details
// ============================================================

// ── GET /patient-details  (logged-in patient's own record) ──────────────────
app.get("/patient-details", verifyToken, async (req, res) => {
  try {
    const result = await databases.listDocuments(
      DATABASE_ID,
      "patients",   // your existing patients collection
      [Query.equal("userId", req.user.userId)]
    );
    if (!result.documents.length) {
      return res.json({ patient: null });
    }
    res.json({ patient: result.documents[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to fetch patient details" });
  }
});

// ── PUT /patient-details  (update personal details) ─────────────────────────
app.put("/patient-details", verifyToken, async (req, res) => {
  try {
    const { fullName, phoneNumber, dateOfBirth, bloodGroup } = req.body;

    // Check if record exists
    const existing = await databases.listDocuments(
      DATABASE_ID, "patients",
      [Query.equal("userId", req.user.userId)]
    );

    const data = {
      fullName:    fullName    || null,
      phoneNumber: phoneNumber || null,
      dateOfBirth: dateOfBirth || null,
      bloodGroup:  bloodGroup  || null,
    };

    let doc;
    if (existing.documents.length > 0) {
      // Update existing
      doc = await databases.updateDocument(
        DATABASE_ID, "patients", existing.documents[0].$id, data
      );
    } else {
      // Create new record
      doc = await databases.createDocument(
        DATABASE_ID, "patients", ID.unique(),
        { ...data, userId: req.user.userId }
      );
    }
    res.json({ success: true, patient: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to update patient details" });
  }
});

// ── PUT /pregnancy-profile  (update pregnancy details) ──────────────────────
app.put("/pregnancy-profile", verifyToken, async (req, res) => {
  try {
    const {
      pregnancyWeek, pregnancyMonth, expectedDueDate,
      LMP, firstPregnancy, existingConditions
    } = req.body;

    const existing = await databases.listDocuments(
      DATABASE_ID, "pregnancy_profiles",
      [Query.equal("userId", req.user.userId)]
    );

    if (!existing.documents.length) {
      return res.status(404).json({ message: "Pregnancy profile not found. Create one first." });
    }

    const doc = await databases.updateDocument(
      DATABASE_ID, "pregnancy_profiles",
      existing.documents[0].$id,
      {
        pregnancyWeek:      pregnancyWeek  ? Number(pregnancyWeek)  : null,
        pregnancyMonth:     pregnancyMonth ? Number(pregnancyMonth) : null,
        expectedDueDate:    expectedDueDate    || null,
        LMP:                LMP                || null,
        firstPregnancy:     Boolean(firstPregnancy),
        existingConditions: existingConditions || "None",
      }
    );
    res.json({ success: true, profile: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to update pregnancy profile" });
  }
});
// ============================================================
//  DOCTOR PROFILE ROUTES — paste into server.js before app.listen()
// ============================================================

// ── GET /doctor/profile  (logged-in doctor's own record) ────────────────────
app.get("/doctor/profile", verifyToken, async (req, res) => {
  try {
    const result = await databases.listDocuments(
      DATABASE_ID,
      process.env.DOCTOR_COLLECTION,
      [Query.equal("doctorId", req.user.userId)]
    );
    if (!result.documents.length) {
      return res.json({ doctor: null });
    }
    res.json({ doctor: result.documents[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to fetch doctor profile" });
  }
});

// ── PUT /doctor/profile  (update doctor's own details) ──────────────────────
app.put("/doctor/profile", verifyToken, async (req, res) => {
  try {
    const {
      name, specialization, experienceYears, qualification,
      phone, clinicAddress, consultationFee,
      availableDays, availableTime, licenseNumber
    } = req.body;

    const existing = await databases.listDocuments(
      DATABASE_ID,
      process.env.DOCTOR_COLLECTION,
      [Query.equal("doctorId", req.user.userId)]
    );

    if (!existing.documents.length) {
      return res.status(404).json({ message: "Doctor profile not found." });
    }

    const doc = await databases.updateDocument(
      DATABASE_ID,
      process.env.DOCTOR_COLLECTION,
      existing.documents[0].$id,
      {
        name:            name            || null,
        specialization:  specialization  || null,
        experienceYears: experienceYears ? parseInt(experienceYears) : null,
        qualification:   qualification   || null,
        phone:           phone           || null,
        clinicAddress:   clinicAddress   || null,
        consultationFee: consultationFee ? parseInt(consultationFee) : null,
        availableDays:   availableDays   || null,
        availableTime:   availableTime   || null,
        licenseNumber:   licenseNumber   || null,
      }
    );
    res.json({ success: true, doctor: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to update doctor profile" });
  }
});
/* =============================
   START SERVER
============================= */
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});