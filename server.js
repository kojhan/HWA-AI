const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Serve HWA AI frontend
app.use(express.static(__dirname));

// Home
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "HWA AI",
    status: "ready"
  });
});

// Get logged-in Supabase user
app.get("/api/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token is required"
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        message: "Supabase environment variables are not configured"
      });
    }

    const response = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired login session"
      });
    }

    res.json({
      success: true,
      user: data
    });

  } catch (error) {
    console.error("Auth error:", error);

    res.status(500).json({
      success: false,
      message: "Authentication check failed"
    });
  }
});

// ==========================================
// HWA AI - DYNAMIC VIDEO PROCESSING PLAN
// ==========================================

// Convert seconds to readable duration
function formatDuration(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    hours,
    minutes,
    seconds,
    text:
      hours > 0
        ? `${hours}h ${minutes}m ${seconds}s`
        : `${minutes}m ${seconds}s`
  };
}

// Create 10-minute processing chunks
function createProcessingPlan(durationSeconds) {
  const CHUNK_SECONDS = 10 * 60;

  const totalSeconds = Math.max(1, Math.floor(durationSeconds));
  const totalParts = Math.ceil(totalSeconds / CHUNK_SECONDS);

  const parts = [];

  for (let i = 0; i < totalParts; i++) {
    const start = i * CHUNK_SECONDS;
    const end = Math.min(start + CHUNK_SECONDS, totalSeconds);

    parts.push({
      part: i + 1,
      start_seconds: start,
      end_seconds: end,
      duration_seconds: end - start,
      duration: formatDuration(end - start),
      status: "queued"
    });
  }

  return {
    total_seconds: totalSeconds,
    total_duration: formatDuration(totalSeconds),
    chunk_size_seconds: CHUNK_SECONDS,
    total_parts: totalParts,
    parts
  };
}

// Create processing plan
app.post("/api/video/plan", (req, res) => {
  try {
    const { duration_seconds } = req.body;

    if (
      duration_seconds === undefined ||
      duration_seconds === null ||
      !Number.isFinite(Number(duration_seconds)) ||
      Number(duration_seconds) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid video duration is required"
      });
    }

    const duration = Number(duration_seconds);
    const plan = createProcessingPlan(duration);

    res.json({
      success: true,
      service: "HWA AI",
      processing: "dynamic",
      strategy: "10-minute chunks",
      plan
    });

  } catch (error) {
    console.error("Video plan error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create video processing plan"
    });
  }
});

// ==========================================
// FUTURE PIPELINE PLACEHOLDER
// ==========================================

app.get("/api/video/status", (req, res) => {
  res.json({
    success: true,
    service: "HWA AI",
    status: "ready",
    pipeline: [
      "YouTube Link",
      "Video Download",
      "Dynamic 10-Minute Split",
      "Transcript",
      "Myanmar Recap Script",
      "AI Review",
      "Myanmar AI Voice",
      "Original Audio Removed",
      "Voice-Synced Video Edit",
      "Preview",
      "Save Project",
      "Download MP4"
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`HWA AI server running on port ${PORT}`);
});
