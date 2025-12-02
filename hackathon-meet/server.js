require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");
const OpenAI = require("openai");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- MongoDB setup (local instance on your laptop) ---
const MONGO_URI = "mongodb://127.0.0.1:27017/ideaquest";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB at", MONGO_URI))
  .catch((err) => console.error("MongoDB connection error:", err));

const meetingSummarySchema = new mongoose.Schema(
  {
    meetingId: { type: String, required: true },
    summaryHtml: { type: String, required: true },
    hostEmail: { type: String, required: true },
    meetingDate: { type: String, required: true }, // ISO string for easy filtering
  },
  { timestamps: true }
);

const MeetingSummary = mongoose.model("MeetingSummary", meetingSummarySchema);

// --- Express middleware & static files ---
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use(express.static(path.join(__dirname)));
app.use("/models", express.static(path.join(__dirname, "models")));

// --- API to store meeting summaries ---
app.post("/api/summaries", async (req, res) => {
  try {
    const { meetingId, summaryHtml, hostEmail, meetingDate } = req.body || {};

    if (!meetingId || !summaryHtml || !hostEmail || !meetingDate) {
      return res
        .status(400)
        .json({
          ok: false,
          error: "meetingId, summaryHtml, hostEmail, meetingDate are required",
        });
    }

    const doc = await MeetingSummary.create({
      meetingId,
      summaryHtml,
      hostEmail,
      meetingDate,
    });
    return res.json({ ok: true, id: doc._id });
  } catch (err) {
    console.error("Error saving summary:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// --- AI summary generation using OpenAI ---
app.post("/api/generate-summary", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ ok: false, error: "OPENAI_API_KEY is not configured on server" });
    }

    const { notes, hostEmail, meetingDate } = req.body || {};

    if (!notes || !notes.trim()) {
      return res
        .status(400)
        .json({ ok: false, error: "notes is required to generate a summary" });
    }

    const safeHost = hostEmail || "Unknown host";
    const safeDate = meetingDate || new Date().toISOString().slice(0, 10);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that turns raw meeting notes into a concise HTML summary with action items. " +
            "Respond ONLY with HTML - paragraphs and <ul>/<li> lists, no surrounding <html> or <body> tags.",
        },
        {
          role: "user",
          content: `Host: ${safeHost}\nDate: ${safeDate}\n\nMeeting notes:\n${notes}`,
        },
      ],
      temperature: 0.4,
    });

    const summaryHtml =
      completion.choices?.[0]?.message?.content?.trim() ||
      "<p>No summary could be generated.</p>";

    return res.json({ ok: true, summaryHtml });
  } catch (err) {
    console.error("Error generating AI summary:", err);
    return res.status(500).json({ ok: false, error: "AI summary generation failed" });
  }
});

// --- WebRTC signaling with Socket.IO ---
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Tell the new client about existing peers
  socket.broadcast.emit("new-peer", { socketId: socket.id });

  // Receive host info (email) from a client and broadcast to others
  socket.on("host-info", (data) => {
    const email = (data && data.email) || "";
    if (!email) return;
    socket.broadcast.emit("peer-info", {
      socketId: socket.id,
      email,
    });
  });

  socket.on("offer", (data) => {
    socket.to(data.socketId).emit("offer", {
      offer: data.offer,
      socketId: socket.id,
    });
  });

  socket.on("answer", (data) => {
    socket.to(data.socketId).emit("answer", {
      answer: data.answer,
      socketId: socket.id,
    });
  });

  socket.on("ice-candidate", (data) => {
    socket.to(data.socketId).emit("ice-candidate", {
      candidate: data.candidate,
      socketId: socket.id,
    });
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    socket.broadcast.emit("peer-disconnected", { socketId: socket.id });
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});