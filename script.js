// Connect to Socket.IO server (works with both localhost and ngrok)
let userId = localStorage.getItem("userId");

if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem("userId", userId);
}

const socket = io(window.location.origin, {
    query: { userId: userId }
});

let isMeetingHost = false;
let currentUser = null;
const localVideo = document.getElementById("localVideo");
const localVideoContainer = document.getElementById("local-video-container");
const remoteVideosContainer = document.getElementById('remote-videos');
const engagementDiv = document.getElementById("engagementScore");
const leaveBtn = document.getElementById("leaveBtn");
const statsDiv = document.getElementById("stats");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const summaryBox = document.getElementById("summary-box");
const cameraLoading = document.getElementById("camera-loading");
const notesInput = document.getElementById("notesInput");
const generateSummaryBtn = document.getElementById("generateSummaryBtn");



// Fix browser autoplay restriction
document.body.addEventListener("click", () => {
    document.querySelectorAll("video").forEach(v => {
        v.play().catch(() => { });
    });
}, { once: true });

// Shows a disappearing toast message
function showToast(message) {
    const toast = document.getElementById("toastNotification");
    const toastMsg = document.getElementById("toastMessage");
    toastMsg.innerText = message;

    // Slide in
    toast.classList.remove("opacity-0", "-translate-y-10");
    toast.classList.add("opacity-100", "translate-y-0");

    // Slide out after 3.5 seconds
    setTimeout(() => {
        toast.classList.remove("opacity-100", "translate-y-0");
        toast.classList.add("opacity-0", "-translate-y-10");
    }, 3500);
}

// Shows or hides host controls based on your current status
function updateHostUI() {
    document.querySelectorAll('.make-host-btn').forEach(btn => {
        if (isMeetingHost) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });
}

function initializeMeetingId() {
    const params = new URLSearchParams(window.location.search);
    let meetingId = params.get("meetingId");

    if (!meetingId) {
        alert("Meeting ID is missing. Please start or join from dashboard.");
        window.location.href = "/dashboard";
        return null;
    }
    console.log("Joining existing meeting:", meetingId);
    return meetingId;
}


// Parse URL params to allow `meetingId`, `hostEmail`, and `meetingDate` to be passed
function parseAndApplyUrlParams() {
    try {
        const params = new URLSearchParams(window.location.search);
        const meetingId = params.get('meetingId');
        const hostEmail = params.get('hostEmail');
        const meetingDate = params.get('meetingDate');
        if (hostEmail && meetingDate) {
            const ctx = { email: hostEmail, meetingDate };
            window.sessionStorage.setItem('hostContext', JSON.stringify(ctx));
        } else if (hostEmail && !meetingDate) {
            // preserve existing meetingDate or use today
            const existing = JSON.parse(window.sessionStorage.getItem('hostContext') || '{}');
            const ctx = { email: hostEmail, meetingDate: existing.meetingDate || new Date().toISOString().slice(0, 10) };
            window.sessionStorage.setItem('hostContext', JSON.stringify(ctx));
        }
    } catch (err) {
        console.warn('Unable to parse URL params for meeting context', err);
    }
}

parseAndApplyUrlParams();

const hostContext = {
    email: "",
    meetingDate: new Date().toISOString().slice(0, 10)
};

const peerConnections = {};
const peerInfo = {}; // socketId -> { email }
const iceCandidateQueues = {};
let localStream;
let audioContext;
const speakingThreshold = -50; // dB

// AI summary generation: send notes to backend, display + store result
if (generateSummaryBtn) {
    generateSummaryBtn.addEventListener("click", async () => {
        const notes = (notesInput?.value || "").trim();
        const ctx = hostContext || getOrPromptHostContext();

        if (!notes) {
            alert("Please enter some meeting notes for the AI to summarize.");
            return;
        }

        generateSummaryBtn.disabled = true;
        const originalText = generateSummaryBtn.textContent;
        generateSummaryBtn.textContent = "Generating…";

        summaryBox.innerHTML = `<div class="loading-spinner"></div><p class="mt-2 text-xs text-slate-500">Generating AI summary…</p>`;

        try {
            const response = await fetch("/api/generate-summary", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    notes,
                    hostEmail: ctx?.email,
                    meetingDate: ctx?.meetingDate,
                }),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.ok || !data.summaryHtml) {
                console.error("AI summary error", data);
                alert("AI summary failed. Check server logs.");
                summaryBox.innerHTML =
                    '<p class="text-xs text-rose-500">AI summary failed. Please try again.</p>';
                return;
            }

            summaryBox.innerHTML = data.summaryHtml;
            saveSummaryToBackend(data.summaryHtml);
        } catch (err) {
            console.error("Error calling /api/generate-summary:", err);
            alert("Error contacting AI summary service. Check console/server.");
            summaryBox.innerHTML =
                '<p class="text-xs text-rose-500">Could not reach AI summary service.</p>';
        } finally {
            generateSummaryBtn.disabled = false;
            generateSummaryBtn.textContent = originalText || "Generate AI summary";
        }
    });
}

function getOrCreateMeetingId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("meetingId") || "";
}

async function saveSummaryToBackend(summaryHtml) {
    const meetingId = getOrCreateMeetingId();
    const { email: hostEmail, meetingDate } = hostContext;

    console.log("💾 Attempting to save summary to MongoDB...");
    console.log("   Meeting ID:", meetingId);
    console.log("   Host Email:", hostEmail);
    console.log("   Meeting Date:", meetingDate);
    console.log("   Summary length:", summaryHtml.length, "characters");

    try {
        const response = await fetch("/api/summaries", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ meetingId, summaryHtml, hostEmail, meetingDate })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
            console.error("❌ Failed to save summary:", data);
            alert("Failed to save summary to database. Check console for details.");
        } else {
            console.log("✅ Summary saved successfully!");
            console.log("   Document ID:", data.id);
            console.log("   Database: ai-meeting-buddy");
            console.log("   Collection: meetingsummaries");
            console.log("   You can view it in MongoDB Compass or via GET /api/summaries");
        }
    } catch (err) {
        console.error("❌ Error calling /api/summaries:", err);
        alert("Error connecting to server. Make sure the server is running.");
    }
}

function getOrPromptHostContext() {
    return hostContext;
}

function promptForHostContext() {
    return hostContext;
}

// Share this host's email with others once socket is connected
// socket.on("connect", () => {
//   const ctx = hostContext || getOrPromptHostContext();
//   const meetingId = getOrCreateMeetingId();
//   const meetingDate = ctx?.meetingDate || new Date().toISOString().slice(0, 10);

//   socket.emit("join-meeting", { meetingId });

//   if (ctx?.email) {
//     socket.emit("host-info", { 
//       email: ctx.email,
//       meetingId: meetingId,
//       meetingDate: meetingDate,
//       isHost: true
//     });
//   }
// });

// Receive other peers' email information
socket.on("peer-info", (data) => {
    if (!data?.socketId || !data.email) return;
    peerInfo[data.socketId] = { email: data.email };
    const label = document.getElementById(`peer-label-${data.socketId}`);
    if (label) {
        label.innerText = data.email;
    }
});

// Load face-api.js models
async function loadFaceAPI() {
    console.log("Loading face-api models...");
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    console.log("Models loaded.");
}

// Get local media
async function initMedia() {
    console.log("Initializing media...");
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        setupVolumeMonitoring(localStream, localVideoContainer);
        if (cameraLoading) {
            cameraLoading.style.display = "none";
        }
    } catch (err) {
        console.error("Error accessing media devices:", err);
        alert(`Error accessing media devices: ${err.name} - ${err.message}`);
        if (cameraLoading) {
            cameraLoading.querySelector("p").textContent = "Camera error. Check permissions.";
        }
    }
}

// Face detection
async function detectFace() {
    if (!localStream || !localVideo.srcObject || localVideo.paused || localVideo.ended || !faceapi.nets.tinyFaceDetector.params) {
        return;
    }
    const detections = await faceapi.detectAllFaces(localVideo, new faceapi.TinyFaceDetectorOptions());
    if (detections.length > 0 && detections[0].score) {
        const engagement = (detections[0].score * 100).toFixed(2);
        engagementDiv.innerText = `Engagement: ${engagement}%`;
    } else {
        engagementDiv.innerText = "Engagement: 0%";
    }
}

function createPeerConnection(socketId, isCaller) {
    const pc = new RTCPeerConnection({
        iceServers: [
            // Multiple Google STUN servers for better IP resolution
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },

            // TURN server on standard port 80
            {
                urls: "turn:openrelay.metered.ca:80",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            // TURN server on port 443 (Bypasses most strict firewalls!)
            {
                urls: "turn:openrelay.metered.ca:443",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            {
                urls: "turn:openrelay.metered.ca:443?transport=tcp",
                username: "openrelayproject",
                credential: "openrelayproject"
            }
        ]
    });

    // 🔍 DEBUG CONNECTION STATES
    pc.onconnectionstatechange = () => {
        console.log("Connection state with", socketId, ":", pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
        console.log("ICE state:", pc.iceConnectionState);
        if (pc.iceConnectionState === "failed") {
            console.log("ICE failed — restarting");
            pc.restartIce();
        }
    };

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("ice-candidate", { candidate: event.candidate, socketId: socketId });
        }
    };

    pc.ontrack = event => {
        let remoteVideo = document.getElementById(`video-${socketId}`);
        if (!remoteVideo) {
            remoteVideo = document.createElement('video');
            remoteVideo.id = `video-${socketId}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsinline = true;

            const videoContainer = document.createElement('div');
            videoContainer.id = `video-container-${socketId}`;
            videoContainer.classList.add('video-container', 'rounded-lg', 'overflow-hidden');
            videoContainer.appendChild(remoteVideo);

            const nameOverlay = document.createElement('div');
            nameOverlay.id = `peer-label-${socketId}`;
            nameOverlay.classList.add('absolute', 'bottom-0', 'left-0', 'bg-black/50', 'text-white', 'text-xs', 'px-2', 'py-1');
            const info = peerInfo[socketId];
            nameOverlay.innerText = info?.email || `Peer ${socketId.substring(0, 5)}`;
            videoContainer.appendChild(nameOverlay);

            // --- ADD THIS NEW BUTTON BLOCK ---
            const makeHostBtn = document.createElement('button');
            makeHostBtn.id = `make-host-${socketId}`;
            makeHostBtn.innerText = "Make Host";
            // Button is hidden by default unless you are the host
            makeHostBtn.className = `make-host-btn absolute top-2 right-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-md transition-all z-10 ${isMeetingHost ? '' : 'hidden'}`;

            makeHostBtn.onclick = () => {
                const targetEmail = peerInfo[socketId]?.email || 'this participant';
                if (confirm(`Transfer host role to ${targetEmail}? You will become a regular participant.`)) {
                    const meetingId = new URLSearchParams(window.location.search).get("meetingId");

                    // Tell server to transfer
                    socket.emit("manual-transfer-host", { targetSocketId: socketId, meetingId });

                    // Update our own state locally
                    isMeetingHost = false;
                    updateHostUI(); // Hides the buttons
                    showToast(`Host role transferred to ${targetEmail}`);
                }
            };
            videoContainer.appendChild(makeHostBtn);
            // --- END OF NEW BUTTON BLOCK ---

            remoteVideosContainer.appendChild(videoContainer);
        }

        console.log("Track received from", socketId);

        // Fix: Only set the srcObject if it hasn't been set to this stream yet
        // This prevents the video from stuttering/resetting when the audio track arrives
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }

        remoteVideo.play().catch(err => {
            console.warn("Autoplay blocked:", err);
        });

        if (event.track.kind === 'audio') {
            const remoteStream = new MediaStream([event.track]);
            setupVolumeMonitoring(remoteStream, document.getElementById(`video-container-${socketId}`));
        }
    };

    peerConnections[socketId] = pc;

    // Add local tracks to the peer connection
    const addLocalTracks = () => {
        if (localStream) {
            localStream.getTracks().forEach(track => {
                const senders = pc.getSenders();
                const trackExists = senders.some(sender => sender.track === track);
                if (!trackExists) {
                    pc.addTrack(track, localStream);
                }
            });
        }
    };

    // Ensure tracks are added before creating offer
    addLocalTracks();

    if (isCaller) {
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                socket.emit("offer", {
                    offer: pc.localDescription,
                    socketId: socketId
                });
            })
            .catch(err => console.error("Error creating offer:", err));
    }

    return pc;
}

socket.on("new-peer", ({ socketId }) => {
    if (!localStream) return;

    if (!peerConnections[socketId]) {
        // EXISTING user should NOT create offer
        createPeerConnection(socketId, false);
    }
});


// Receive existing peers when joining and create connections to them
socket.on("existing-peers", ({ peerIds }) => {

    const connectPeers = () => {
        peerIds.forEach(socketId => {
            if (!peerConnections[socketId]) {
                createPeerConnection(socketId, true);
            }
        });
    };

    if (localStream) {
        connectPeers();
    } else {
        const interval = setInterval(() => {
            if (localStream) {
                clearInterval(interval);
                connectPeers();
            }
        }, 100);
    }
});


// --- NEW HELPER FUNCTION TO PROCESS QUEUED CANDIDATES ---
async function processIceQueue(socketId, pc) {
    if (iceCandidateQueues[socketId]) {
        for (const candidate of iceCandidateQueues[socketId]) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.error("Error adding queued ICE candidate:", err);
            }
        }
        delete iceCandidateQueues[socketId]; // Clear the queue after processing
    }
}

socket.on("offer", async data => {
    let pc = peerConnections[data.socketId];

    if (!pc) {
        pc = createPeerConnection(data.socketId, false);
    }

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        // Process any ICE candidates that arrived before the offer
        await processIceQueue(data.socketId, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
            answer: pc.localDescription,
            socketId: data.socketId
        });
    } catch (err) {
        console.error("Error handling offer:", err);
    }
});

socket.on("answer", async data => {
    console.log("Received answer from:", data.socketId);
    const pc = peerConnections[data.socketId];
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));

            // Process any ICE candidates that arrived before the answer
            await processIceQueue(data.socketId, pc);
        } catch (err) {
            console.error("Error setting remote description for answer:", err);
        }
    }
});

socket.on("ice-candidate", async data => {
    console.log("Received ICE candidate from:", data.socketId);
    const pc = peerConnections[data.socketId];
    if (pc && data.candidate) {
        if (pc.remoteDescription) {
            // Connection is ready, add it immediately
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (err) {
                console.error("Error adding ICE candidate:", err);
            }
        } else {
            // Connection is NOT ready, queue it up!
            if (!iceCandidateQueues[data.socketId]) {
                iceCandidateQueues[data.socketId] = [];
            }
            iceCandidateQueues[data.socketId].push(data.candidate);
        }
    }
});

socket.on("peer-disconnected", async data => {
    console.log("Peer disconnected:", data.socketId);

    // Fix: Added meetingDate to prevent 400 Bad Request
    const meetingId = new URLSearchParams(window.location.search).get("meetingId");
    const ctx = hostContext || getOrPromptHostContext();
    const meetingDate = ctx?.meetingDate || new Date().toISOString().slice(0, 10);
    const peerEmail = peerInfo[data.socketId]?.email;

    if (peerEmail) {
        try {
            const response = await fetch("/api/participants", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    meetingId,
                    participantEmail: peerEmail,
                    socketId: data.socketId,
                    meetingDate: meetingDate, // <-- Missing field added here
                    action: "leave"
                })
            });
            const result = await response.json();
            if (result.ok) {
                console.log("✅ Peer leave saved:", peerEmail);
            }
        } catch (err) {
            console.error("Error saving peer leave:", err);
        }
    }

    const pc = peerConnections[data.socketId];
    if (pc) {
        pc.close();
        delete peerConnections[data.socketId];
    }
    delete peerInfo[data.socketId];
    delete iceCandidateQueues[data.socketId]; // Clean up queue memory

    const remoteVideoContainer = document.getElementById(`video-container-${data.socketId}`);
    if (remoteVideoContainer) {
        remoteVideoContainer.remove();
    }
});

// --- NEW LEAVE & HOST LOGIC ---

const leaveModal = document.getElementById("leaveModal");
const hostOptions = document.getElementById("hostOptions");
const guestOptions = document.getElementById("guestOptions");
const postCallScreen = document.getElementById("postCallScreen");
const rejoinBtn = document.getElementById("rejoinBtn");
const goHomeBtn = document.getElementById("goHomeBtn");

// 1. Show the warning modal when Leave is clicked
leaveBtn.onclick = () => {
    leaveModal.classList.remove("hidden");
    if (isMeetingHost) {
        hostOptions.classList.remove("hidden");
        hostOptions.classList.add("flex");
    } else {
        guestOptions.classList.remove("hidden");
        guestOptions.classList.add("flex");
    }
};

// 2. Cancel Leave
document.getElementById("cancelLeaveBtn").onclick = () => {
    leaveModal.classList.add("hidden");
    hostOptions.classList.add("hidden");
    guestOptions.classList.add("hidden");
};

// 3. Guest confirms leave
document.getElementById("confirmLeaveBtn").onclick = () => {
    executeLeave(false); // Guest just leaves
};

// 4. Host leaves but keeps meeting active
document.getElementById("leaveOnlyBtn").onclick = () => {
    const meetingId = new URLSearchParams(window.location.search).get("meetingId");
    socket.emit("transfer-host", { meetingId }); // Pass the baton
    executeLeave(false);
};

// 5. Host ENDS the call for everyone
document.getElementById("endCallBtn").onclick = () => {
    const meetingId = new URLSearchParams(window.location.search).get("meetingId");
    socket.emit("end-meeting", { meetingId }); // Kill the room
    executeLeave(true); // True = Meeting is dead
};

// 6. Navigation Buttons on the Post-Call Screen
rejoinBtn.onclick = () => window.location.reload();
goHomeBtn.onclick = () => window.location.href = "/";

// 7. Core cleanup function
async function executeLeave(isMeetingEndedByHost) {
    leaveModal.classList.add("hidden"); // Hide warning

    // Save to DB
    const meetingId = new URLSearchParams(window.location.search).get("meetingId");
    const ctx = hostContext || getOrPromptHostContext();
    if (ctx?.email && socket.id) {
        fetch("/api/participants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                meetingId, participantEmail: ctx.email, socketId: socket.id,
                meetingDate: ctx?.meetingDate || new Date().toISOString().slice(0, 10),
                action: "leave"
            })
        }).catch(err => console.error(err));
    }

    // Shut down camera and connections
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    for (const socketId in peerConnections) {
        if (peerConnections[socketId]) peerConnections[socketId].close();
    }
    remoteVideosContainer.innerHTML = '';
    localVideo.srcObject = null;
    socket.disconnect();

    // Show Post-Call Screen
    postCallScreen.classList.remove("hidden");

    if (isMeetingEndedByHost) {
        document.getElementById("postCallTitle").innerText = "Meeting Ended";
        document.getElementById("postCallSubtitle").innerText = "The host has ended this meeting for everyone.";
        rejoinBtn.classList.add("hidden"); // No rejoining allowed
    } else {
        document.getElementById("postCallTitle").innerText = "You left the meeting";
        document.getElementById("postCallSubtitle").innerText = "The meeting is still ongoing.";
        rejoinBtn.classList.remove("hidden"); // Rejoin is allowed
    }
}

// 8. Listeners for host actions happening to US
socket.on("meeting-force-ended", () => {
    // If we receive this, the host killed the call. Force us out.
    executeLeave(true);
});

socket.on("you-are-new-host", () => {
    isMeetingHost = true;
    showToast("You are now the meeting host.");
    updateHostUI(); // Reveals the "Make Host" buttons on your screen
});




muteBtn.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        localVideoContainer.classList.toggle('is-muted', !audioTrack.enabled);

        // --> ADD THIS: Tell others we muted/unmuted
        const meetingId = new URLSearchParams(window.location.search).get("meetingId");
        socket.emit('media-state', { meetingId, video: localStream.getVideoTracks()[0]?.enabled, audio: audioTrack.enabled });

        muteBtn.innerHTML = audioTrack.enabled
            ? `<svg class="size-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14q.825 0 1.413-.588T14 12V6q0-.825-.588-1.413T12 4q-.825 0-1.413.588T10 6v6q0 .825.588 1.413T12 14Zm-1 7v-3.075q-2.6-.35-4.3-2.325T5 11H7q0 2.075 1.463 3.538T12 16q2.075 0 3.538-1.463T17 11h2q0 2.5-1.7 4.475T13 17.925V21h-2Zm1-6q.425 0 .713-.288T13 12V6q0-.425-.288-.713T12 5q-.425 0-.713.288T11 6v6q0 .425.288.713T12 8Z"/></svg>`
            : `<svg class="size-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="m14.825 16.25-2.1-2.1q.275-.275.425-.625t.15-.725V6q0-.825-.588-1.413T12 4q-.825 0-1.413.588T10 6v4.175l-1.8-1.8H7q0 2.5 1.7 4.475T13 17.925V21h-2v-3.075q-.525-.075-1.025-.25t-.975-.425l-1.425 1.425q1.15.8 2.425 1.287T12 20q2.925 0 5.213-1.763T19 13.15V11h-2v.15q0 .825-.363 1.563t-.987 1.287ZM21.9 21.9 20.5 23.3l-4.5-4.5q-1.05.7-2.25 1.05T11.5 20.5v-2.05q.4-.05.775-.175t.725-.325L12 16.5l-2.625-2.625L3.5 18.05l-1.4-1.4L7.95 10.8l-3.1-3.1L3.45 6.3 2.05 4.9 3.45 3.5l18.45 18.4Z"/></svg>`;
    }
};

cameraBtn.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        localVideoContainer.classList.toggle('camera-off', !videoTrack.enabled);

        // --> ADD THIS: Tell others we turned camera on/off
        const meetingId = new URLSearchParams(window.location.search).get("meetingId");
        socket.emit('media-state', { meetingId, video: videoTrack.enabled, audio: localStream.getAudioTracks()[0]?.enabled });

        cameraBtn.innerHTML = videoTrack.enabled
            ? `<svg class="size-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l2.29 2.29c.63.63 1.71.18 1.71-.71V8.91c0-.89-1.08-1.34-1.71-.71L17 10.5zM15 16H5V8h10v8z"/></svg>`
            : `<svg class="size-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l2.29 2.29c.63.63 1.71.18 1.71-.71V8.91c0-.89-1.08-1.34-1.71-.71L17 10.5zM15 16H5V8h10v8zM2 2.27L4.28 4.55l-1.73 1.73L1 7.83V19c0 .55.45 1 1 1h13.17l2.55 2.55L18.27 24l-16-16L2.27 2z"/></svg>`;
    }
};

function setupVolumeMonitoring(stream, targetElement) {
    if (!audioContext) {
        audioContext = new AudioContext();
    }
    if (stream.getAudioTracks().length === 0) return;

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.minDecibels = -100;
    analyser.maxDecibels = 0;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function getVolume() {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        dataArray.forEach(value => sum += value);
        const avg = sum / dataArray.length;
        // Convert to dB. This is a simplification.
        const volume = 20 * Math.log10(avg / 255);

        if (volume > speakingThreshold) {
            targetElement.classList.add('is-speaking');
        } else {
            targetElement.classList.remove('is-speaking');
        }
        requestAnimationFrame(getVolume);
    }
    getVolume();
}

async function main() {
    try {
        const meRes = await fetch("/api/auth/me");
        const meData = await meRes.json().catch(() => ({}));
        if (!meRes.ok || !meData.ok || !meData.user) {
            window.location.href = "/";
            return;
        }
        currentUser = meData.user;
        hostContext.email = currentUser.email;
        hostContext.meetingDate = new Date().toISOString().slice(0, 10);
    } catch {
        window.location.href = "/";
        return;
    }

    await loadFaceAPI();
    await initMedia();

    const meetingId = initializeMeetingId();
    if (!meetingId) return;

    let meetingInfo = null;
    try {
        const meetingRes = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}`);
        const meetingData = await meetingRes.json().catch(() => ({}));
        if (!meetingRes.ok || !meetingData.ok) {
            alert(meetingData.error || "Meeting not found or inaccessible.");
            window.location.href = "/dashboard";
            return;
        }
        meetingInfo = meetingData;
        isMeetingHost = !!meetingData.isHost;
        updateHostUI();
    } catch {
        alert("Unable to load meeting details.");
        window.location.href = "/dashboard";
        return;
    }

    const ctx = hostContext;
    const meetingDate = ctx?.meetingDate || new Date().toISOString().slice(0, 10);

    socket.emit("join-meeting", { meetingId });

    if (ctx?.email) {
        socket.emit("host-info", {
            email: ctx.email,
            meetingId,
            meetingDate,
            isHost: isMeetingHost // <-- CHANGED from 'true'
        });
    }

    setInterval(detectFace, 1000);
}




main();

// -------------------------
// Stats (per-peer, non-intrusive)
// -------------------------
const prevSnapshots = {}; // { socketId: { timestamp, audio:{bytesReceived,packetsReceived,packetsLost}, video:{bytesReceived,packetsReceived,packetsLost,framesDecoded} } }

function toKbps(bytesDelta, msDelta) {
    if (msDelta <= 0) return 0;
    return Math.round((bytesDelta * 8) / msDelta);
}

async function collectPeerStats(socketId, pc) {
    const now = Date.now();
    const snapshot = prevSnapshots[socketId] || { timestamp: 0, audio: { bytesReceived: 0, packetsReceived: 0, packetsLost: 0 }, video: { bytesReceived: 0, packetsReceived: 0, packetsLost: 0, framesDecoded: 0 } };

    const reports = await pc.getStats();
    let inboundAudio;
    let inboundVideo;
    let remoteInboundAudio; // how peer perceives our outbound audio
    let remoteInboundVideo; // how peer perceives our outbound video
    let rttMs = null;
    let outKbps = null;
    let inKbps = null;

    reports.forEach(report => {
        if (report.type === 'inbound-rtp') {
            if (report.kind === 'audio') inboundAudio = report;
            if (report.kind === 'video') inboundVideo = report;
        }
        if (report.type === 'remote-inbound-rtp') {
            if (report.kind === 'audio') remoteInboundAudio = report;
            if (report.kind === 'video') remoteInboundVideo = report;
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
            if (typeof report.currentRoundTripTime === 'number') rttMs = Math.round(report.currentRoundTripTime * 1000);
            if (typeof report.availableOutgoingBitrate === 'number') outKbps = Math.round(report.availableOutgoingBitrate / 1000);
            if (typeof report.availableIncomingBitrate === 'number') inKbps = Math.round(report.availableIncomingBitrate / 1000);
        }
    });

    const msDelta = snapshot.timestamp ? (now - snapshot.timestamp) : 1000;

    // Audio deltas
    const aBytes = inboundAudio?.bytesReceived || 0;
    const aPkts = inboundAudio?.packetsReceived || 0;
    const aLost = inboundAudio?.packetsLost || 0;
    const aJitterMs = typeof inboundAudio?.jitter === 'number' ? Math.round(inboundAudio.jitter * 1000) : null;
    const aBytesDelta = Math.max(0, aBytes - snapshot.audio.bytesReceived);
    const aPktsDelta = Math.max(0, aPkts - snapshot.audio.packetsReceived);
    const aLostDelta = Math.max(0, aLost - snapshot.audio.packetsLost);
    const aBitrate = toKbps(aBytesDelta, msDelta);
    const aLossPct = (aLostDelta + aPktsDelta) > 0 ? Math.round((aLostDelta / (aLostDelta + aPktsDelta)) * 1000) / 10 : 0;

    // Video deltas
    const vBytes = inboundVideo?.bytesReceived || 0;
    const vPkts = inboundVideo?.packetsReceived || 0;
    const vLost = inboundVideo?.packetsLost || 0;
    const vJitterMs = typeof inboundVideo?.jitter === 'number' ? Math.round(inboundVideo.jitter * 1000) : null;
    const framesDecoded = inboundVideo?.framesDecoded || 0;
    const vBytesDelta = Math.max(0, vBytes - snapshot.video.bytesReceived);
    const vPktsDelta = Math.max(0, vPkts - snapshot.video.packetsReceived);
    const vLostDelta = Math.max(0, vLost - snapshot.video.packetsLost);
    const vBitrate = toKbps(vBytesDelta, msDelta);
    const vLossPct = (vLostDelta + vPktsDelta) > 0 ? Math.round((vLostDelta / (vLostDelta + vPktsDelta)) * 1000) / 10 : 0;
    const fps = snapshot.video.framesDecoded ? Math.max(0, Math.round((framesDecoded - snapshot.video.framesDecoded) * (1000 / msDelta))) : null;

    // Outbound as seen by peer
    const outAudioRttMs = typeof remoteInboundAudio?.roundTripTime === 'number' ? Math.round(remoteInboundAudio.roundTripTime * 1000) : null;
    const outAudioLossPct = typeof remoteInboundAudio?.fractionLost === 'number' ? Math.round(Math.max(0, Math.min(1, remoteInboundAudio.fractionLost)) * 100) : null;
    const outVideoRttMs = typeof remoteInboundVideo?.roundTripTime === 'number' ? Math.round(remoteInboundVideo.roundTripTime * 1000) : null;
    const outVideoLossPct = typeof remoteInboundVideo?.fractionLost === 'number' ? Math.round(Math.max(0, Math.min(1, remoteInboundVideo.fractionLost)) * 100) : null;

    // Resolution from the element
    const remoteEl = document.getElementById(`video-${socketId}`);
    const remoteWidth = remoteEl?.videoWidth || 0;
    const remoteHeight = remoteEl?.videoHeight || 0;

    // Save snapshot
    prevSnapshots[socketId] = {
        timestamp: now,
        audio: { bytesReceived: aBytes, packetsReceived: aPkts, packetsLost: aLost },
        video: { bytesReceived: vBytes, packetsReceived: vPkts, packetsLost: vLost, framesDecoded }
    };

    return { socketId, rttMs, outKbps, inKbps, aBitrate, aJitterMs, aLossPct, vBitrate, vJitterMs, vLossPct, fps, remoteWidth, remoteHeight, outAudioRttMs, outAudioLossPct, outVideoRttMs, outVideoLossPct };
}

setInterval(async () => {
    if (!statsDiv) return;
    const ids = Object.keys(peerConnections);
    if (ids.length === 0) { statsDiv.innerHTML = ''; return; }
    const results = await Promise.all(ids.map(id => collectPeerStats(id, peerConnections[id])));
    const lines = [];
    results.forEach(r => {
        const peerName = peerInfo[r.socketId]?.email || `Peer ${r.socketId.substring(0, 5)}`;
        lines.push(`<strong>${peerName}</strong>`);
        if (r.rttMs !== null) lines.push(`RTT: ${r.rttMs} ms`);
        if (r.outKbps !== null) lines.push(`Avail Out: ${r.outKbps} kbps`);
        if (r.inKbps !== null) lines.push(`Avail In: ${r.inKbps} kbps`);
        lines.push(`Audio: ${r.aBitrate} kbps${r.aJitterMs !== null ? `, jitter ${r.aJitterMs} ms` : ''}, loss ${r.aLossPct}%`);
        lines.push(`Video: ${r.vBitrate} kbps${r.vJitterMs !== null ? `, jitter ${r.vJitterMs} ms` : ''}, loss ${r.vLossPct}%${r.fps !== null ? `, FPS ${r.fps}` : ''}, res ${r.remoteWidth}x${r.remoteHeight}`);
        if (r.outAudioLossPct !== null || r.outAudioRttMs !== null || r.outVideoLossPct !== null || r.outVideoRttMs !== null) {
            lines.push(`Outbound (peer view): audio loss ${r.outAudioLossPct ?? '-'}%, rtt ${r.outAudioRttMs ?? '-'} ms; video loss ${r.outVideoLossPct ?? '-'}%, rtt ${r.outVideoRttMs ?? '-'} ms`);
        }
        lines.push('<br>');
    });
    statsDiv.innerHTML = lines.join('<br>');
}, 1000);

// ==========================================
// SMART GRID & ENGAGEMENT SHUFFLING LOGIC
// ==========================================

// Listen for peer media state changes
socket.on('peer-media-state', (data) => {
    if (!peerInfo[data.socketId]) peerInfo[data.socketId] = {};
    peerInfo[data.socketId].videoOn = data.video;
    peerInfo[data.socketId].audioOn = data.audio;
    updateGridLayout(); // Immediately apply sort
});

function getPeerScore(id) {
    let score = 0;
    const container = document.getElementById(`video-container-${id}`);

    // 1. Highest priority: Speaking right now
    if (container && container.classList.contains('is-speaking')) score += 1000;
    // 2. Medium priority: Video is ON
    if (peerInfo[id]?.videoOn !== false) score += 500;
    // 3. Low priority: Mic is unmuted (even if not speaking)
    if (peerInfo[id]?.audioOn !== false) score += 200;

    return score;
}

function updateGridLayout() {
    if (!remoteVideosContainer) return;
    const remoteContainers = Array.from(remoteVideosContainer.children);
    if (remoteContainers.length === 0) return;

    // Sort remote containers based on engagement score
    remoteContainers.sort((a, b) => {
        const idA = a.id.replace('video-container-', '');
        const idB = b.id.replace('video-container-', '');
        return getPeerScore(idB) - getPeerScore(idA); // Descending order
    });

    const MAX_VISIBLE_REMOTES = 2; // Local + 2 Remotes = 3 Total Visible Cards

    remoteContainers.forEach((container, index) => {
        // Clean up old overlay badges
        const oldOverlay = container.querySelector('.plus-n-overlay');
        if (oldOverlay) oldOverlay.remove();

        if (index < MAX_VISIBLE_REMOTES) {
            container.style.display = ''; // Show
            remoteVideosContainer.appendChild(container); // Reorder DOM based on sort!

            // If it's the 3rd total slot and there are hidden peers, add the badge
            if (index === MAX_VISIBLE_REMOTES - 1 && remoteContainers.length > MAX_VISIBLE_REMOTES) {
                const hiddenCount = remoteContainers.length - MAX_VISIBLE_REMOTES;
                const badge = document.createElement('div');
                badge.className = 'plus-n-overlay absolute bottom-3 right-3 bg-slate-900/80 px-3 py-1.5 rounded-md text-white text-sm font-bold backdrop-blur-md z-20 shadow-lg border border-white/10';
                badge.innerText = `+${hiddenCount} others`;
                badge.title = "Hidden participants will move to the front when they speak.";
                container.appendChild(badge);
            }
        } else {
            container.style.display = 'none'; // Hide overflow peers
            remoteVideosContainer.appendChild(container); // Keep them in sorted order in the DOM
        }
    });
}

// Run the shuffler constantly to react to volume changes
setInterval(updateGridLayout, 1500);

// Initial emit of our media state once connected
setTimeout(() => {
    const meetingId = new URLSearchParams(window.location.search).get("meetingId");
    if (localStream && meetingId) {
        socket.emit('media-state', {
            meetingId: meetingId,
            video: localStream.getVideoTracks()[0]?.enabled ?? true,
            audio: localStream.getAudioTracks()[0]?.enabled ?? true
        });
    }
}, 2000);



// ==========================================
// CHAT & SIDEBAR TAB LOGIC
// ==========================================
const tabAiBtn = document.getElementById("tabAiBtn");
const tabChatBtn = document.getElementById("tabChatBtn");
const panelAi = document.getElementById("panelAi");
const panelChat = document.getElementById("panelChat");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatMessages = document.getElementById("chatMessages");

// Tab Switching
tabAiBtn.onclick = () => {
    panelAi.classList.remove("hidden");
    panelChat.classList.add("hidden");
    tabAiBtn.className = "flex-1 pb-3 text-sm font-bold border-b-2 border-[#8ab4f8] text-[#8ab4f8] transition-colors";
    tabChatBtn.className = "flex-1 pb-3 text-sm font-bold border-b-2 border-transparent text-slate-400 hover:text-white transition-colors";
};

tabChatBtn.onclick = () => {
    panelChat.classList.remove("hidden");
    panelAi.classList.add("hidden");
    tabChatBtn.className = "flex-1 pb-3 text-sm font-bold border-b-2 border-[#8ab4f8] text-[#8ab4f8] transition-colors";
    tabAiBtn.className = "flex-1 pb-3 text-sm font-bold border-b-2 border-transparent text-slate-400 hover:text-white transition-colors";
};

// Chat Functions
function appendChatMessage(senderName, messageText, isSelf) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `flex flex-col ${isSelf ? 'items-end' : 'items-start'}`;

    // Create the bubble
    msgDiv.innerHTML = `
        <span class="text-[10px] text-slate-400 mb-1 ml-1">${senderName}</span>
        <div class="px-4 py-2.5 max-w-[90%] text-sm shadow-sm ${isSelf
            ? 'bg-[#8ab4f8] text-slate-900 rounded-2xl rounded-tr-sm'
            : 'bg-[#3c4043] text-white rounded-2xl rounded-tl-sm border border-white/5'
        }">
            ${messageText}
        </div>
    `;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to bottom
}

function sendChat() {
    const text = chatInput.value.trim();
    if (text) {
        const meetingId = new URLSearchParams(window.location.search).get("meetingId");
        const ctx = hostContext || getOrPromptHostContext();

        socket.emit("chat-message", {
            meetingId: meetingId,
            message: text,
            sender: ctx?.email || "Participant"
        });

        appendChatMessage("You", text, true);
        chatInput.value = "";
    }
}

sendChatBtn.onclick = sendChat;
chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendChat();
});

socket.on("chat-message", (data) => {
    appendChatMessage(data.sender, data.message, false);

    // Optional: Show a subtle notification if they aren't looking at the chat tab
    if (panelChat.classList.contains("hidden") && typeof showToast === "function") {
        showToast(`New message from ${data.sender}`);
    }
});

// ==========================================
// ADVANCED SCREENSHARE & SPOTLIGHT LOGIC
// ==========================================
let screenStream = null;
let isScreenSharing = false;
let isGlobalSharing = false; // Tracks if ANYONE in the room is sharing
const screenShareBtn = document.getElementById("screenShareBtn");

// 1. The Button Click
screenShareBtn.onclick = () => {
    // Check Global Lock
    if (isGlobalSharing && !isScreenSharing) {
        showToast("Someone else is already sharing their screen.");
        return;
    }

    if (!isScreenSharing) {
        if (isMeetingHost) {
            // Host can bypass permissions
            executeScreenShare();
        } else {
            // Participant must ask
            const meetingId = new URLSearchParams(window.location.search).get("meetingId");
            const ctx = hostContext || getOrPromptHostContext();

            socket.emit("request-screenshare", {
                meetingId: meetingId,
                email: ctx?.email || "A participant"
            });
            showToast("Request sent to host. Waiting for approval...");
        }
    } else {
        stopScreenShare();
    }
};

// 2. Execute the Screen Share
async function executeScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Swap camera track for screen track
        for (const id in peerConnections) {
            const pc = peerConnections[id];
            const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (videoSender) videoSender.replaceTrack(screenTrack);
        }

        localVideo.srcObject = screenStream;
        isScreenSharing = true;

        screenShareBtn.classList.add("bg-[#8ab4f8]", "text-slate-900");
        screenShareBtn.classList.remove("bg-[#3c4043]", "text-white");

        // Tell everyone to trigger the Spotlight layout
        const meetingId = new URLSearchParams(window.location.search).get("meetingId");
        socket.emit("screenshare-state", { meetingId, isSharing: true });
        applySpotlightLayout("local-video-container", true);

        // Stop sharing if they use the native Chrome/Edge "Stop Sharing" floating bar
        screenTrack.onended = () => {
            stopScreenShare();
        };
    } catch (err) {
        console.error("Error sharing screen:", err);
    }
}

// 3. Stop Sharing
function stopScreenShare() {
    if (!isScreenSharing) return;
    const cameraTrack = localStream.getVideoTracks()[0];

    // Swap back to camera
    for (const id in peerConnections) {
        const pc = peerConnections[id];
        const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (videoSender && cameraTrack) videoSender.replaceTrack(cameraTrack);
    }

    localVideo.srcObject = localStream;
    if (screenStream) screenStream.getTracks().forEach(t => t.stop());

    isScreenSharing = false;
    screenShareBtn.classList.remove("bg-[#8ab4f8]", "text-slate-900");
    screenShareBtn.classList.add("bg-[#3c4043]", "text-white");

    // Tell everyone to revert to the normal grid
    const meetingId = new URLSearchParams(window.location.search).get("meetingId");
    socket.emit("screenshare-state", { meetingId, isSharing: false });
    applySpotlightLayout("local-video-container", false);
}

// 4. Socket Listeners for Permissions
socket.on("screenshare-requested", (data) => {
    if (isMeetingHost) {
        if (isGlobalSharing) {
            // Auto-deny if the screen is already taken
            socket.emit("screenshare-response", { targetSocketId: data.socketId, approved: false });
            return;
        }

        // Ask the host
        const approved = confirm(`${data.email} wants to share their screen. Allow?`);
        socket.emit("screenshare-response", { targetSocketId: data.socketId, approved });
    }
});

socket.on("screenshare-approved", (data) => {
    if (data.approved) {
        showToast("Host approved your request!");
        executeScreenShare();
    } else {
        showToast("Host denied your screen share request.");
    }
});

// 5. Layout Engine
socket.on("screenshare-state-changed", (data) => {
    isGlobalSharing = data.isSharing;
    const targetContainer = `video-container-${data.socketId}`;
    applySpotlightLayout(targetContainer, data.isSharing);
});

function applySpotlightLayout(containerId, isSharing) {
    const grid = document.querySelector('.meet-grid');
    const container = document.getElementById(containerId);
    if (!grid) return;

    if (isSharing) {
        grid.classList.add('has-screenshare');
        if (container) {
            container.classList.add('is-screenshare');
            // Ensure screens aren't cropped
            const vid = container.querySelector('video');
            if (vid) vid.style.objectFit = "contain";
        }
    } else {
        grid.classList.remove('has-screenshare');
        if (container) {
            container.classList.remove('is-screenshare');
            // Revert face cameras to cover
            const vid = container.querySelector('video');
            if (vid) vid.style.objectFit = "cover";
        }
    }
}

socket.on("join-error", (data) => {
    alert(data?.error || "Could not join meeting.");
    window.location.href = "/dashboard";
});