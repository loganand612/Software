require("dotenv").config();
const express = require("express");
const http = require("http");
const url = require("url");
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

// --- MongoDB setup with authentication support ---
// Try without auth first, fallback to auth if needed
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ai-meeting-buddy";

// MongoDB connection options
const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  directConnection: false,
  serverSelectionTimeoutMS: 5000,
};

mongoose
  .connect(MONGO_URI, mongoOptions)
  .then(() => {
    console.log("✅ Connected to MongoDB successfully!");
    console.log("📍 Database:", MONGO_URI);
    console.log("📁 Collections: meetingsummaries, meetingparticipants");
    
    // Test write access immediately after connection
    MeetingSummary.create({
      meetingId: "connection-test",
      summaryHtml: "<p>Connection test</p>",
      hostEmail: "test@test.com",
      meetingDate: new Date().toISOString().slice(0, 10)
    })
    .then(() => {
      console.log("✅ Write test successful - MongoDB is ready!");
    })
    .catch((writeErr) => {
      console.error("⚠️ Write test failed:", writeErr.message);
      console.error("💡 MongoDB may require authentication. Check MONGODB_SETUP.md for help.");
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    console.error("💡 Make sure MongoDB is running on localhost:27017");
    console.error("💡 If MongoDB requires authentication, update MONGO_URI with username:password");
  });

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

// --- Meeting Participant Schema ---
const meetingParticipantSchema = new mongoose.Schema(
  {
    meetingId: { type: String, required: true },
    participantEmail: { type: String, required: true },
    socketId: { type: String, required: true },
    joinTime: { type: Date, default: Date.now },
    leaveTime: { type: Date },
    isHost: { type: Boolean, default: false },
    meetingDate: { type: String, required: true }, // ISO string for easy filtering
  },
  { timestamps: true }
);

const MeetingParticipant = mongoose.model("MeetingParticipant", meetingParticipantSchema);

// --- Express middleware & static files ---
app.use(express.json());

// --- API Routes (must be before static files) ---
// --- Simple test route ---
app.get("/api/test", (req, res) => {
  return res.json({ ok: true, message: "API routes are working!", timestamp: new Date().toISOString() });
});

// --- Simple connection check ---
app.get("/api/check-connection", (req, res) => {
  const connectionState = mongoose.connection.readyState;
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };
  
  return res.json({
    ok: connectionState === 1,
    connectionState: states[connectionState],
    uri: MONGO_URI,
    message: connectionState === 1 
      ? "MongoDB is connected!" 
      : "MongoDB is not connected. Check server console for connection errors."
  });
});

// --- Test MongoDB connection and create database ---
app.get("/api/test-db", async (req, res) => {
  try {
    const connectionState = mongoose.connection.readyState;
    const states = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting"
    };
    
    console.log("🔍 Testing MongoDB connection...");
    console.log("   Connection state:", states[connectionState]);
    console.log("   URI:", MONGO_URI);
    
    if (connectionState !== 1) {
      return res.json({
        ok: false,
        error: "MongoDB not connected",
        state: states[connectionState],
        uri: MONGO_URI,
        message: "Please wait a moment and try again, or check if MongoDB is running"
      });
    }
    
    // Try to create a test document to ensure database is created
    console.log("📝 Creating test document...");
    let testDoc;
    try {
      testDoc = await MeetingSummary.create({
        meetingId: "test-" + Date.now(),
        summaryHtml: "<p>This is a test document to create the database.</p>",
        hostEmail: "test@example.com",
        meetingDate: new Date().toISOString().slice(0, 10)
      });
      console.log("✅ Test document created:", testDoc._id);
    } catch (createErr) {
      console.error("❌ Error creating test document:", createErr);
      return res.status(500).json({
        ok: false,
        error: "Failed to create test document",
        details: createErr.message,
        stack: createErr.stack
      });
    }
    
    // Count documents
    let count = 0;
    try {
      count = await MeetingSummary.countDocuments();
      console.log("📊 Document count:", count);
    } catch (countErr) {
      console.error("Error counting documents:", countErr.message);
    }
    
    return res.json({
      ok: true,
      message: "MongoDB connection successful!",
      connectionState: states[connectionState],
      database: "ai-meeting-buddy",
      collection: "meetingsummaries",
      documentCount: count,
      testDocumentId: testDoc._id.toString(),
      uri: MONGO_URI
    });
  } catch (err) {
    console.error("❌ Test failed with error:", err);
    return res.status(500).json({
      ok: false,
      error: "Test failed",
      details: err.message,
      errorName: err.name,
      uri: MONGO_URI,
      connectionState: mongoose.connection.readyState
    });
  }
});

// --- API to store participant join/leave events ---
app.post("/api/participants", async (req, res) => {
  try {
    const { meetingId, participantEmail, socketId, isHost, meetingDate, action } = req.body || {};

    console.log("📥 Received participant event:");
    console.log("   Action:", action || "join");
    console.log("   Meeting ID:", meetingId);
    console.log("   Participant Email:", participantEmail);
    console.log("   Socket ID:", socketId);

    if (!meetingId || !participantEmail || !socketId || !meetingDate) {
      console.error("❌ Missing required fields");
      return res
        .status(400)
        .json({
          ok: false,
          error: "meetingId, participantEmail, socketId, meetingDate are required",
        });
    }

    if (action === "leave") {
      // Update leave time for existing participant
      const updated = await MeetingParticipant.findOneAndUpdate(
        { socketId, meetingId },
        { leaveTime: new Date() },
        { new: true }
      );
      
      if (updated) {
        console.log("✅ Participant leave time updated:", updated._id);
        return res.json({ ok: true, id: updated._id, action: "leave" });
      } else {
        console.log("⚠️ Participant not found for leave event");
        return res.json({ ok: true, message: "Participant not found" });
      }
    } else {
      // Create new participant join record
      const doc = await MeetingParticipant.create({
        meetingId,
        participantEmail,
        socketId,
        isHost: isHost || false,
        meetingDate,
        joinTime: new Date(),
      });
      
      console.log("✅ Participant join saved successfully!");
      console.log("   Document ID:", doc._id);
      console.log("   Database: ai-meeting-buddy");
      console.log("   Collection: meetingparticipants");
      
      return res.json({ ok: true, id: doc._id, action: "join" });
    }
  } catch (err) {
    console.error("❌ Error saving participant:", err);
    return res.status(500).json({ ok: false, error: "Internal server error", details: err.message });
  }
});

// --- API to get all participants for a meeting ---
app.get("/api/participants/:meetingId", async (req, res) => {
  try {
    const { meetingId } = req.params;
    const participants = await MeetingParticipant.find({ meetingId }).sort({ joinTime: -1 });
    return res.json({ ok: true, count: participants.length, participants });
  } catch (err) {
    console.error("❌ Error retrieving participants:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// --- API to store meeting summaries ---
app.post("/api/summaries", async (req, res) => {
  try {
    const { meetingId, summaryHtml, hostEmail, meetingDate } = req.body || {};

    console.log("📥 Received request to save summary:");
    console.log("   Meeting ID:", meetingId);
    console.log("   Host Email:", hostEmail);
    console.log("   Meeting Date:", meetingDate);
    console.log("   Summary length:", summaryHtml?.length || 0, "characters");

    if (!meetingId || !summaryHtml || !hostEmail || !meetingDate) {
      console.error("❌ Missing required fields");
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
    
    console.log("✅ Summary saved successfully!");
    console.log("   Document ID:", doc._id);
    console.log("   Database: ai-meeting-buddy");
    console.log("   Collection: meetingsummaries");
    
    return res.json({ ok: true, id: doc._id });
  } catch (err) {
    console.error("❌ Error saving summary:", err);
    return res.status(500).json({ ok: false, error: "Internal server error", details: err.message });
  }
});

// --- API to retrieve all meeting summaries ---
app.get("/api/summaries", async (req, res) => {
  try {
    const summaries = await MeetingSummary.find({}).sort({ createdAt: -1 }).limit(50);
    console.log(`📊 Retrieved ${summaries.length} meeting summaries`);
    return res.json({ ok: true, count: summaries.length, summaries });
  } catch (err) {
    console.error("❌ Error retrieving summaries:", err);
    return res.status(500).json({ ok: false, error: "Internal server error", details: err.message });
  }
});

// --- API to get summary by meeting ID ---
app.get("/api/summaries/:meetingId", async (req, res) => {
  try {
    const { meetingId } = req.params;
    const summaries = await MeetingSummary.find({ meetingId }).sort({ createdAt: -1 });
    return res.json({ ok: true, count: summaries.length, summaries });
  } catch (err) {
    console.error("❌ Error retrieving summary:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// --- Static file routes (must be after API routes) ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/meeting", (req, res) => {
  res.sendFile(path.join(__dirname, "meeting.html"));
});

app.use(express.static(path.join(__dirname)));
app.use("/models", express.static(path.join(__dirname, "models")));

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

// --- Return ngrok public URL if ngrok is running locally (web interface on :4040) ---
app.get('/api/ngrok', async (req, res) => {
  try {
    // Use the local ngrok web API to list tunnels
    const ngrokUrl = 'http://127.0.0.1:4040/api/tunnels';
    const parsedUrl = url.parse(ngrokUrl);
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      method: 'GET',
    };

    const data = await new Promise((resolve, reject) => {
      const req = http.request(requestOptions, (resp) => {
        let body = '';
        resp.on('data', (chunk) => { body += chunk; });
        resp.on('end', () => {
          if (resp.statusCode !== 200) {
            reject(new Error(`HTTP ${resp.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.end();
    });

    const tunnels = data.tunnels || [];
    // Prefer an https tunnel, fall back to any
    const tunnel = tunnels.find(t => t.proto === 'https') || tunnels[0];
    if (!tunnel || !tunnel.public_url) {
      return res.status(404).json({ ok: false, error: 'no ngrok tunnels found' });
    }
    return res.json({ ok: true, url: tunnel.public_url });
  } catch (err) {
    console.error('Error fetching ngrok info:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'failed to query ngrok' });
  }
});

// --- WebRTC signaling with Socket.IO ---
const peerInfoMap = {}; // socketId -> { email }
const socketMeetingMap = new Map(); // socketId -> meetingId
const disconnectedUsers = {}; // userId -> timeout

io.on("connection", (socket) => {

  const userId = socket.handshake.query.userId;
  console.log(`Client connected: ${socket.id}`);
  console.log(`User ID: ${userId}`);

  // 🔥 Cancel leave timer if user reconnects
  if (userId && disconnectedUsers[userId]) {
    clearTimeout(disconnectedUsers[userId]);
    delete disconnectedUsers[userId];
    console.log("User reconnected — leave cancelled");
  }

  socket.joinData = {
    socketId: socket.id,
    joinTime: new Date(),
  };

  socket.on("join-meeting", (data) => {
    const meetingId = (data?.meetingId || "").trim();
    if (!meetingId) return;

    socket.join(meetingId);
    socketMeetingMap.set(socket.id, meetingId);
    socket.joinData.meetingId = meetingId;

    const peerIdsInMeeting = Array.from(io.sockets.adapter.rooms.get(meetingId) || [])
      .filter(id => id !== socket.id);

    socket.emit("existing-peers", { peerIds: peerIdsInMeeting });

    socket.to(meetingId).emit("new-peer", { socketId: socket.id });
  });

  socket.on("host-info", async (data) => {

    const email = (data && data.email) || "";
    if (!email) return;

    socket.joinData.email = email;
    socket.joinData.isHost = data.isHost || false;
    socket.joinData.meetingId = data.meetingId;
    socket.joinData.meetingDate = data.meetingDate;

    peerInfoMap[socket.id] = { email };

    // 🔥 PREVENT DUPLICATE JOIN RECORDS
    try {
      await MeetingParticipant.findOneAndUpdate(
        {
          meetingId: socket.joinData.meetingId,
          participantEmail: email
        },
        {
          socketId: socket.id,
          isHost: socket.joinData.isHost || false,
          meetingDate: socket.joinData.meetingDate,
          joinTime: new Date(),
          leaveTime: null
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Participant join updated/saved: ${email}`);
    } catch (err) {
      console.error("❌ Error saving participant join:", err.message);
    }

    const meetingId = socket.joinData.meetingId;

    socket.to(meetingId).emit("peer-info", {
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

  // Broadcast media state (video on/off, mic on/off) to others
  socket.on("media-state", (data) => {
    socket.to(data.meetingId).emit("peer-media-state", {
      socketId: socket.id,
      video: data.video,
      audio: data.audio
    });
  });

  // Forward Emoji Reactions
  socket.on("emoji-reaction", (data) => {
      socket.to(data.meetingId).emit("emoji-reaction", { socketId: socket.id, emoji: data.emoji });
  });
  
  // Handle Chat Messages
  socket.on("chat-message", (data) => {
    // Forward the message to everyone else in the same meeting room
    socket.to(data.meetingId).emit("chat-message", {
      sender: data.sender,
      message: data.message,
      timestamp: new Date().toISOString()
    });
  });

  // --- SCREENSHARE PERMISSION LOGIC ---
  
  // 1. Participant asks to share
  socket.on("request-screenshare", (data) => {
    // Broadcast the request to the room (only the host will react to it)
    socket.to(data.meetingId).emit("screenshare-requested", {
      socketId: socket.id,
      email: data.email
    });
  });

  // 2. Host replies with yes/no
  socket.on("screenshare-response", (data) => {
    // Send the decision directly back to the participant who asked
    io.to(data.targetSocketId).emit("screenshare-approved", { 
      approved: data.approved 
    });
  });

// 3. Broadcast that the layout needs to change for everyone
  socket.on("screenshare-state", (data) => {
    socket.to(data.meetingId).emit("screenshare-state-changed", {
      socketId: socket.id,
      streamId: data.streamId, // <-- THIS WAS MISSING
      isSharing: data.isSharing
    });
  });

  // When host ends the call for everyone
  socket.on("end-meeting", ({ meetingId }) => {
    // Tell everyone else in the room that the meeting is dead
    socket.to(meetingId).emit("meeting-force-ended");
  });

  // When host leaves but wants the meeting to continue
  socket.on("transfer-host", ({ meetingId }) => {
    const room = io.sockets.adapter.rooms.get(meetingId);
    if (room) {
      // Find all peers except the leaving host
      const peers = Array.from(room).filter(id => id !== socket.id);
      if (peers.length > 0) {
        // Pick a random peer to be the new host
        const newHostId = peers[Math.floor(Math.random() * peers.length)];
        io.to(newHostId).emit("you-are-new-host");
      }
    }
  });

  // When the host manually transfers the role to a specific user
  socket.on("manual-transfer-host", ({ targetSocketId, meetingId }) => {
    // Remove host status from sender
    if (socket.joinData) socket.joinData.isHost = false;
    
    // Grant host status to the target
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket && targetSocket.joinData) {
        targetSocket.joinData.isHost = true;
    }

    // Tell the specific user they are the new host
    io.to(targetSocketId).emit("you-are-new-host");
  });

  // 🔥 GRACE PERIOD DISCONNECT LOGIC
  socket.on("disconnect", () => {

    console.log(`User temporarily disconnected: ${socket.id}`);

    const meetingId = socketMeetingMap.get(socket.id);
    const email = socket.joinData?.email;

    if (userId && email && meetingId) {

      disconnectedUsers[userId] = setTimeout(async () => {
        try {
          await MeetingParticipant.findOneAndUpdate(
            {
              meetingId: meetingId,
              participantEmail: email
            },
            { leaveTime: new Date() }
          );

          console.log(`✅ Participant leave saved after timeout: ${email}`);
          delete disconnectedUsers[userId];

        } catch (err) {
          console.error("❌ Error saving participant leave:", err.message);
        }
      }, 10000); // 10 seconds
    }

    delete peerInfoMap[socket.id];
    socketMeetingMap.delete(socket.id);

    if (meetingId) {
      socket.to(meetingId).emit("peer-disconnected", { socketId: socket.id });
    }
  });

});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
