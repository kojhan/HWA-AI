const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "HWA AI",
    status: "ready"
  });
});

// ==========================================
// SUPABASE USER CHECK
// ==========================================

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
    const supabaseKey =
      process.env.SUPABASE_PUBLISHABLE_KEY;

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
// YOUTUBE VIDEO ID
// ==========================================

function getYouTubeVideoId(url) {

  try {

    const parsed = new URL(url);

    // youtube.com/watch?v=VIDEO_ID
    if (
      parsed.hostname.includes("youtube.com") &&
      parsed.searchParams.get("v")
    ) {
      return parsed.searchParams.get("v");
    }

    // youtu.be/VIDEO_ID
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.substring(1);
    }

    // youtube.com/shorts/VIDEO_ID
    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.split("/")[2];
    }

    // youtube.com/embed/VIDEO_ID
    if (parsed.pathname.startsWith("/embed/")) {
      return parsed.pathname.split("/")[2];
    }

    return null;

  } catch {
    return null;
  }
}

// ==========================================
// ISO 8601 DURATION
// Example: PT2H5M10S
// ==========================================

function parseYouTubeDuration(duration) {

  const match = duration.match(
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
  );

  if (!match) {
    return 0;
  }

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  return (
    hours * 3600 +
    minutes * 60 +
    seconds
  );
}

// ==========================================
// FORMAT DURATION
// ==========================================

function formatDuration(totalSeconds) {

  totalSeconds = Math.max(
    0,
    Math.floor(totalSeconds)
  );

  const hours =
    Math.floor(totalSeconds / 3600);

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const seconds =
    totalSeconds % 60;

  let text = "";

  if (hours > 0) {
    text += `${hours}h `;
  }

  text += `${minutes}m`;

  if (seconds > 0) {
    text += ` ${seconds}s`;
  }

  return {
    hours,
    minutes,
    seconds,
    text
  };
}

// ==========================================
// CREATE 10-MINUTE PROCESSING PLAN
// ==========================================

function createProcessingPlan(durationSeconds) {

  const CHUNK_SECONDS = 10 * 60;

  const totalSeconds =
    Math.max(
      1,
      Math.floor(durationSeconds)
    );

  const totalParts =
    Math.ceil(
      totalSeconds / CHUNK_SECONDS
    );

  const parts = [];

  for (let i = 0; i < totalParts; i++) {

    const start =
      i * CHUNK_SECONDS;

    const end =
      Math.min(
        start + CHUNK_SECONDS,
        totalSeconds
      );

    parts.push({
      part: i + 1,
      start_seconds: start,
      end_seconds: end,
      duration_seconds: end - start,
      duration:
        formatDuration(end - start),
      status: "queued"
    });
  }

  return {
    total_seconds: totalSeconds,

    total_duration:
      formatDuration(totalSeconds),

    chunk_size_seconds:
      CHUNK_SECONDS,

    total_parts:
      totalParts,

    parts
  };
}

// ==========================================
// GET REAL YOUTUBE VIDEO INFO
// ==========================================

app.get("/api/youtube/info", async (req, res) => {

  try {

    const url = req.query.url;

    if (!url) {

      return res.status(400).json({
        success: false,
        message: "YouTube URL is required"
      });

    }

    const videoId =
      getYouTubeVideoId(url);

    if (!videoId) {

      return res.status(400).json({
        success: false,
        message: "Invalid YouTube URL"
      });

    }

    const apiKey =
      process.env.YOUTUBE_API_KEY;

    if (!apiKey) {

      return res.status(500).json({
        success: false,
        message:
          "YOUTUBE_API_KEY is not configured"
      });

    }

    const apiUrl =
      "https://www.googleapis.com/youtube/v3/videos" +
      `?part=snippet,contentDetails` +
      `&id=${encodeURIComponent(videoId)}` +
      `&key=${encodeURIComponent(apiKey)}`;

    const response =
      await fetch(apiUrl);

    const data =
      await response.json();

    if (!response.ok) {

      console.error(
        "YouTube API error:",
        data
      );

      return res.status(400).json({
        success: false,
        message:
          "YouTube API request failed"
      });

    }

    if (
      !data.items ||
      data.items.length === 0
    ) {

      return res.status(404).json({
        success: false,
        message:
          "YouTube video not found or unavailable"
      });

    }

    const video =
      data.items[0];

    const durationSeconds =
      parseYouTubeDuration(
        video.contentDetails.duration
      );

    const plan =
      createProcessingPlan(
        durationSeconds
      );

    res.json({

      success: true,

      video: {
        id: video.id,

        title:
          video.snippet.title,

        duration:
          formatDuration(
            durationSeconds
          )
      },

      processing: {
        strategy:
          "dynamic-10-minute-chunks",

        plan
      }

    });

  } catch (error) {

    console.error(
      "YouTube info error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to read YouTube video information"
    });

  }

});

// ==========================================
// VIDEO PLAN API
// ==========================================

app.post("/api/video/plan", (req, res) => {

  try {

    const {
      duration_seconds
    } = req.body;

    if (
      duration_seconds === undefined ||
      duration_seconds === null ||
      !Number.isFinite(
        Number(duration_seconds)
      ) ||
      Number(duration_seconds) <= 0
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Valid video duration is required"
      });

    }

    const plan =
      createProcessingPlan(
        Number(duration_seconds)
      );

    res.json({
      success: true,
      service: "HWA AI",
      processing: "dynamic",
      strategy:
        "10-minute chunks",
      plan
    });

  } catch (error) {

    console.error(
      "Video plan error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to create video processing plan"
    });

  }

});

// ==========================================
// PIPELINE STATUS
// ==========================================

app.get("/api/video/status", (req, res) => {

  res.json({

    success: true,

    service: "HWA AI",

    status: "ready",

    pipeline: [

      "YouTube Link",

      "Video Duration Detection",

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

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {

  console.log(
    `HWA AI server running on port ${PORT}`
  );

});
