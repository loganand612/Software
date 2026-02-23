require("dotenv").config();
const express = require("express");
const http = require("http");
const url = require("url");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const socketIo = require("socket.io");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_COOKIE = "authToken";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ai-meeting-buddy";
const PORT = 5000;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

mongoose
    .connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => {
        console.log("✅ Connected to MongoDB successfully");
    })
    .catch((err) => {
        console.error("❌ MongoDB connection error:", err.message);
    });

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        email: { type: String, required: true, unique: true, trim: true, lowercase: true },
        passwordHash: { type: String, required: true },
        role: { type: String, enum: ["manager", "employee"], required: true },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

const meetingSchema = new mongoose.Schema(
    {
        meetingId: { type: String, required: true, unique: true, index: true },
        meetingName: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, default: null, maxlength: 500 },
        transcript: { type: String, default: null, maxlength: 50000 },
        transcriptVersion: { type: Number, default: 0 },
        status: { type: String, enum: ["scheduled", "active", "ended"], default: "active", index: true },
        startsAt: { type: Date, default: null },
        endsAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        createdByEmail: { type: String, required: true },
    },
    { timestamps: true }
);

const meetingSummarySchema = new mongoose.Schema(
    {
        meetingId: { type: String, required: true, index: true },
        summaryHtml: { type: String, required: true },
        hostEmail: { type: String, required: true },
        meetingDate: { type: String, required: true },
    },
    { timestamps: true }
);

const meetingParticipantSchema = new mongoose.Schema(
    {
        meetingId: { type: String, required: true, index: true },
        participantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        participantEmail: { type: String, required: true },
        participantName: { type: String, default: "" },
        socketId: { type: String, required: true },
        joinTime: { type: Date, default: Date.now },
        leaveTime: { type: Date },
        isHost: { type: Boolean, default: false },
        meetingDate: { type: String, required: true },
    },
    { timestamps: true }
);

const objectiveItemSchema = new mongoose.Schema(
    {
        text: { type: String, required: true, trim: true, maxlength: 250 },
        sourceMeetingId: { type: String, default: null },
        edited: { type: Boolean, default: false },
    },
    { _id: false }
);

const managerObjectiveSchema = new mongoose.Schema(
    {
        managerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, index: true },
        sourceMeetingIds: [{ type: String }],
        toStart: [objectiveItemSchema],
        ongoing: [objectiveItemSchema],
        message: { type: String, default: "" },
        missingTranscriptCount: { type: Number, default: 0 },
        refreshedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

const User = mongoose.model("User", userSchema);
const Meeting = mongoose.model("Meeting", meetingSchema);
const MeetingSummary = mongoose.model("MeetingSummary", meetingSummarySchema);
const MeetingParticipant = mongoose.model("MeetingParticipant", meetingParticipantSchema);
const ManagerObjective = mongoose.model("ManagerObjective", managerObjectiveSchema);

app.use(cookieParser());
app.use(express.json());

function createToken(user) {
    return jwt.sign(
        {
            id: user._id.toString(),
            email: user.email,
            role: user.role,
            name: user.name,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
}

function parseCookieHeader(cookieHeader = "") {
    return cookieHeader.split(";").reduce((acc, pair) => {
        const idx = pair.indexOf("=");
        if (idx < 0) return acc;
        const key = pair.slice(0, idx).trim();
        const val = decodeURIComponent(pair.slice(idx + 1).trim());
        acc[key] = val;
        return acc;
    }, {});
}

function getTokenFromRequest(req) {
    const bearer = req.headers.authorization || "";
    if (bearer.startsWith("Bearer ")) return bearer.slice(7);
    if (req.cookies && req.cookies[TOKEN_COOKIE]) return req.cookies[TOKEN_COOKIE];
    return null;
}

function authRequired(req, res, next) {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ ok: false, error: "Authentication required" });

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        return next();
    } catch {
        return res.status(401).json({ ok: false, error: "Invalid or expired session" });
    }
}

function pageAuthRequired(req, res, next) {
    const token = getTokenFromRequest(req);
    if (!token) return res.redirect("/");

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        return next();
    } catch {
        return res.redirect("/");
    }
}

function roleRequired(role) {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ ok: false, error: "Forbidden" });
        }
        return next();
    };
}

function userPayload(user) {
    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
    };
}

function toIsoDate(date = new Date()) {
    return new Date(date).toISOString().slice(0, 10);
}

function extractTasksFromTranscript(transcript, meetingId) {
    const lines = String(transcript || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 200);

    const toStart = [];
    const ongoing = [];

    for (const line of lines) {
        const clean = line.replace(/^[-*•\d.\s]+/, "").trim();
        if (!clean) continue;

        if (/(ongoing|in progress|wip|continuing|continue|working on)/i.test(clean)) {
            ongoing.push({ text: clean, sourceMeetingId: meetingId, edited: false });
            continue;
        }

        if (/(todo|to do|action|next step|pending|start|follow up)/i.test(clean)) {
            toStart.push({ text: clean, sourceMeetingId: meetingId, edited: false });
        }
    }

    return { toStart, ongoing };
}

function dedupeObjectiveItems(items) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const key = item.text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out.slice(0, 40);
}

app.get("/", (req, res) => {
    const token = getTokenFromRequest(req);
    if (!token) return res.sendFile(path.join(__dirname, "index.html"));

    try {
        jwt.verify(token, JWT_SECRET);
        return res.redirect("/dashboard");
    } catch {
        return res.sendFile(path.join(__dirname, "index.html"));
    }
});

app.get("/dashboard", pageAuthRequired, (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});

app.get("/meeting", pageAuthRequired, (req, res) => {
    res.sendFile(path.join(__dirname, "meeting.html"));
});

app.get("/logout", (req, res) => {
    res.clearCookie(TOKEN_COOKIE);
    res.redirect("/");
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ ok: false, error: "Email and password are required" });
        }

        const user = await User.findOne({ email: String(email).toLowerCase() });
        if (!user || !user.isActive) {
            return res.status(401).json({ ok: false, error: "Invalid credentials" });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ ok: false, error: "Invalid credentials" });
        }

        const token = createToken(user);
        res.cookie(TOKEN_COOKIE, token, {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.json({ ok: true, user: userPayload(user) });
    } catch (err) {
        return res.status(500).json({ ok: false, error: "Login failed", details: err.message });
    }
});

app.post("/api/auth/logout", (req, res) => {
    res.clearCookie(TOKEN_COOKIE);
    return res.json({ ok: true });
});

app.get("/api/auth/me", authRequired, async (req, res) => {
    const user = await User.findById(req.user.id).select("name email role isActive");
    if (!user || !user.isActive) return res.status(401).json({ ok: false, error: "User not active" });
    return res.json({ ok: true, user: userPayload(user) });
});

app.post("/api/auth/users", authRequired, roleRequired("manager"), async (req, res) => {
    try {
        const { name, email, password, role } = req.body || {};
        if (!name || !email || !password || !role) {
            return res.status(400).json({ ok: false, error: "name, email, password, role are required" });
        }
        if (!["manager", "employee"].includes(role)) {
            return res.status(400).json({ ok: false, error: "Invalid role" });
        }
        if (String(password).length < 8) {
            return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
        }

        const existing = await User.findOne({ email: String(email).toLowerCase() });
        if (existing) return res.status(409).json({ ok: false, error: "Email already exists" });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({
            name: String(name).trim(),
            email: String(email).toLowerCase(),
            passwordHash,
            role,
        });

        return res.json({ ok: true, user: userPayload(user) });
    } catch (err) {
        return res.status(500).json({ ok: false, error: "User creation failed", details: err.message });
    }
});

app.get("/api/test", (req, res) => {
    return res.json({ ok: true, message: "API routes are working", timestamp: new Date().toISOString() });
});

app.get("/api/check-connection", (req, res) => {
    const connectionState = mongoose.connection.readyState;
    const states = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
    return res.json({ ok: connectionState === 1, connectionState: states[connectionState], uri: MONGO_URI });
});

app.get("/api/test-db", authRequired, async (req, res) => {
    try {
        const testMeeting = await Meeting.create({
            meetingId: `db-test-${Date.now()}`,
            meetingName: "DB Test",
            description: "Temp",
            transcript: null,
            status: "ended",
            startsAt: null,
            endsAt: new Date(),
            createdBy: req.user.id,
            createdByEmail: req.user.email,
        });
        await Meeting.deleteOne({ _id: testMeeting._id });
        return res.json({ ok: true, message: "Database write test successful" });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

app.post("/api/meetings", authRequired, roleRequired("manager"), async (req, res) => {
    try {
        const { meetingName, description = null, startsAt = null, endsAt = null } = req.body || {};
        if (!meetingName || !String(meetingName).trim()) {
            return res.status(400).json({ ok: false, error: "meetingName is required" });
        }

        const meetingId = crypto.randomUUID();
        const now = new Date();
        const parsedStartsAt = startsAt ? new Date(startsAt) : null;
        const parsedEndsAt = endsAt ? new Date(endsAt) : null;
        const status = parsedStartsAt && parsedStartsAt > now ? "scheduled" : "active";

        const meeting = await Meeting.create({
            meetingId,
            meetingName: String(meetingName).trim(),
            description: description ? String(description).trim() : null,
            transcript: null,
            status,
            startsAt: parsedStartsAt,
            endsAt: parsedEndsAt,
            createdBy: req.user.id,
            createdByEmail: req.user.email,
        });

        return res.json({ ok: true, meeting });
    } catch (err) {
        return res.status(500).json({ ok: false, error: "Meeting creation failed", details: err.message });
    }
});

app.get("/api/meetings/:meetingId", authRequired, async (req, res) => {
    const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });
    if (!meeting) return res.status(404).json({ ok: false, error: "Meeting not found" });

    return res.json({
        ok: true,
        meeting,
        isHost: String(meeting.createdBy) === String(req.user.id),
    });
});

app.post("/api/meetings/:meetingId/transcript", authRequired, roleRequired("manager"), async (req, res) => {
    try {
        const { transcript } = req.body || {};
        if (transcript !== null && transcript !== undefined && String(transcript).length > 50000) {
            return res.status(400).json({ ok: false, error: "Transcript exceeds 50000 character limit" });
        }

        const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });
        if (!meeting) return res.status(404).json({ ok: false, error: "Meeting not found" });
        if (String(meeting.createdBy) !== String(req.user.id)) {
            return res.status(403).json({ ok: false, error: "Only host manager can update transcript" });
        }

        meeting.transcript = transcript ? String(transcript) : null;
        meeting.transcriptVersion += 1;
        await meeting.save();

        return res.json({ ok: true, meetingId: meeting.meetingId, transcriptVersion: meeting.transcriptVersion });
    } catch (err) {
        return res.status(500).json({ ok: false, error: "Transcript update failed", details: err.message });
    }
});

app.get("/api/meetings/history", authRequired, async (req, res) => {
    try {
        const hostedMeetings = await Meeting.find({ createdBy: req.user.id }).lean();
        const participations = await MeetingParticipant.find({ participantId: req.user.id })
            .sort({ joinTime: -1 })
            .lean();

        const participatedMeetingIds = [...new Set(participations.map((p) => p.meetingId))];
        const participatedMeetings = await Meeting.find({ meetingId: { $in: participatedMeetingIds } }).lean();

        const map = new Map();

        for (const meeting of hostedMeetings) {
            map.set(meeting.meetingId, {
                meetingId: meeting.meetingId,
                meetingName: meeting.meetingName,
                description: meeting.description,
                status: meeting.status,
                startsAt: meeting.startsAt,
                endsAt: meeting.endsAt,
                createdAt: meeting.createdAt,
                updatedAt: meeting.updatedAt,
                participationRole: "hosted",
            });
        }

        for (const meeting of participatedMeetings) {
            const existing = map.get(meeting.meetingId);
            if (existing) {
                existing.participationRole = "hosted+participated";
            } else {
                map.set(meeting.meetingId, {
                    meetingId: meeting.meetingId,
                    meetingName: meeting.meetingName,
                    description: meeting.description,
                    status: meeting.status,
                    startsAt: meeting.startsAt,
                    endsAt: meeting.endsAt,
                    createdAt: meeting.createdAt,
                    updatedAt: meeting.updatedAt,
                    participationRole: "participated",
                });
            }
        }

        const meetings = Array.from(map.values()).sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        return res.json({ ok: true, meetings });
    } catch (err) {
        return res.status(500).json({ ok: false, error: "Failed to fetch history", details: err.message });
    }
});

app.get("/api/objectives/current", authRequired, roleRequired("manager"), async (req, res) => {
    const objectives = await ManagerObjective.findOne({ managerId: req.user.id }).lean();
    return res.json({
        ok: true,
        objectives: objectives || {
            sourceMeetingIds: [],
            toStart: [],
            ongoing: [],
            message: "No objectives generated yet.",
            missingTranscriptCount: 0,
            refreshedAt: null,
        },
    });
});

app.post("/api/objectives/refresh", authRequired, roleRequired("manager"), async (req, res) => {
    try {
        const hostedMeetings = await Meeting.find({ createdBy: req.user.id }).lean();
        const participations = await MeetingParticipant.find({ participantId: req.user.id }).lean();
        const participatedIds = [...new Set(participations.map((p) => p.meetingId))];
        const participatedMeetings = await Meeting.find({ meetingId: { $in: participatedIds } }).lean();

        const combined = new Map();
        [...hostedMeetings, ...participatedMeetings].forEach((meeting) => {
            combined.set(meeting.meetingId, meeting);
        });

        const lastFive = Array.from(combined.values())
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 5);

        const transcriptMeetings = lastFive.filter((meeting) => meeting.transcript && meeting.transcript.trim());
        const missingTranscriptCount = Math.max(0, lastFive.length - transcriptMeetings.length);

        let toStart = [];
        let ongoing = [];

        for (const meeting of transcriptMeetings) {
            const extracted = extractTasksFromTranscript(meeting.transcript, meeting.meetingId);
            toStart = toStart.concat(extracted.toStart);
            ongoing = ongoing.concat(extracted.ongoing);
        }

        toStart = dedupeObjectiveItems(toStart);
        ongoing = dedupeObjectiveItems(ongoing);

        const message = `Processed ${transcriptMeetings.length}/${lastFive.length} transcripts (${missingTranscriptCount} missing).`;

        const doc = await ManagerObjective.findOneAndUpdate(
            { managerId: req.user.id },
            {
                managerId: req.user.id,
                sourceMeetingIds: lastFive.map((meeting) => meeting.meetingId),
                toStart,
                ongoing,
                message,
                missingTranscriptCount,
                refreshedAt: new Date(),
            },
            { upsert: true, new: true }
        );

        return res.json({ ok: true, objectives: doc });
    } catch (err) {
        return res.status(500).json({ ok: false, error: "Objective refresh failed", details: err.message });
    }
});

app.put("/api/objectives/current", authRequired, roleRequired("manager"), async (req, res) => {
    try {
        const { toStart = [], ongoing = [] } = req.body || {};

        const normalize = (items) =>
            (Array.isArray(items) ? items : [])
                .map((item) => ({
                    text: String(item.text || "").trim(),
                    sourceMeetingId: item.sourceMeetingId || null,
                    edited: true,
                }))
                .filter((item) => item.text)
                .slice(0, 40);

        const doc = await ManagerObjective.findOneAndUpdate(
            { managerId: req.user.id },
            {
                $set: {
                    toStart: normalize(toStart),
                    ongoing: normalize(ongoing),
                    refreshedAt: new Date(),
                },
            },
            { new: true, upsert: true }
        );

        return res.json({ ok: true, objectives: doc });
    } catch (err) {
        return res.status(500).json({ ok: false, error: "Objective update failed", details: err.message });
    }
});

app.post("/api/participants", authRequired, async (req, res) => {
    try {
        const { meetingId, socketId, action } = req.body || {};
        if (!meetingId || !socketId) {
            return res.status(400).json({ ok: false, error: "meetingId and socketId are required" });
        }

        const meetingDate = toIsoDate();

        if (action === "leave") {
            const updated = await MeetingParticipant.findOneAndUpdate(
                { meetingId, participantId: req.user.id },
                { leaveTime: new Date() },
                { new: true }
            );
            return res.json({ ok: true, action: "leave", id: updated?._id || null });
        }

        const doc = await MeetingParticipant.findOneAndUpdate(
            { meetingId, participantId: req.user.id },
            {
                meetingId,
                participantId: req.user.id,
                participantEmail: req.user.email,
                participantName: req.user.name,
                socketId,
                joinTime: new Date(),
                leaveTime: null,
                isHost: false,
                meetingDate,
            },
            { upsert: true, new: true }
        );

        return res.json({ ok: true, action: "join", id: doc._id });
    } catch (err) {
        return res.status(500).json({ ok: false, error: "Internal server error", details: err.message });
    }
});

app.get("/api/participants/:meetingId", authRequired, async (req, res) => {
    try {
        const participants = await MeetingParticipant.find({ meetingId: req.params.meetingId }).sort({ joinTime: -1 });
        return res.json({ ok: true, count: participants.length, participants });
    } catch {
        return res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

app.post("/api/summaries", authRequired, async (req, res) => {
    try {
        const { meetingId, summaryHtml } = req.body || {};
        if (!meetingId || !summaryHtml) {
            return res.status(400).json({ ok: false, error: "meetingId and summaryHtml are required" });
        }

        const doc = await MeetingSummary.create({
            meetingId,
            summaryHtml,
            hostEmail: req.user.email,
            meetingDate: toIsoDate(),
        });

        return res.json({ ok: true, id: doc._id });
    } catch (err) {
        return res.status(500).json({ ok: false, error: "Internal server error", details: err.message });
    }
});

app.get("/api/summaries", authRequired, async (req, res) => {
    try {
        const summaries = await MeetingSummary.find({ hostEmail: req.user.email }).sort({ createdAt: -1 }).limit(50);
        return res.json({ ok: true, count: summaries.length, summaries });
    } catch (err) {
        return res.status(500).json({ ok: false, error: "Internal server error", details: err.message });
    }
});

app.get("/api/summaries/:meetingId", authRequired, async (req, res) => {
    try {
        const summaries = await MeetingSummary.find({ meetingId: req.params.meetingId }).sort({ createdAt: -1 });
        return res.json({ ok: true, count: summaries.length, summaries });
    } catch {
        return res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

app.post("/api/generate-summary", authRequired, async (req, res) => {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ ok: false, error: "OPENAI_API_KEY is not configured on server" });
        }

        const { notes, meetingDate } = req.body || {};
        if (!notes || !notes.trim()) {
            return res.status(400).json({ ok: false, error: "notes is required to generate a summary" });
        }

        const safeDate = meetingDate || toIsoDate();

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "You are an assistant that turns raw meeting notes into a concise HTML summary with action items. Respond ONLY with HTML - paragraphs and <ul>/<li> lists, no surrounding <html> or <body> tags.",
                },
                {
                    role: "user",
                    content: `Host: ${req.user.email}\nDate: ${safeDate}\n\nMeeting notes:\n${notes}`,
                },
            ],
            temperature: 0.4,
        });

        const summaryHtml = completion.choices?.[0]?.message?.content?.trim() || "<p>No summary could be generated.</p>";
        return res.json({ ok: true, summaryHtml });
    } catch {
        return res.status(500).json({ ok: false, error: "AI summary generation failed" });
    }
});

app.get("/api/ngrok", async (req, res) => {
    try {
        const ngrokUrl = "http://127.0.0.1:4040/api/tunnels";
        const parsedUrl = url.parse(ngrokUrl);

        const data = await new Promise((resolve, reject) => {
            const requestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.path,
                method: "GET",
            };

            const reqNgrok = http.request(requestOptions, (resp) => {
                let body = "";
                resp.on("data", (chunk) => {
                    body += chunk;
                });
                resp.on("end", () => {
                    if (resp.statusCode !== 200) return reject(new Error(`HTTP ${resp.statusCode}`));
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            reqNgrok.on("error", reject);
            reqNgrok.end();
        });

        const tunnels = data.tunnels || [];
        const tunnel = tunnels.find((t) => t.proto === "https") || tunnels[0];
        if (!tunnel || !tunnel.public_url) {
            return res.status(404).json({ ok: false, error: "no ngrok tunnels found" });
        }
        return res.json({ ok: true, url: tunnel.public_url });
    } catch {
        return res.status(500).json({ ok: false, error: "failed to query ngrok" });
    }
});

app.use(express.static(path.join(__dirname)));
app.use("/models", express.static(path.join(__dirname, "models")));

io.use((socket, next) => {
    try {
        const cookies = parseCookieHeader(socket.handshake.headers.cookie || "");
        const token = cookies[TOKEN_COOKIE];
        if (!token) return next(new Error("Unauthorized"));
        const payload = jwt.verify(token, JWT_SECRET);
        socket.user = payload;
        return next();
    } catch {
        return next(new Error("Unauthorized"));
    }
});

const socketMeetingMap = new Map();
const peerInfoMap = {};
const disconnectedUsers = {};
const meetingScreenShareMap = new Map(); // Track active screen share per meeting: meetingId -> socketId

io.on("connection", (socket) => {
    const userId = socket.user.id;

    if (disconnectedUsers[userId]) {
        clearTimeout(disconnectedUsers[userId]);
        delete disconnectedUsers[userId];
    }

    socket.joinData = {
        socketId: socket.id,
        joinTime: new Date(),
        userId,
        email: socket.user.email,
        name: socket.user.name,
    };

    socket.on("join-meeting", async (data) => {
        const meetingId = (data?.meetingId || "").trim();
        if (!meetingId) return;

        const meeting = await Meeting.findOne({ meetingId });
        if (!meeting) {
            socket.emit("join-error", { error: "Meeting does not exist" });
            return;
        }

        socket.join(meetingId);
        socketMeetingMap.set(socket.id, meetingId);
        socket.joinData.meetingId = meetingId;
        socket.joinData.meetingDate = toIsoDate();
        socket.joinData.isHost = String(meeting.createdBy) === String(userId);

        await MeetingParticipant.findOneAndUpdate(
            { meetingId, participantId: userId },
            {
                meetingId,
                participantId: userId,
                participantEmail: socket.user.email,
                participantName: socket.user.name,
                socketId: socket.id,
                isHost: socket.joinData.isHost,
                joinTime: new Date(),
                leaveTime: null,
                meetingDate: toIsoDate(),
            },
            { upsert: true, new: true }
        );

        if (meeting.status === "scheduled") {
            meeting.status = "active";
            await meeting.save();
        }

        peerInfoMap[socket.id] = { email: socket.user.email };

        const peerIdsInMeeting = Array.from(io.sockets.adapter.rooms.get(meetingId) || []).filter((id) => id !== socket.id);
        socket.emit("existing-peers", { peerIds: peerIdsInMeeting });
        socket.to(meetingId).emit("new-peer", { socketId: socket.id });
        socket.to(meetingId).emit("peer-info", { socketId: socket.id, email: socket.user.email });
    });

    socket.on("host-info", async () => {
        const meetingId = socket.joinData.meetingId;
        if (!meetingId) return;

        await MeetingParticipant.findOneAndUpdate(
            { meetingId, participantId: userId },
            {
                socketId: socket.id,
                participantEmail: socket.user.email,
                participantName: socket.user.name,
                isHost: !!socket.joinData.isHost,
                meetingDate: socket.joinData.meetingDate || toIsoDate(),
                joinTime: new Date(),
                leaveTime: null,
            },
            { upsert: true, new: true }
        );

        socket.to(meetingId).emit("peer-info", {
            socketId: socket.id,
            email: socket.user.email,
        });
    });

    socket.on("offer", (data) => {
        socket.to(data.socketId).emit("offer", { offer: data.offer, socketId: socket.id });
    });

    socket.on("answer", (data) => {
        socket.to(data.socketId).emit("answer", { answer: data.answer, socketId: socket.id });
    });

    socket.on("ice-candidate", (data) => {
        socket.to(data.socketId).emit("ice-candidate", { candidate: data.candidate, socketId: socket.id });
    });

    socket.on("media-state", (data) => {
        socket.to(data.meetingId).emit("peer-media-state", {
            socketId: socket.id,
            video: data.video,
            audio: data.audio,
        });
    });

    socket.on("chat-message", (data) => {
        socket.to(data.meetingId).emit("chat-message", {
            sender: socket.user.email,
            message: data.message,
            timestamp: new Date().toISOString(),
        });
    });

    socket.on("emoji-reaction", (data) => {
        socket.to(data.meetingId).emit("emoji-reaction", {
            socketId: socket.id,
            emoji: data.emoji
        });
    });

    socket.on("request-screenshare", (data) => {
        const meetingId = data?.meetingId;
        if (!meetingId) return;

        // Check if someone is already sharing their screen in this meeting
        const activeSharingSocketId = meetingScreenShareMap.get(meetingId);
        if (activeSharingSocketId && activeSharingSocketId !== socket.id) {
            // Someone else is already sharing - auto-deny
            io.to(socket.id).emit("screenshare-approved", { 
                approved: false,
                reason: "Someone else is already sharing their screen in this meeting"
            });
            return;
        }

        // No one is sharing, ask the host for permission
        socket.to(data.meetingId).emit("screenshare-requested", {
            socketId: socket.id,
            email: socket.user.email,
        });
    });

    socket.on("screenshare-response", (data) => {
        io.to(data.targetSocketId).emit("screenshare-approved", { approved: data.approved });
    });

    socket.on("screenshare-state", (data) => {
        const meetingId = data?.meetingId;
        if (!meetingId) return;

        // Track active screen share
        if (data.isSharing) {
            meetingScreenShareMap.set(meetingId, socket.id);
        } else {
            // Check if this socket was the one sharing
            if (meetingScreenShareMap.get(meetingId) === socket.id) {
                meetingScreenShareMap.delete(meetingId);
            }
        }

        socket.to(data.meetingId).emit("screenshare-state-changed", {
            socketId: socket.id,
            isSharing: data.isSharing,
        });
    });

    socket.on("end-meeting", async ({ meetingId }) => {
        socket.to(meetingId).emit("meeting-force-ended");
        await Meeting.findOneAndUpdate({ meetingId }, { status: "ended", endsAt: new Date() });
    });

    socket.on("transfer-host", ({ meetingId }) => {
        const room = io.sockets.adapter.rooms.get(meetingId);
        if (room) {
            const peers = Array.from(room).filter((id) => id !== socket.id);
            if (peers.length > 0) {
                const newHostId = peers[Math.floor(Math.random() * peers.length)];
                io.to(newHostId).emit("you-are-new-host");
            }
        }
    });

    socket.on("manual-transfer-host", ({ targetSocketId }) => {
        if (socket.joinData) socket.joinData.isHost = false;
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket && targetSocket.joinData) {
            targetSocket.joinData.isHost = true;
        }
        io.to(targetSocketId).emit("you-are-new-host");
    });

    socket.on("disconnect", () => {
        const meetingId = socketMeetingMap.get(socket.id);

        if (userId && socket.joinData?.email && meetingId) {
            disconnectedUsers[userId] = setTimeout(async () => {
                await MeetingParticipant.findOneAndUpdate(
                    { meetingId, participantId: userId },
                    { leaveTime: new Date() }
                );
                delete disconnectedUsers[userId];
            }, 10000);
        }

        delete peerInfoMap[socket.id];
        socketMeetingMap.delete(socket.id);

        // Clean up screen share tracking if this user was sharing
        if (meetingId && meetingScreenShareMap.get(meetingId) === socket.id) {
            meetingScreenShareMap.delete(meetingId);
        }

        if (meetingId) {
            socket.to(meetingId).emit("peer-disconnected", { socketId: socket.id });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
