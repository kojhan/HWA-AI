const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static("."));

const PORT = process.env.PORT || 3000;

/* =========================================================
   HEALTH
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "HWA AI",
    status: "ready"
  });
});

/* =========================================================
   USER TEST
========================================================= */

app.get("/api/me", (req, res) => {
  res.json({
    success: true,
    message: "HWA AI backend connected"
  });
});

/* =========================================================
   YOUTUBE VIDEO ID
========================================================= */

function getYouTubeVideoId(url) {
  if (!url) return null;

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/* =========================================================
   DURATION
========================================================= */

function parseDuration(duration) {
  const match = duration.match(
    /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
  );

  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  return hours * 3600 + minutes * 60 + seconds;
}

/* =========================================================
   DYNAMIC 10-MINUTE PLAN
========================================================= */

function createVideoPlan(totalSeconds) {
  const parts = [];
  let start = 0;
  let partNumber = 1;

  while (start < totalSeconds) {
    const duration = Math.min(
      600,
      totalSeconds - start
    );

    parts.push({
      part: partNumber,
      start: start,
      duration: duration,
      end: start + duration
    });

    start += duration;
    partNumber++;
  }

  return parts;
}

/* =========================================================
   YOUTUBE INFO
========================================================= */

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
        error:
          data?.error?.message ||
          "YouTube API error"
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
      videoId,
      title: item.snippet.title,
      duration,
      durationText:
        `${Math.floor(duration / 60)}m ${duration % 60}s`,
      parts: plan
    });

  } catch (error) {
    console.error("YouTube info error:", error);

    res.status(500).json({
      success: false,
      error:
        error.message ||
        "YouTube info failed"
    });
  }
});

/* =========================================================
   VIDEO PLAN
========================================================= */

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

/* =========================================================
   TRANSCRIPT
========================================================= */

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

    const apiKey =
      process.env.TRANSCRIPT_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error:
          "TRANSCRIPT_API_KEY is not configured"
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
      videoId,
      status: data?.status,
      transcript:
        data?.data?.transcript || null,
      request:
        data?.request_id || null
    });

  } catch (error) {
    console.error(
      "Transcript error:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        error.message ||
        "Transcript request failed"
    });
  }
});

/* =========================================================
   TRANSCRIPT TEXT EXTRACTION
========================================================= */

function getTranscriptText(transcript) {
  if (!transcript) return "";

  if (typeof transcript === "string") {
    return transcript.trim();
  }

  if (typeof transcript.text === "string") {
    return transcript.text.trim();
  }

  if (Array.isArray(transcript.segments)) {
    return transcript.segments
      .map(item => item.text || "")
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (Array.isArray(transcript.paragraphs)) {
    return transcript.paragraphs
      .map(item => {
        if (typeof item === "string") {
          return item;
        }

        return (
          item.text ||
          item.content ||
          ""
        );
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return JSON.stringify(transcript);
}

/* =========================================================
   TRANSCRIPT SEGMENT EXTRACTION
========================================================= */

function getTranscriptSegments(transcript) {
  if (!transcript || typeof transcript === "string") {
    return [];
  }

  if (Array.isArray(transcript.segments)) {
    return transcript.segments
      .map(item => ({
        text: String(item.text || "").trim(),
        start: Number(
          item.start ??
          item.start_time ??
          item.offset ??
          0
        ),
        duration: Number(
          item.duration ??
          item.duration_seconds ??
          0
        )
      }))
      .filter(item => item.text);
  }

  if (Array.isArray(transcript.paragraphs)) {
    return transcript.paragraphs
      .map(item => ({
        text:
          typeof item === "string"
            ? item
            : String(
                item.text ||
                item.content ||
                ""
              ),
        start: Number(
          item.start ??
          item.start_time ??
          0
        ),
        duration: Number(
          item.duration ??
          0
        )
      }))
      .filter(item => item.text.trim());
  }

  return [];
}

/* =========================================================
   SPLIT TRANSCRIPT BY 10 MINUTES
========================================================= */

function splitTranscriptIntoParts(
  transcript,
  totalSeconds = 0
) {
  const segments =
    getTranscriptSegments(transcript);

  const parts = [];

  /*
    Best case:
    Transcript has timestamps.
  */

  if (segments.length > 0) {
    const grouped = {};

    for (const segment of segments) {
      const start =
        Number(segment.start) || 0;

      const partIndex =
        Math.floor(start / 600);

      if (!grouped[partIndex]) {
        grouped[partIndex] = [];
      }

      grouped[partIndex].push(segment.text);
    }

    const maxPart =
      totalSeconds > 0
        ? Math.ceil(totalSeconds / 600)
        : Object.keys(grouped).length;

    for (let i = 0; i < maxPart; i++) {
      const text =
        (grouped[i] || []).join(" ").trim();

      if (text) {
        parts.push({
          part: i + 1,
          text,
          start: i * 600,
          end:
            totalSeconds > 0
              ? Math.min(
                  totalSeconds,
                  (i + 1) * 600
                )
              : (i + 1) * 600
        });
      }
    }

    if (parts.length > 0) {
      return parts;
    }
  }

  /*
    Fallback:
    If timestamp data is unavailable,
    split the transcript by text size.
  */

  const fullText =
    getTranscriptText(transcript);

  if (!fullText) {
    return [];
  }

  const estimatedParts =
    totalSeconds > 0
      ? Math.max(
          1,
          Math.ceil(totalSeconds / 600)
        )
      : Math.max(
          1,
          Math.ceil(
            fullText.length / 12000
          )
        );

  const chunkSize =
    Math.ceil(
      fullText.length / estimatedParts
    );

  for (
    let i = 0;
    i < estimatedParts;
    i++
  ) {
    const start =
      i * chunkSize;

    const end =
      Math.min(
        fullText.length,
        start + chunkSize
      );

    const text =
      fullText
        .slice(start, end)
        .trim();

    if (text) {
      parts.push({
        part: i + 1,
        text,
        start:
          totalSeconds > 0
            ? Math.floor(
                (i / estimatedParts) *
                totalSeconds
              )
            : 0,
        end:
          totalSeconds > 0
            ? Math.floor(
                ((i + 1) /
                  estimatedParts) *
                totalSeconds
              )
            : 0
      });
    }
  }

  return parts;
}

/* =========================================================
   OPENAI OUTPUT EXTRACTION
========================================================= */

function extractOpenAIText(data) {
  if (!data) return "";

  if (
    typeof data.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data.output)) {
    return "";
  }

  const text = data.output
    .flatMap(item =>
      Array.isArray(item.content)
        ? item.content
            .filter(
              content =>
                content.type ===
                "output_text"
            )
            .map(
              content =>
                content.text || ""
            )
        : []
    )
    .filter(Boolean)
    .join("\n")
    .trim();

  return text;
}

/* =========================================================
   GENERATE ONE RECAP PART
========================================================= */

async function generateRecapPart({
  text,
  partNumber,
  totalParts,
  style
}) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured"
    );
  }

  const prompt = `
You are HWA AI, a professional Myanmar movie recap writer.

This is Part ${partNumber} of ${totalParts}
of one continuous movie/story.

Rewrite ONLY this part of the transcript
into natural spoken Myanmar Burmese
for a movie recap narration.

IMPORTANT:

- Preserve the actual events.
- Preserve character names and relationships.
- Preserve the correct order of events.
- Do not invent scenes.
- Do not skip important events.
- Do not translate word-for-word.
- Explain the story naturally.
- Write like one real Myanmar narrator.
- Avoid excessive "တယ်။ တယ်။ တယ်။"
- Mix sentence endings naturally.
- Use smooth conversational Burmese.
- Light humor is allowed only when it naturally fits.
- Do not use "Scene 1", "Part 1" or headings.
- Do not add emojis.
- Do not add subtitles.
- Do not add production instructions.
- Do not talk about these instructions.
- Do not summarize this part too aggressively.
- Include the important details from the supplied transcript.
- Make it suitable for later AI voice narration.
- Continue naturally from previous story events.
- Do not create a new ending unless the transcript contains one.

STYLE:
${style || "natural"}

TRANSCRIPT PART ${partNumber}:
${text}
`;

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Authorization":
          `Bearer ${apiKey}`,
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        input: prompt,
        max_output_tokens: 6000
      })
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "OpenAI part error:",
      data
    );

    throw new Error(
      data?.error?.message ||
      "OpenAI API error"
    );
  }

  const script =
    extractOpenAIText(data);

  if (!script) {
    throw new Error(
      `AI returned empty text for Part ${partNumber}`
    );
  }

  return script;
}

/* =========================================================
   COMPLETE RECAP GENERATOR
========================================================= */

app.post(
  "/api/recap/generate",
  async (req, res) => {
    try {
      const {
        transcript,
        style = "natural",
        video_title = ""
      } = req.body;

      if (!transcript) {
        return res.status(400).json({
          success: false,
          error:
            "Transcript is required"
        });
      }

      const totalSeconds =
        Number(
          req.body.duration ||
          req.body.total_seconds ||
          0
        );

      const parts =
        splitTranscriptIntoParts(
          transcript,
          totalSeconds
        );

      if (!parts.length) {
        return res.status(400).json({
          success: false,
          error:
            "Transcript could not be split"
        });
      }

      console.log(
        `HWA AI: ${parts.length} recap parts`
      );

      const generatedParts = [];

      /*
        Process sequentially.
        This keeps API usage controlled
        and prevents many requests at once.
      */

      for (
        let i = 0;
        i < parts.length;
        i++
      ) {
        const part = parts[i];

        console.log(
          `Generating recap Part ${i + 1}/${parts.length}`
        );

        const script =
          await generateRecapPart({
            text: part.text,
            partNumber: i + 1,
            totalParts: parts.length,
            style
          });

        generatedParts.push({
          part: i + 1,
          start: part.start,
          end: part.end,
          script
        });
      }

      /*
        Join everything in the original order.
        No AI rewriting here, so generated
        sections are not accidentally lost.
      */

      const completeScript =
        generatedParts
          .map(item => item.script)
          .join("\n\n")
          .trim();

      res.json({
        success: true,
        title: video_title,
        total_parts: generatedParts.length,
        parts: generatedParts,
        script: completeScript
      });

    } catch (error) {
      console.error(
        "Complete recap error:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          error.message ||
          "Recap generation failed"
      });
    }
  }
);

/* =========================================================
   VIDEO PIPELINE STATUS
========================================================= */

app.get(
  "/api/video/status",
  (req, res) => {
    res.json({
      success: true,
      pipeline: [
        "YouTube Link",
        "Video Duration Detection",
        "Dynamic 10-Minute Split",
        "Transcript",
        "Transcript Part Split",
        "Myanmar Recap Part 1",
        "Myanmar Recap Part 2",
        "Myanmar Recap Part 3",
        "Complete Myanmar Recap",
        "AI Review",
        "Myanmar AI Voice",
        "Original Audio Removed",
        "Voice-Synced Video Edit",
        "Preview",
        "Save Project",
        "Download MP4"
      ]
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {
  console.log(
    `HWA AI server running on port ${PORT}`
  );
});
