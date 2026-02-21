# Project Modules - Software Engineering Documentation

## Overview
**IdeaQuest Meet** is a real-time video conferencing application with AI-powered features including engagement tracking, meeting summaries, and peer-to-peer video communication.

---

## Module Architecture

### 1. **Frontend Module** (`index.html`, `script.js`, `style.css`)

#### 1.1 User Interface Module (`index.html`)
- **Purpose**: Main HTML structure and UI layout
- **Components**:
  - Header with branding and leave button
  - Video grid for local and remote participants
  - AI Summary section with notes input
  - Stats panel for connection metrics
  - Engagement score display
  - Tips section
- **Dependencies**: Tailwind CSS, Socket.IO client, Face-API.js
- **Responsibilities**:
  - Render the application UI
  - Provide user interaction elements
  - Display video streams and controls

#### 1.2 Client-Side Logic Module (`script.js`)
- **Purpose**: Frontend application logic and WebRTC management
- **Sub-modules**:

##### 1.2.1 WebRTC Connection Manager
- **Functions**: `createPeerConnection()`, `initMedia()`
- **Responsibilities**:
  - Establish peer-to-peer connections
  - Handle offer/answer exchange
  - Manage ICE candidates
  - Stream local and remote media

##### 1.2.2 Socket.IO Client Handler
- **Functions**: Socket event listeners (`new-peer`, `offer`, `answer`, `ice-candidate`, `peer-disconnected`)
- **Responsibilities**:
  - Connect to signaling server
  - Exchange signaling data with peers
  - Broadcast host information
  - Handle peer discovery

##### 1.2.3 Face Detection & Engagement Module
- **Functions**: `loadFaceAPI()`, `detectFace()`
- **Responsibilities**:
  - Load face detection models
  - Detect faces in video stream
  - Calculate engagement scores
  - Update engagement display

##### 1.2.4 Audio Analysis Module
- **Functions**: `setupVolumeMonitoring()`, `getVolume()`
- **Responsibilities**:
  - Monitor audio levels using Web Audio API
  - Detect speaking activity
  - Visual feedback for active speakers
  - Track audio streams per peer

##### 1.2.5 AI Summary Integration Module
- **Functions**: `saveSummaryToBackend()`, `getOrPromptHostContext()`
- **Responsibilities**:
  - Collect meeting notes from user
  - Send notes to backend for AI processing
  - Display generated summaries
  - Persist summaries to database

##### 1.2.6 Connection Statistics Module
- **Functions**: `collectPeerStats()`, `toKbps()`
- **Responsibilities**:
  - Collect WebRTC statistics per peer
  - Calculate bitrates, packet loss, jitter
  - Monitor RTT (Round Trip Time)
  - Display connection quality metrics

##### 1.2.7 Media Controls Module
- **Functions**: Mute/camera toggle handlers
- **Responsibilities**:
  - Toggle audio/video tracks
  - Update UI indicators
  - Handle leave call functionality

##### 1.2.8 Session Management Module
- **Functions**: `getOrCreateMeetingId()`, `getOrPromptHostContext()`
- **Responsibilities**:
  - Generate unique meeting IDs
  - Store host context in session storage
  - Manage meeting metadata

#### 1.3 Styling Module (`style.css`)
- **Purpose**: Custom CSS styles and design tokens
- **Components**:
  - Design tokens (colors, gradients, fonts)
  - Video container styles
  - Control bar styling
  - Dashboard panel layouts
  - Responsive design rules
  - Animation keyframes

---

### 2. **Backend Module** (`server.js`)

#### 2.1 Express Server Module
- **Purpose**: HTTP server and API endpoints
- **Sub-modules**:

##### 2.1.1 Static File Server
- **Routes**: `GET /`, static file serving
- **Responsibilities**:
  - Serve HTML, CSS, JS files
  - Serve face detection models
  - Handle static asset requests

##### 2.1.2 Meeting Summary API
- **Routes**: `POST /api/summaries`
- **Responsibilities**:
  - Store meeting summaries in MongoDB
  - Validate input data
  - Return summary IDs

##### 2.1.3 AI Summary Generation API
- **Routes**: `POST /api/generate-summary`
- **Responsibilities**:
  - Integrate with OpenAI API
  - Generate HTML summaries from notes
  - Handle AI processing errors
  - Return formatted summaries

#### 2.2 Socket.IO Signaling Server Module
- **Purpose**: WebRTC signaling and peer coordination
- **Sub-modules**:

##### 2.2.1 Connection Manager
- **Events**: `connection`, `disconnect`
- **Responsibilities**:
  - Track connected peers
  - Maintain peer information map
  - Broadcast peer events

##### 2.2.2 Signaling Handler
- **Events**: `offer`, `answer`, `ice-candidate`, `host-info`, `peer-info`
- **Responsibilities**:
  - Relay WebRTC signaling messages
  - Forward offers/answers between peers
  - Distribute ICE candidates
  - Manage peer discovery

##### 2.2.3 Peer Information Manager
- **Data Structures**: `peerInfoMap`, `connectedPeers`
- **Responsibilities**:
  - Store peer email information
  - Track active connections
  - Broadcast peer metadata

#### 2.3 Database Module
- **Purpose**: MongoDB integration and data persistence
- **Sub-modules**:

##### 2.3.1 Database Connection
- **Configuration**: MongoDB URI, connection handling
- **Responsibilities**:
  - Establish MongoDB connection
  - Handle connection errors
  - Manage connection lifecycle

##### 2.3.2 Meeting Summary Schema
- **Model**: `MeetingSummary`
- **Schema Fields**:
  - `meetingId`: String (unique meeting identifier)
  - `summaryHtml`: String (AI-generated HTML summary)
  - `hostEmail`: String (meeting host email)
  - `meetingDate`: String (ISO date string)
  - `timestamps`: Auto-generated (createdAt, updatedAt)
- **Responsibilities**:
  - Define data structure
  - Validate data on save
  - Provide query interface

#### 2.4 AI Integration Module
- **Purpose**: OpenAI API integration
- **Sub-modules**:

##### 2.4.1 OpenAI Client
- **Configuration**: API key from environment variables
- **Responsibilities**:
  - Initialize OpenAI client
  - Handle API authentication
  - Manage API requests

##### 2.4.2 Summary Generation Service
- **Model**: GPT-4o-mini
- **Responsibilities**:
  - Process meeting notes
  - Generate HTML-formatted summaries
  - Include action items and insights
  - Handle AI response errors

---

### 3. **Configuration Module** (`package.json`, `.env`)

#### 3.1 Dependency Management
- **File**: `package.json`
- **Dependencies**:
  - `express`: Web server framework
  - `socket.io`: Real-time communication
  - `mongoose`: MongoDB ODM
  - `openai`: AI API client
  - `dotenv`: Environment variable management
- **Responsibilities**:
  - Define project metadata
  - Manage npm dependencies
  - Configure build scripts

#### 3.2 Environment Configuration
- **File**: `.env` (not in repo, should be created)
- **Variables**:
  - `OPENAI_API_KEY`: OpenAI API key
  - `MONGO_URI`: MongoDB connection string (optional, defaults to local)
- **Responsibilities**:
  - Store sensitive configuration
  - Provide environment-specific settings

---

### 4. **AI/ML Models Module** (`models/`)

#### 4.1 Face Detection Models
- **Files**:
  - `face_landmark_68_tiny_model-shard1`
  - `face_landmark_68_tiny_model-weights_manifest.json`
  - `tiny_face_detector_model-shard1`
  - `tiny_face_detector_model-weights_manifest.json`
- **Purpose**: Pre-trained models for face detection
- **Responsibilities**:
  - Detect faces in video streams
  - Calculate engagement scores
  - Provide face detection confidence

---

## Module Dependencies

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Module                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   UI Layer   │  │  WebRTC      │  │  Face API    │ │
│  │  (HTML/CSS)  │  │  Manager     │  │  Integration │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                  │                  │         │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│              Socket.IO Signaling Layer                  │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│                    Backend Module                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Express API  │  │ Socket.IO    │  │  Database    │ │
│  │   Server     │  │   Server     │  │   Module     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                  │                  │         │
│         └──────────────────┴──────────────────┘         │
│                         │                               │
│                         ▼                               │
│              ┌──────────────────────┐                   │
│              │   AI Integration     │                   │
│              │   (OpenAI API)       │                   │
│              └──────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│              External Services                          │
│  ┌──────────────┐  ┌──────────────┐                   │
│  │   MongoDB    │  │   OpenAI     │                   │
│  │   Database   │  │   API        │                   │
│  └──────────────┘  └──────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. **Video Call Flow**
```
User → Media Access → Local Stream → WebRTC Connection
  → Socket.IO Signaling → Peer Connection → Remote Stream Display
```

### 2. **AI Summary Flow**
```
User Input (Notes) → Frontend → POST /api/generate-summary
  → OpenAI API → HTML Summary → Frontend Display
  → POST /api/summaries → MongoDB Storage
```

### 3. **Engagement Tracking Flow**
```
Video Stream → Face Detection → Engagement Score Calculation
  → UI Update (Real-time)
```

### 4. **Statistics Collection Flow**
```
WebRTC Connection → getStats() → Data Processing
  → Metrics Calculation → UI Display
```

---

## Module Responsibilities Summary

| Module | Primary Responsibility | Key Functions |
|--------|----------------------|---------------|
| **Frontend UI** | User interface rendering | HTML structure, styling |
| **WebRTC Manager** | Peer-to-peer connections | `createPeerConnection()`, media handling |
| **Signaling Client** | Real-time communication | Socket.IO event handling |
| **Face Detection** | Engagement tracking | `detectFace()`, model loading |
| **Audio Analysis** | Speaking detection | `setupVolumeMonitoring()`, volume analysis |
| **AI Summary Client** | Summary generation UI | Note collection, display |
| **Stats Collector** | Connection metrics | `collectPeerStats()`, metrics calculation |
| **Express Server** | HTTP API endpoints | REST API, static serving |
| **Socket.IO Server** | Signaling coordination | Peer management, message relay |
| **Database Module** | Data persistence | MongoDB operations, schema management |
| **AI Integration** | Summary generation | OpenAI API calls, HTML formatting |

---

## Technology Stack

### Frontend
- **HTML5**: Structure
- **CSS3/Tailwind**: Styling
- **JavaScript (ES6+)**: Client logic
- **WebRTC API**: Peer-to-peer video
- **Web Audio API**: Audio analysis
- **Face-API.js**: Face detection
- **Socket.IO Client**: Real-time signaling

### Backend
- **Node.js**: Runtime environment
- **Express.js**: Web framework
- **Socket.IO**: WebSocket server
- **Mongoose**: MongoDB ODM
- **OpenAI SDK**: AI integration

### Infrastructure
- **MongoDB**: Database
- **STUN Server**: WebRTC NAT traversal (Google STUN)

---

## Module Interaction Patterns

1. **Request-Response**: HTTP API calls (summary generation, storage)
2. **Event-Driven**: Socket.IO events (peer connections, signaling)
3. **Stream-Based**: WebRTC media streams (video/audio)
4. **Polling**: Statistics collection (interval-based)
5. **Callback-Based**: Face detection, audio analysis (async operations)

---

## Security Considerations

- **Environment Variables**: API keys stored in `.env`
- **CORS**: Socket.IO configured with CORS
- **Input Validation**: Backend validates required fields
- **Session Storage**: Client-side session management
- **Media Permissions**: Browser-level permission handling

---

## Future Module Expansion Opportunities

1. **Authentication Module**: User authentication and authorization
2. **Recording Module**: Meeting recording and playback
3. **Chat Module**: Text messaging during calls
4. **Screen Sharing Module**: Screen sharing functionality
5. **Notification Module**: Push notifications for meetings
6. **Analytics Module**: Advanced meeting analytics
7. **File Sharing Module**: Document sharing during meetings
8. **Transcription Module**: Real-time speech-to-text
9. **Breakout Rooms Module**: Sub-meeting management
10. **Calendar Integration Module**: Meeting scheduling

---

## Module Testing Strategy

### Unit Testing
- Individual function testing
- Module isolation testing
- Mock external dependencies

### Integration Testing
- API endpoint testing
- Database operations testing
- Socket.IO event flow testing

### End-to-End Testing
- Complete video call flow
- AI summary generation flow
- Multi-peer connection testing

---

## Documentation Files

- `README.md`: Project overview and setup instructions
- `TODO.md`: Development tasks and testing checklist
- `PROJECT_MODULES.md`: This document (module architecture)

---

*Last Updated: Based on current codebase analysis*
*Project: IdeaQuest Meet - Hackathon Project*

