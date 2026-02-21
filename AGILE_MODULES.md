# IdeaQuest Meet - Agile Module Breakdown

## Module Organization (Agile Sprint Structure)

---

## **SPRINT 1: Core Video Communication**

### Module 1: Video Call Infrastructure
- **User Story**: "As a user, I want to join video calls with other participants"
- **Components**:
  - WebRTC Connection Manager (`script.js`)
  - Media Access & Stream Handling (`script.js`)
  - Local Video Display (`index.html`, `script.js`)
- **Deliverables**: Basic peer-to-peer video connection

---

### Module 2: Signaling Server
- **User Story**: "As a system, I need to coordinate peer connections"
- **Components**:
  - Socket.IO Server Setup (`server.js`)
  - Connection Manager (`server.js`)
  - Peer Discovery (`server.js`)
- **Deliverables**: Real-time signaling between peers

---

## **SPRINT 2: Multi-Peer Support**

### Module 3: Multi-Peer Connection Management
- **User Story**: "As a user, I want to see multiple participants in one call"
- **Components**:
  - Peer Connection Pool (`script.js`)
  - Remote Video Grid (`index.html`, `script.js`)
  - Peer Lifecycle Management (`script.js`)
- **Deliverables**: Support for multiple simultaneous connections

---

### Module 4: Peer Information Exchange
- **User Story**: "As a user, I want to see who I'm talking to"
- **Components**:
  - Host Information Collection (`script.js`)
  - Peer Info Broadcasting (`server.js`, `script.js`)
  - Name Display Overlay (`index.html`, `script.js`)
- **Deliverables**: Participant identification and display

---

## **SPRINT 3: User Controls & Experience**

### Module 5: Media Controls
- **User Story**: "As a user, I want to mute/unmute and turn camera on/off"
- **Components**:
  - Mute/Unmute Toggle (`script.js`)
  - Camera Toggle (`script.js`)
  - Control UI (`index.html`, `style.css`)
  - Visual Status Indicators (`index.html`, `style.css`)
- **Deliverables**: Full media control functionality

---

### Module 6: Call Management
- **User Story**: "As a user, I want to leave a call gracefully"
- **Components**:
  - Leave Call Handler (`script.js`)
  - Connection Cleanup (`script.js`)
  - Resource Cleanup (`script.js`)
- **Deliverables**: Proper call termination

---

## **SPRINT 4: AI-Powered Features**

### Module 7: Face Detection & Engagement Tracking
- **User Story**: "As a host, I want to see participant engagement levels"
- **Components**:
  - Face-API Model Loading (`script.js`)
  - Face Detection Engine (`script.js`)
  - Engagement Score Calculation (`script.js`)
  - Engagement Display UI (`index.html`, `script.js`)
- **Deliverables**: Real-time engagement metrics

---

### Module 8: Audio Analysis & Speaking Detection
- **User Story**: "As a user, I want visual feedback when someone is speaking"
- **Components**:
  - Web Audio API Integration (`script.js`)
  - Volume Monitoring (`script.js`)
  - Speaking Indicator (`script.js`, `style.css`)
  - Per-Peer Audio Analysis (`script.js`)
- **Deliverables**: Visual speaking indicators

---

## **SPRINT 5: AI Summary & Analytics**

### Module 9: AI Summary Generation
- **User Story**: "As a host, I want AI-generated meeting summaries"
- **Components**:
  - Notes Input UI (`index.html`)
  - OpenAI API Integration (`server.js`)
  - Summary Generation Service (`server.js`)
  - Summary Display (`index.html`, `script.js`)
- **Deliverables**: AI-powered meeting summaries

---

### Module 10: Summary Persistence
- **User Story**: "As a host, I want to save meeting summaries"
- **Components**:
  - MongoDB Database Setup (`server.js`)
  - Meeting Summary Schema (`server.js`)
  - Summary Storage API (`server.js`)
  - Summary Saving Logic (`script.js`)
- **Deliverables**: Persistent meeting summaries

---

## **SPRINT 6: Analytics & Monitoring**

### Module 11: Connection Statistics
- **User Story**: "As a user, I want to see connection quality metrics"
- **Components**:
  - WebRTC Stats Collection (`script.js`)
  - Metrics Calculation (`script.js`)
  - Statistics Display UI (`index.html`, `script.js`)
  - Per-Peer Statistics (`script.js`)
- **Deliverables**: Real-time connection quality monitoring

---

### Module 12: Session Management
- **User Story**: "As a system, I need to track meeting sessions"
- **Components**:
  - Meeting ID Generation (`script.js`)
  - Session Storage (`script.js`)
  - Host Context Management (`script.js`)
- **Deliverables**: Meeting session tracking

---

## **SPRINT 7: UI/UX Polish**

### Module 13: User Interface Design
- **User Story**: "As a user, I want a modern, intuitive interface"
- **Components**:
  - HTML Structure (`index.html`)
  - Tailwind CSS Integration (`index.html`)
  - Custom Styling (`style.css`)
  - Responsive Layout (`index.html`, `style.css`)
- **Deliverables**: Polished, responsive UI

---

### Module 14: Visual Feedback & Animations
- **User Story**: "As a user, I want visual feedback for interactions"
- **Components**:
  - Speaking Animations (`style.css`)
  - Loading States (`index.html`, `style.css`)
  - Status Indicators (`index.html`, `style.css`)
  - Transitions (`style.css`)
- **Deliverables**: Enhanced user experience

---

## **SPRINT 8: Infrastructure & Deployment**

### Module 15: Server Infrastructure
- **User Story**: "As a system, I need a reliable backend server"
- **Components**:
  - Express Server Setup (`server.js`)
  - Static File Serving (`server.js`)
  - API Route Handling (`server.js`)
  - Error Handling (`server.js`)
- **Deliverables**: Production-ready server

---

### Module 16: Configuration & Environment
- **User Story**: "As a developer, I need easy configuration management"
- **Components**:
  - Package Dependencies (`package.json`)
  - Environment Variables (`.env`)
  - Configuration Loading (`server.js`)
- **Deliverables**: Configurable application

---

## Module Summary by Sprint

| Sprint | Modules | Focus Area |
|--------|---------|------------|
| **Sprint 1** | Module 1, 2 | Core Video Communication |
| **Sprint 2** | Module 3, 4 | Multi-Peer Support |
| **Sprint 3** | Module 5, 6 | User Controls |
| **Sprint 4** | Module 7, 8 | AI Features (Engagement) |
| **Sprint 5** | Module 9, 10 | AI Summary & Storage |
| **Sprint 6** | Module 11, 12 | Analytics & Monitoring |
| **Sprint 7** | Module 13, 14 | UI/UX Polish |
| **Sprint 8** | Module 15, 16 | Infrastructure |

---

## Quick Reference: Module Files

| Module | Primary Files | Type |
|--------|---------------|------|
| 1. Video Call Infrastructure | `script.js` | Frontend |
| 2. Signaling Server | `server.js` | Backend |
| 3. Multi-Peer Management | `script.js` | Frontend |
| 4. Peer Information | `server.js`, `script.js` | Full-stack |
| 5. Media Controls | `script.js`, `index.html` | Frontend |
| 6. Call Management | `script.js` | Frontend |
| 7. Face Detection | `script.js`, `models/` | Frontend |
| 8. Audio Analysis | `script.js` | Frontend |
| 9. AI Summary Generation | `server.js`, `script.js` | Full-stack |
| 10. Summary Persistence | `server.js` | Backend |
| 11. Connection Statistics | `script.js` | Frontend |
| 12. Session Management | `script.js` | Frontend |
| 13. UI Design | `index.html`, `style.css` | Frontend |
| 14. Visual Feedback | `style.css`, `index.html` | Frontend |
| 15. Server Infrastructure | `server.js` | Backend |
| 16. Configuration | `package.json`, `.env` | Config |

---

## Presentation Format Suggestion

### Slide Structure:
1. **Overview**: 8 Sprints, 16 Modules
2. **Sprint 1-2**: Foundation (Video + Multi-peer)
3. **Sprint 3**: User Experience (Controls)
4. **Sprint 4**: AI Engagement Features
5. **Sprint 5**: AI Summary Features
6. **Sprint 6**: Analytics
7. **Sprint 7**: UI Polish
8. **Sprint 8**: Infrastructure

---

*Total: 16 Agile Modules across 8 Sprints*

