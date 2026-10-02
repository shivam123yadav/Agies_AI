# AgiesAI Sentinel 🛡️

**AgiesAI Sentinel** is an enterprise-grade AI security and Sensitive Data Loss Prevention (DLP) platform. It safeguards organizational data against unintended exposure across generative AI tools (such as ChatGPT, Claude, and Copilot) by combining pattern detection, contextual analysis, automated policy enforcement, and real-time monitoring.

---

## ✨ Features

- **🔍 Multi-Layer Pattern Detection Engine**: Automatically identifies API keys, secret credentials, PII (Personally Identifiable Information), credit card numbers, AWS/cloud tokens, and internal source code patterns.
- **🎯 Contextual Risk Scoring**: Evaluates risk dynamically (0-100 score) based on data sensitivity, platform context, employee risk profiles, and exposure severity.
- **⚙️ Automated Policy Engine**: Enforces configurable rules based on risk levels—automatically triggering actions such as **Block**, **Redact**, **Warn**, or **Log**.
- **📊 Interactive Management Dashboard**: Sleek React & TypeScript interface featuring:
  - Real-time incident logs & severity tracking
  - Employee risk scoring & department analytics
  - Custom policy creation & detection rule engine manager
  - Complete immutable audit logs for compliance
  - Interactive browser extension download & setup guidance
- **⚡ FastAPI Backend**: High-performance asynchronous backend backed by MongoDB with comprehensive security engine tests.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Routing**: [React Router v7](https://reactrouter.com/)
- **Data Visualization**: [Recharts](https://recharts.org/)
- **Icons**: [Lucide React](https://lucide.dev/)

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.13+)
- **Validation**: [Pydantic v2](https://docs.pydantic.dev/)
- **Database**: [MongoDB](https://www.mongodb.com/) via PyMongo
- **Web Server**: [Uvicorn](https://www.uvicorn.org/)
- **Testing**: [Pytest](https://docs.pytest.org/)

---

## 📁 Repository Structure

```
.
├── backend/                  # Python FastAPI Backend
│   ├── app/
│   │   ├── main.py           # REST API routes & app configuration
│   │   ├── database.py       # MongoDB database client & helpers
│   │   ├── auth.py           # Authentication logic
│   │   └── engines/          # Security detection engines
│   │       ├── pattern_detection.py
│   │       ├── contextual_analysis.py
│   │       ├── policy_engine.py
│   │       ├── detection_rules.py
│   │       └── risk_engine.py
│   ├── tests/                # Pytest security engine test suite
│   └── requirements.txt      # Python dependencies
├── src/                      # React Frontend Source
│   ├── components/           # Reusable UI components
│   ├── pages/                # Page components (Dashboard, Incidents, Policies, etc.)
│   ├── mock/                 # Mock dataset fallbacks
│   ├── lib/                  # API client & utility logic
│   ├── types.ts              # TypeScript interface definitions
│   └── App.tsx               # Main React router app component
├── public/                   # Static assets & extension download package
├── package.json              # Frontend dependencies & scripts
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18 or higher)
- **Python** (v3.13 or higher recommended)
- **MongoDB** running locally on port `27017` (or remote connection URI)

---

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment
python -m venv venv

# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Linux/macOS:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run backend development server
uvicorn app.main:app --reload
```
The FastAPI backend will run at `http://127.0.0.1:8000`. Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

---

### 2. Frontend Setup

```bash
# From project root directory
npm install

# Run frontend development server
npm run dev
```
The React frontend will start at `http://localhost:5173`.

---

## 🧪 Running Tests

To run the backend security engine tests:

```bash
cd backend
pytest tests -v
```

---

## 📡 API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/detect` | Analyze text input for sensitive data & compute risk score |
| `GET` | `/api/incidents` | Fetch recorded DLP security incidents |
| `PATCH` | `/api/incidents/{id}/status` | Update incident review status |
| `GET` | `/api/policies` | Retrieve active security policies |
| `POST` | `/api/policies` | Create a new security policy rule |
| `GET` | `/api/employees` | List monitored employees and risk metrics |
| `GET` | `/api/audit-logs` | Fetch system audit logs |
| `GET` | `/api/health` | Backend and MongoDB health status check |

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for details.
