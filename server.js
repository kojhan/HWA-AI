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

    if (match) {
      return match[1];
    }
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
   DYNAMIC 10 MINUTE VIDEO PLAN
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
      start,
      duration,
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

    const apiKey =
      process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error:
          "YOUTUBE_API_KEY is not configured"
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

    if (
      !data.items ||
      data.items.length === 0
    ) {
      return res.status(404).json({
        success: false,
        error: "Video not found"
      });
    }

    const item = data.items[0];

    const duration =
      parseDuration(
        item.contentDetails.duration
      );

    const plan =
      createVideoPlan(duration);

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
    console.error(
      "YouTube info error:",
      error
    );

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
    const seconds =
      Number(req.query.seconds);

    if (!seconds || seconds <= 0) {
      return res.status(400).json({
        success: false,
        error:
          "Valid seconds required"
      });
    }

    res.json({
      success: true,
      parts:
        createVideoPlan(seconds)
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================================================
   YOUTUBE TRANSCRIPT
========================================================= */

app.get(
  "/api/youtube/transcript",
  async (req, res) => {
    try {
      const { url } = req.query;

      if (!url) {
        return res.status(400).json({
          success: false,
          error:
            "YouTube URL is required"
        });
      }

      const videoId =
        getYouTubeVideoId(url);

      if (!videoId) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid YouTube URL"
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

      const response =
        await fetch(
          "https://www.youtubetranscript.dev/api/v2/transcribe",
          {
            method: "POST",

            headers: {
              "Authorization":
                `Bearer ${apiKey}`,

              "Content-Type":
                "application/json"
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

      const rawText =
        await response.text();

      let data;

      try {
        data =
          JSON.parse(rawText);
      } catch {
        data = {
          raw: rawText
        };
      }

      if (!response.ok) {
        return res.status(
          response.status
        ).json({
          success: false,
          api_status:
            response.status,

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

        status:
          data?.status,

        transcript:
          data?.data?.transcript ||
          null,

        request:
          data?.request_id ||
          null
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
  }
);

/* =========================================================
   TRANSCRIPT TEXT
========================================================= */

function getTranscriptText(
  transcript
) {
  if (!transcript) {
    return "";
  }

  if (
    typeof transcript ===
    "string"
  ) {
    return transcript.trim();
  }

  if (
    typeof transcript.text ===
    "string"
  ) {
    return transcript.text.trim();
  }

  if (
    Array.isArray(
      transcript.segments
    )
  ) {
    return transcript.segments
      .map(
        item =>
          item.text || ""
      )
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (
    Array.isArray(
      transcript.paragraphs
    )
  ) {
    return transcript.paragraphs
      .map(item => {

        if (
          typeof item ===
          "string"
        ) {
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

  return JSON.stringify(
    transcript
  );
}

/* =========================================================
   TRANSCRIPT SEGMENTS
========================================================= */

function getTranscriptSegments(
  transcript
) {
  if (
    !transcript ||
    typeof transcript ===
    "string"
  ) {
    return [];
  }

  if (
    Array.isArray(
      transcript.segments
    )
  ) {
    return transcript.segments
      .map(item => {

        const start =
          Number(
            item.start ??
            item.start_time ??
            item.offset ??
            0
          );

        const duration =
          Number(
            item.duration ??
            item.duration_seconds ??
            0
          );

        return {
          text:
            String(
              item.text || ""
            ).trim(),

          start,

          duration
        };
      })
      .filter(
        item => item.text
      );
  }

  if (
    Array.isArray(
      transcript.paragraphs
    )
  ) {
    return transcript.paragraphs
      .map(item => {

        if (
          typeof item ===
          "string"
        ) {
          return {
            text: item.trim(),
            start: 0,
            duration: 0
          };
        }

        return {
          text:
            String(
              item.text ||
              item.content ||
              ""
            ).trim(),

          start:
            Number(
              item.start ??
              item.start_time ??
              0
            ),

          duration:
            Number(
              item.duration ??
              0
            )
        };
      })
      .filter(
        item => item.text
      );
  }

  return [];
}

/* =========================================================
   SPLIT TRANSCRIPT INTO 10 MINUTE PARTS
========================================================= */

function splitTranscriptIntoParts(
  transcript,
  totalSeconds = 0
) {
  const segments =
    getTranscriptSegments(
      transcript
    );

  const parts = [];

  /* -----------------------------------------
     TIMESTAMP MODE
  ----------------------------------------- */

  if (segments.length > 0) {

    const grouped = {};

    for (
      const segment of segments
    ) {

      const start =
        Number(
          segment.start
        ) || 0;

      const index =
        Math.floor(
          start / 600
        );

      if (!grouped[index]) {
        grouped[index] = [];
      }

      grouped[index].push(
        segment.text
      );
    }

    const highestIndex =
      Math.max(
        ...Object.keys(
          grouped
        ).map(Number)
      );

    const count =
      totalSeconds > 0
        ? Math.ceil(
            totalSeconds / 600
          )
        : highestIndex + 1;

    for (
      let i = 0;
      i < count;
      i++
    ) {

      const text =
        (
          grouped[i] || []
        )
          .join(" ")
          .trim();

      if (!text) {
        continue;
      }

      const start =
        i * 600;

      const end =
        totalSeconds > 0
          ? Math.min(
              totalSeconds,
              (i + 1) * 600
            )
          : (i + 1) * 600;

      parts.push({
        part: i + 1,
        text,
        start,
        end
      });
    }

    if (parts.length > 0) {
      return parts;
    }
  }

  /* -----------------------------------------
     TEXT FALLBACK
  ----------------------------------------- */

  const fullText =
    getTranscriptText(
      transcript
    );

  if (!fullText) {
    return [];
  }

  let numberOfParts;

  if (totalSeconds > 0) {

    numberOfParts =
      Math.max(
        1,
        Math.ceil(
          totalSeconds / 600
        )
      );

  } else {

    numberOfParts =
      Math.max(
        1,
        Math.ceil(
          fullText.length /
          10000
        )
      );
  }

  const chunkSize =
    Math.ceil(
      fullText.length /
      numberOfParts
    );

  for (
    let i = 0;
    i < numberOfParts;
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

    if (!text) {
      continue;
    }

    parts.push({
      part: i + 1,

      text,

      start:
        totalSeconds > 0
          ? Math.floor(
              (
                i /
                numberOfParts
              ) *
              totalSeconds
            )
          : 0,

      end:
        totalSeconds > 0
          ? Math.floor(
              (
                (i + 1) /
                numberOfParts
              ) *
              totalSeconds
            )
          : 0
    });
  }

  return parts;
}

/* =========================================================
   OPENAI TEXT EXTRACTION
========================================================= */

function extractOpenAIText(
  data
) {
  if (!data) {
    return "";
  }

  if (
    typeof data.output_text ===
      "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  if (
    !Array.isArray(
      data.output
    )
  ) {
    return "";
  }

  return data.output
    .flatMap(item => {

      if (
        !Array.isArray(
          item.content
        )
      ) {
        return [];
      }

      return item.content
        .filter(
          content =>
            content.type ===
            "output_text"
        )
        .map(
          content =>
            content.text || ""
        );
    })
    .filter(Boolean)
    .join("\n")
    .trim();
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

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const prompt = `
You are HWA AI, a professional Myanmar YouTube movie recap narrator.

Turn the transcript below into a LONG, DETAILED, NATURAL Myanmar movie recap.

This must sound like a real Myanmar person telling viewers about a movie, not a translation and not an AI essay.

CURRENT PART: ${partNumber} of ${totalParts}

STYLE:
${style || "Natural Myanmar YouTube Movie Recap"}

========================
VERY IMPORTANT
========================

Start the narration with an attractive HOOK.

The first few sentences must make viewers curious about what is going to happen.

Do NOT start with boring introductions such as:
"ဒီနေ့ပြောပြမယ့်ကားက..."
"ဒီဇာတ်ကားမှာ..."
"ဒီရုပ်ရှင်က..."

Instead, begin with an interesting situation, mystery, danger, surprising event, unusual character, or question from the actual story.

The opening must immediately make the viewer want to continue listening.

========================
NATURAL MYANMAR
========================

Use conversational spoken Myanmar Burmese.

Imagine a Myanmar YouTube movie recap narrator is talking naturally to viewers.

Do NOT write like:
- textbook
- school essay
- news report
- formal article
- literal translation
- robotic AI

Avoid repeatedly ending every sentence with:

"တယ်။ တယ်။ တယ်။"

Vary sentence structures naturally.

Use natural transitions when appropriate:

ဒီလိုနဲ့...
အဲဒီအချိန်မှာ...
ဒါပေမယ့်...
အဲဒီမှာပဲ...
ဆိုတော့...
အဲဒါကြောင့်...
တစ်ဖက်မှာတော့...
သူ့ဘက်ကတော့...
ဒီကောင်က...
ဒီမိန်းကလေးက...
အဲ့ဒီနောက်...
မကြာခင်မှာပဲ...
အခြေအနေကတော့...
နောက်ဆုံးမှာတော့...

Do not force these phrases.

========================
LONG AND DETAILED
========================

Make the narration detailed.

Do not compress many events into one sentence.

Explain important events naturally in sequence.

Keep important:
- characters
- relationships
- actions
- motivations
- conflicts
- discoveries
- reactions
- consequences
- locations
- story progression

Do not remove important information simply to make the script shorter.

Do not repeat the same information unnecessarily.

========================
PARAGRAPH FORMAT
========================

THIS IS EXTREMELY IMPORTANT.

Never return the entire narration as one giant paragraph.

Create MANY readable paragraphs.

Normally use 2 to 4 sentences per paragraph.

Put a BLANK LINE between paragraphs.

Example:

သူက တံခါးကို ဖြည်းဖြည်းချင်းဖွင့်ပြီး အခန်းထဲကို ဝင်လာပါတယ်။ အပြင်ကနေကြည့်ရင် အေးအေးဆေးဆေးပဲထင်ရပေမယ့် သူ့မျက်နှာမှာတော့ စိုးရိမ်နေတဲ့အရိပ်အယောင်ကို သိသိသာသာမြင်နေရပါတယ်။

အဲဒီအချိန်မှာပဲ အခန်းထဲကနေ အသံတစ်ခုထွက်လာပြီး သူက ချက်ချင်းရပ်သွားပါတယ်။ ဘာဖြစ်နေမှန်း မသိသေးပေမယ့် အခြေအနေက ပုံမှန်မဟုတ်တော့တာကိုတော့ သူနားလည်လိုက်ပါပြီ။

========================
CHARACTER EXPRESSIONS
========================

When supported by the transcript or scene context, naturally describe:

- facial expressions
- eyes
- body language
- gestures
- movement
- hesitation
- fear
- anger
- sadness
- surprise
- confusion
- nervousness
- relief
- excitement

Make scenes easy to imagine.

Do NOT invent unsupported events or actions.

========================
LIGHT HUMOR
========================

Use small amounts of natural Myanmar humor when appropriate.

The narrator can casually make a funny observation about a situation.

But do not turn serious scenes into comedy.

Do not invent funny events.

========================
STORY ACCURACY
========================

Preserve the original story.

Never:
- invent characters
- invent scenes
- change relationships
- change who did something
- change the order of events
- invent unsupported dialogue
- invent unsupported actions
- change the ending
- change motivations

Keep cause and effect accurate.

========================
CONTINUITY
========================

This is Part ${partNumber} of ${totalParts}.

Do NOT restart the movie.

Do NOT write:
Part 1
Part 2
Scene 1
Scene 2
Summary
Conclusion

Do not add headings.

The final parts will be joined together into one continuous movie recap.

Continue naturally from the supplied transcript.

========================
VOICE FRIENDLY
========================

The script will later be converted into Myanmar AI voice.

Use:
- natural sentence lengths
- natural punctuation
- natural pauses
- spoken Burmese
- clear sentences

Do not use emojis.

Do not include instructions.

Do not include analysis.

Output ONLY the narration.

========================
TRANSCRIPT
========================

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

        max_output_tokens: 8000
      })
    }
  );

  const data = await response.json();

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

  let script = extractOpenAIText(data);

  if (!script) {

    throw new Error(
      `AI returned empty text for Part ${partNumber}`
    );
  }

  /* =======================================================
     FORCE READABLE PARAGRAPHS
  ======================================================= */

  script = script
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  /*
     If AI returned everything in one line,
     automatically split it into paragraphs.
  */

  if (
    !script.includes("\n") &&
    script.length > 0
  ) {

    const sentences = script
      .split(/(?<=[။!?])\s+/)
      .filter(
        sentence =>
          sentence.trim().length > 0
      );

    const paragraphs = [];

    for (
      let i = 0;
      i < sentences.length;
      i += 3
    ) {

      const paragraph =
        sentences
          .slice(i, i + 3)
          .join(" ")
          .trim();

      if (paragraph) {
        paragraphs.push(paragraph);
      }
    }

    script =
      paragraphs.join("\n\n");
  }

  script = script
    .replace(/\n{3,}/g, "\n\n")
    .trim();

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
        style =
          "Natural Myanmar YouTube Movie Recap",
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
        "================================"
      );

      console.log(
        "HWA AI RECAP START"
      );

      console.log(
        `Video: ${video_title}`
      );

      console.log(
        `Total Parts: ${parts.length}`
      );

      console.log(
        "================================"
      );

      const generatedParts = [];

      for (
        let i = 0;
        i < parts.length;
        i++
      ) {

        const part = parts[i];

        console.log(
          `Generating Part ${i + 1}/${parts.length}`
        );

        const script =
          await generateRecapPart({

            text:
              part.text,

            partNumber:
              i + 1,

            totalParts:
              parts.length,

            style
          });

        generatedParts.push({

          part:
            i + 1,

          start:
            part.start,

          end:
            part.end,

          script
        });

        console.log(
          `Part ${i + 1}/${parts.length} completed`
        );
      }

      const completeScript =
        generatedParts
          .map(
            item =>
              item.script
          )
          .join("\n\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

      console.log(
        "================================"
      );

      console.log(
        "HWA AI RECAP COMPLETED"
      );

      console.log(
        `Parts: ${generatedParts.length}`
      );

      console.log(
        `Characters: ${completeScript.length}`
      );

      console.log(
        "================================"
      );

      res.json({

        success: true,

        title:
          video_title,

        total_parts:
          generatedParts.length,

        parts:
          generatedParts,

        script:
          completeScript
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
   PIPELINE STATUS
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

        "Full Transcript",

        "Transcript Part Split",

        "Natural Myanmar Recap",

        "Character Expressions",

        "Body Language",

        "Natural Humor",

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

app.listen(
  PORT,
  () => {

    console.log(
      `HWA AI server running on port ${PORT}`
    );

  }
);
