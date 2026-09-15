const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("."));

const PORT = process.env.PORT || 3000;


// ===============================
// HOME / HEALTH
// ===============================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "HWA AI",
    status: "ready"
  });
});


// ===============================
// USER TEST
// ===============================

app.get("/api/me", (req, res) => {
  res.json({
    success: true,
    message: "HWA AI backend connected"
  });
});


// ===============================
// YOUTUBE VIDEO ID
// ===============================

function getYouTubeVideoId(url) {
  if (!url) return null;

  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/
  );

  return match ? match[1] : null;
}


// ===============================
// YOUTUBE DURATION
// ===============================

function parseDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  return hours * 3600 + minutes * 60 + seconds;
}


// ===============================
// DYNAMIC 10 MINUTE VIDEO PLAN
// ===============================

function createVideoPlan(totalSeconds) {
  const parts = [];
  let remaining = totalSeconds;
  let index = 1;

  while (remaining > 0) {
    const duration = Math.min(600, remaining);

    parts.push({
      part: index,
      start: totalSeconds - remaining,
      duration: duration
    });

    remaining -= duration;
    index++;
  }

  return parts;
}


// ===============================
// YOUTUBE VIDEO INFO
// ===============================

app.get("/api/youtube/info", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "YouTube URL is required"
      });
    }

    const videoId = getYouTubeVideoId(url);

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: "Invalid YouTube URL"
      });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "YOUTUBE_API_KEY is not configured"
      });
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data?.error?.message || "YouTube API error"
      });
    }

    if (!data.items || data.items.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Video not found"
      });
    }

    const item = data.items[0];

    const duration = parseDuration(
      item.contentDetails.duration
    );

    const plan = createVideoPlan(duration);

    res.json({
      success: true,
      videoId: videoId,
      title: item.snippet.title,
      duration: duration,
      durationText: `${Math.floor(duration / 60)}m ${duration % 60}s`,
      parts: plan
    });

  } catch (error) {
    console.error("YouTube info error:", error);

    res.status(500).json({
      success: false,
      error: error.message || "YouTube info failed"
    });
  }
});


// ===============================
// VIDEO PLAN
// ===============================

app.get("/api/video/plan", (req, res) => {
  try {
    const seconds = Number(req.query.seconds);

    if (!seconds || seconds <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid seconds required"
      });
    }

    res.json({
      success: true,
      parts: createVideoPlan(seconds)
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ===============================
// TRANSCRIPT
// ===============================

app.get("/api/youtube/transcript", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "YouTube URL is required"
      });
    }

    const videoId = getYouTubeVideoId(url);

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: "Invalid YouTube URL"
      });
    }

    const apiKey = process.env.TRANSCRIPT_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "TRANSCRIPT_API_KEY is not configured"
      });
    }

    const response = await fetch(
      "https://www.youtubetranscript.dev/api/v2/transcribe",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          video: videoId,
          source: "auto",
          format: {
            timestamp: true,
            paragraphs: true
          }
        })
      }
    );

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      data = {
        raw: rawText
      };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        api_status: response.status,
        error:
          data?.message ||
          data?.error ||
          data?.code ||
          "Transcript API error",
        details: data
      });
    }

    res.json({
      success: true,
      videoId: videoId,
      status: data?.status,
      transcript: data?.data?.transcript || null,
      request: data?.request_id || null
    });

  } catch (error) {
    console.error("Transcript error:", error);

    res.status(500).json({
      success: false,
      error: error.message || "Transcript request failed"
    });
  }
});


// ===============================
// AI MOVIE RECAP
// ===============================

app.post("/api/recap/generate", async (req, res) => {
  try {

    const {
      transcript,
      style = "natural"
    } = req.body;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: "Transcript is required"
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_API_KEY is not configured"
      });
    }

    const transcriptText =
      typeof transcript === "string"
        ? transcript
        : transcript.text || JSON.stringify(transcript);

    const prompt = `
You are HWA AI, a professional Myanmar movie recap writer.

Convert the following movie transcript into a natural spoken Myanmar
movie-recap narration.

IMPORTANT RULES:

- Write in natural conversational Burmese.
- Sound like one real human narrator telling a story.
- Do NOT translate word-for-word.
- Preserve the original story, events, characters and meaning.
- Do not invent events that are not in the transcript.
- Keep important character names and relationships clear.
- Explain confusing scenes naturally.
- Avoid repeating "တယ်။ တယ်။ တယ်။" excessively.
- Mix sentence endings naturally.
- Do not make every sentence the same length.
- Add light natural humor only when appropriate.
- Do not use headings such as "Scene 1".
- Do not add subtitles, emojis or production instructions.
- Make the narration smooth for Myanmar AI voice generation.
- Keep the story flowing from beginning to end.

STYLE:
${style}

TRANSCRIPT:
${transcriptText}
`;

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          model: "gpt-5.6-luna",
          input: prompt,
          max_output_tokens: 4000
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);

      return res.status(response.status).json({
        success: false,
        error:
          data?.error?.message ||
          "OpenAI API error"
      });
    }

    const script =
  data.output_text ||
  data.output?.flatMap(item =>
    item.content
      ?.filter(content => content.type === "output_text")
      ?.map(content => content.text)
  ).filter(Boolean).join("\n") ||
  "";

res.json({
  success: true,
  script: script
});

  } catch (error) {

    console.error(
      "Recap generation error:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        error.message ||
        "Recap generation failed"
    });
  }
});


// ===============================
// VIDEO PIPELINE STATUS
// ===============================

app.get("/api/video/status", (req, res) => {

  res.json({
    success: true,

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


// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log(`HWA AI server running on port ${PORT}`);
});
