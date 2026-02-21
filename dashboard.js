let currentUser = null;

async function api(path, options = {}) {
    const response = await fetch(path, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Request failed");
    }
    return data;
}

function extractMeetingId(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    try {
        const parsed = new URL(raw);
        const id = new URLSearchParams(parsed.search).get("meetingId");
        return id || raw;
    } catch {
        return raw;
    }
}

function renderHistory(meetings) {
    const list = document.getElementById("historyList");
    if (!meetings.length) {
        list.innerHTML = '<p class="text-slate-500">No meetings found yet.</p>';
        return;
    }

    list.innerHTML = meetings
        .map((meeting) => {
            const roleLabel =
                meeting.participationRole === "hosted"
                    ? "Hosted"
                    : meeting.participationRole === "participated"
                        ? "Participated"
                        : "Hosted + Participated";

            return `
      <div class="border border-slate-800 bg-slate-800/40 rounded-xl p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="font-medium text-slate-100">${meeting.meetingName}</div>
          <span class="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-slate-700 text-slate-300">${roleLabel}</span>
        </div>
        <div class="mt-1 text-xs text-slate-400">${meeting.meetingId}</div>
        <div class="mt-1 text-xs text-slate-500">Status: ${meeting.status}</div>
        ${meeting.description ? `<p class="mt-2 text-xs text-slate-300">${meeting.description}</p>` : ""}
      </div>`;
        })
        .join("");
}

function setObjectives(doc) {
    document.getElementById("objectivesMessage").textContent = doc.message || "No objectives generated yet.";
    document.getElementById("toStartText").value = (doc.toStart || []).map((item) => item.text).join("\n");
    document.getElementById("ongoingText").value = (doc.ongoing || []).map((item) => item.text).join("\n");
}

function parseObjectiveLines(text) {
    return String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ text: line }));
}

async function loadDashboard() {
    try {
        const me = await api("/api/auth/me");
        currentUser = me.user;
    } catch {
        window.location.href = "/";
        return;
    }

    document.getElementById("userMeta").textContent = `${currentUser.name} • ${currentUser.email} • ${currentUser.role}`;

    const isManager = currentUser.role === "manager";
    document.getElementById("managerCreateCard").classList.toggle("hidden", !isManager);
    document.getElementById("managerUserCard").classList.toggle("hidden", !isManager);
    document.getElementById("objectivesCard").classList.toggle("hidden", !isManager);

    const history = await api("/api/meetings/history");
    renderHistory(history.meetings || []);

    if (isManager) {
        const objectives = await api("/api/objectives/current");
        setObjectives(objectives.objectives || {});
    }
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
});

document.getElementById("joinMeetingForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const meetingId = extractMeetingId(document.getElementById("joinMeetingId").value);
    if (!meetingId) return;
    window.location.href = `/meeting?meetingId=${encodeURIComponent(meetingId)}`;
});

const createMeetingForm = document.getElementById("createMeetingForm");
if (createMeetingForm) {
    createMeetingForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        try {
            const data = await api("/api/meetings", {
                method: "POST",
                body: JSON.stringify({
                    meetingName: document.getElementById("meetingName").value.trim(),
                    description: document.getElementById("meetingDescription").value.trim() || null,
                    startsAt: document.getElementById("meetingStartsAt").value || null,
                    endsAt: document.getElementById("meetingEndsAt").value || null,
                }),
            });

            window.location.href = `/meeting?meetingId=${encodeURIComponent(data.meeting.meetingId)}`;
        } catch (err) {
            alert(err.message);
        }
    });
}

const createUserForm = document.getElementById("createUserForm");
if (createUserForm) {
    createUserForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        try {
            await api("/api/auth/users", {
                method: "POST",
                body: JSON.stringify({
                    name: document.getElementById("newUserName").value.trim(),
                    email: document.getElementById("newUserEmail").value.trim(),
                    password: document.getElementById("newUserPassword").value,
                    role: document.getElementById("newUserRole").value,
                }),
            });
            createUserForm.reset();
            alert("User created successfully");
        } catch (err) {
            alert(err.message);
        }
    });
}

const refreshObjectivesBtn = document.getElementById("refreshObjectivesBtn");
if (refreshObjectivesBtn) {
    refreshObjectivesBtn.addEventListener("click", async () => {
        try {
            const data = await api("/api/objectives/refresh", { method: "POST" });
            setObjectives(data.objectives || {});
        } catch (err) {
            alert(err.message);
        }
    });
}

const saveObjectivesBtn = document.getElementById("saveObjectivesBtn");
if (saveObjectivesBtn) {
    saveObjectivesBtn.addEventListener("click", async () => {
        try {
            const data = await api("/api/objectives/current", {
                method: "PUT",
                body: JSON.stringify({
                    toStart: parseObjectiveLines(document.getElementById("toStartText").value),
                    ongoing: parseObjectiveLines(document.getElementById("ongoingText").value),
                }),
            });
            setObjectives(data.objectives || {});
            alert("Objectives saved");
        } catch (err) {
            alert(err.message);
        }
    });
}

loadDashboard();
