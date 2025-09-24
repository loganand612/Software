# ConvoCoach - AI Meeting Assistant

ConvoCoach is a WebRTC-based video conferencing application designed to enhance remote and hybrid meetings. It provides real-time, peer-to-peer video and audio communication, supplemented with AI-powered features like live engagement tracking and automated meeting summaries to improve meeting productivity and inclusivity.

## Features
* Real-Time Peer-to-Peer Video/Audio Communication using WebRTC.
* Live Connection Stats (Latency, Packet Loss, Jitter, etc.).
* AI-Powered Live Transcription (Coming Soon).
* AI-Generated Meeting Summaries & Action Items.
* Active Speaker Highlighting.
* Mute/Camera-Off Status Indicators.
* Live Engagement Score based on facial analysis.

## Tech Stack
* **Frontend:** HTML5, CSS3 (Tailwind CSS), Vanilla JavaScript
* **Backend:** Node.js, Express.js
* **Real-Time Communication:** WebRTC, Socket.IO
* **AI/ML:** face-api.js for in-browser face detection

## How to Run Locally

### Prerequisites
* Node.js (v18 or higher)
* npm

### Setup & Installation
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/loganand612/Idea_quest.git
    ```
2.  **Navigate to the project directory:**
    ```bash
    cd hackathon-meet
    ```
3.  **Install dependencies:**
    ```bash
    npm install
    ```

### Running the Application
The application requires a signaling server to run.

1.  **Start the Signaling Server:**
    Open a terminal and run:
    ```bash
    node server.js
    ```
    The server will start on port 5000.

2.  **Serve the Frontend:**
    You need to serve the `index.html` file and its static assets. You can use any simple static file server. If you have `serve` installed, you can run:
    ```bash
    serve .
    ```
    Or, with Python:
    ```bash
    python3 -m http.server 3000
    ```

3.  **Access the Application:**
    Open two browser tabs and navigate to `http://localhost:3000` (or the port you are using for your static file server).

4.  **Tunneling for External Access (Optional):**
    The current configuration in `script.js` points to a ngrok URL for the signaling server. For local development, you should change the socket.io connection URL in `script.js` to your local server:
    ```javascript
    const socket = io("http://localhost:5000");
    ```
    If you need to test with devices on different networks, you can use a tunneling service like ngrok to expose your local signaling server to the internet.