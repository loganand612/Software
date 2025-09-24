
[![IdeaQuest Meet](screenshot.png)](screenshot.png)

# IdeaQuest Meet

A modern, AI-powered two-way video call platform built with Node.js, Express, Socket.IO, WebRTC, and a React+Tailwind UI. Easily host, join, and analyze meetings with real-time engagement metrics and AI-generated summaries.

[![IdeaQuest Meet](https://github.com/thilak0105/Idea_Quest/raw/master/hackathon-meet/screenshot.png)](https://github.com/thilak0105/Idea_Quest/tree/master/hackathon-meet)

---

## 🚀 Features

- **Peer-to-peer video calls** using WebRTC
- **Real-time signaling** with Socket.IO
- **Modern UI** built with React and Tailwind CSS
- **AI dashboard**: Engagement scores, speaking time, and meeting summaries
- **Face detection** for live engagement tracking
- **Mute/Camera controls** and meeting leave button
- **Action items and summary box** for post-meeting insights
- **Easy deployment** with ngrok for remote access

---

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm
- [ngrok](https://ngrok.com/) (for public access)

### 1. Install dependencies
```sh
npm install
```

### 2. Start the backend server
```sh
node server.js
```

### 3. Expose your server with ngrok
```sh
ngrok http 5000
```
Copy the HTTPS forwarding URL ngrok gives you (e.g., `https://xxxxxx.ngrok-free.dev`).

### 4. Update the frontend socket URL
Edit `script.js`:
```js
const socket = io("YOUR_NGROK_URL_HERE");
```
Replace with your ngrok URL.

### 5. Open your ngrok URL in a browser
Share this link with teammates to join the meeting.

---

## 🧑‍💻 Project Structure

```
├── hackathon-meet/
│   ├── index.html         # Main UI (React+Tailwind)
│   ├── script.js          # Frontend logic (WebRTC, AI dashboard)
│   ├── server.js          # Express + Socket.IO backend
│   ├── models/            # Face detection models
│   ├── style.css          # Custom styles
│   ├── package.json       # Project dependencies
│   └── README.md          # Project documentation
```

---

## 🤖 AI Dashboard & Features
- **Engagement Score**: Live face detection estimates participant engagement
- **Speaking Time**: Tracks who is speaking and for how long
- **Meeting Summary**: AI-generated summary and action items after each call

---

## 🌐 Deployment & Remote Access
- Use ngrok to make your server accessible over the internet
- Share your ngrok URL for teammates to join from anywhere

---

## 📦 Dependencies
- express
- socket.io
- face-api.js
- WebRTC (native browser API)
- React
- Tailwind CSS

---

## 📝 License
MIT

---

## 👥 Contributors
- Thilak L
- Your Team

---

## 💡 Inspiration
Built for the IdeaQuest hackathon to showcase real-time AI-powered meeting experiences.

---

## 📣 How to Contribute
Pull requests and issues are welcome! Please open an issue for major changes first.

---

## 📞 Contact
For questions or demo requests, open an issue or contact the maintainer via [GitHub](https://github.com/thilak0105/Idea_Quest/tree/master/hackathon-meet).