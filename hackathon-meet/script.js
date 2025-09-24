const socket = io("https://untraceable-reba-lowerable.ngrok-free.dev");

const localVideo = document.getElementById("localVideo");
const localVideoContainer = document.getElementById("local-video-container");
const remoteVideosContainer = document.getElementById('remote-videos');
const engagementDiv = document.getElementById("engagementScore");
const leaveBtn = document.getElementById("leaveBtn");
const statsDiv = document.getElementById("stats");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const summaryBox = document.getElementById("summary-box");

const peerConnections = {};
let localStream;
let audioContext;
const speakingThreshold = -50; // dB

// Mock summary generation
setTimeout(() => {
  summaryBox.innerHTML = `
    <p><strong>Meeting Summary:</strong> The team discussed the Q3 roadmap and decided on the main priorities. Alice will take the lead on the new feature development, and Bob will handle the marketing plan.</p>
    <p class="mt-2"><strong>Action Items:</strong></p>
    <ul class="list-disc pl-5">
      <li><strong>Alice:</strong> Draft the initial project spec for the new feature.</li>
      <li><strong>Bob:</strong> Create a draft of the Q3 marketing plan.</li>
    </ul>
  `;
}, 10000); // Show summary after 10 seconds

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
  } catch (err) {
    console.error("Error accessing media devices:", err);
    alert(`Error accessing media devices: ${err.name} - ${err.message}`);
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
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

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
            nameOverlay.classList.add('absolute', 'bottom-0', 'left-0', 'bg-black/50', 'text-white', 'text-xs', 'px-2', 'py-1');
            nameOverlay.innerText = `Peer ${socketId.substring(0, 5)}`;
            videoContainer.appendChild(nameOverlay);

            remoteVideosContainer.appendChild(videoContainer);
        }
        if (!remoteVideo.srcObject) {
            remoteVideo.srcObject = new MediaStream();
        }
        remoteVideo.srcObject.addTrack(event.track);

        if (event.track.kind === 'audio') {
            const remoteStream = new MediaStream([event.track]);
            setupVolumeMonitoring(remoteStream, document.getElementById(`video-container-${socketId}`));
        }
    };

    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    peerConnections[socketId] = pc;

    if (isCaller) {
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                socket.emit("offer", { offer: pc.localDescription, socketId: socketId });
            });
    }

    return pc;
}

socket.on("new-peer", data => {
    console.log("New peer connected:", data.socketId);
    createPeerConnection(data.socketId, true);
});

socket.on("offer", async data => {
    console.log("Received offer from:", data.socketId);
    const pc = createPeerConnection(data.socketId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { answer: pc.localDescription, socketId: data.socketId });
});

socket.on("answer", async data => {
    console.log("Received answer from:", data.socketId);
    const pc = peerConnections[data.socketId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
});

socket.on("ice-candidate", async data => {
    console.log("Received ICE candidate from:", data.socketId);
    const pc = peerConnections[data.socketId];
    if (pc && data.candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error("Error adding ICE candidate:", err);
        }
    }
});

socket.on("peer-disconnected", data => {
    console.log("Peer disconnected:", data.socketId);
    const pc = peerConnections[data.socketId];
    if (pc) {
        pc.close();
        delete peerConnections[data.socketId];
    }
    const remoteVideoContainer = document.getElementById(`video-container-${data.socketId}`);
    if (remoteVideoContainer) {
        remoteVideoContainer.remove();
    }
});

leaveBtn.onclick = () => {
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  for (const socketId in peerConnections) {
      if(peerConnections[socketId]) {
        peerConnections[socketId].close();
      }
  }
  remoteVideosContainer.innerHTML = '';
  localVideo.srcObject = null;
  socket.disconnect();
  console.log("Call ended");
};

muteBtn.onclick = () => {
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    localVideoContainer.classList.toggle('is-muted', !audioTrack.enabled);
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
    await loadFaceAPI();
    await initMedia();
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
    lines.push(`<strong>Peer ${r.socketId}</strong>`);
    if (r.rttMs !== null) lines.push(`RTT: ${r.rttMs} ms`);
    if (r.outKbps !== null) lines.push(`Avail Out: ${r.outKbps} kbps`);
    if (r.inKbps !== null) lines.push(`Avail In: ${r.inKbps} kbps`);
    lines.push(`Audio: ${r.aBitrate} kbps${r.aJitterMs!==null?`, jitter ${r.aJitterMs} ms`:''}, loss ${r.aLossPct}%`);
    lines.push(`Video: ${r.vBitrate} kbps${r.vJitterMs!==null?`, jitter ${r.vJitterMs} ms`:''}, loss ${r.vLossPct}%${r.fps!==null?`, FPS ${r.fps}`:''}, res ${r.remoteWidth}x${r.remoteHeight}`);
    if (r.outAudioLossPct!==null || r.outAudioRttMs!==null || r.outVideoLossPct!==null || r.outVideoRttMs!==null) {
      lines.push(`Outbound (peer view): audio loss ${r.outAudioLossPct??'-'}%, rtt ${r.outAudioRttMs??'-'} ms; video loss ${r.outVideoLossPct??'-'}%, rtt ${r.outVideoRttMs??'-'} ms`);
    }
    lines.push('<br>');
  });
  statsDiv.innerHTML = lines.join('<br>');
}, 1000);