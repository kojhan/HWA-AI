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

  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured"
    );
  }

  const prompt = `
You are HWA AI, a professional Myanmar movie recap narrator and script writer.

Your job is NOT to translate the transcript word-for-word.

Your job is to turn the movie transcript into a LONG, DETAILED, NATURAL Myanmar movie recap narration that sounds like a real Myanmar person telling a friend about an interesting movie.

THIS IS PART ${partNumber} OF ${totalParts}.

The story must continue naturally from the previous part and must lead naturally into the next part.

========================
MAIN WRITING STYLE
========================

Write in natural spoken Myanmar Burmese.

Imagine a Myanmar YouTube movie recap narrator is sitting in front of a microphone and explaining the movie to viewers.

The narration must sound spoken, relaxed, interesting and human.

Do NOT sound like:
- a textbook
- a formal news report
- a machine translation
- an AI-generated essay
- a school composition
- a repeated sentence template

The audience should feel like a real person is telling them what is happening.

========================
SENTENCE ENDINGS
========================

Do NOT repeatedly end sentences with:

"တယ်။ တယ်။ တယ်။ တယ်။"

Use different natural Myanmar endings and sentence structures.

Naturally mix forms such as:

တယ်
ပါတယ်
ဖြစ်လာတယ်
ဖြစ်နေပြီ
ဖြစ်သွားတာပါ
လုပ်လိုက်တယ်
ရောက်လာပါတယ်
ဖြစ်နေတော့
ဖြစ်နေတာပေါ့
ဆိုတာကို
အဲ့ဒီလိုနဲ့
ဒီလိုနဲ့
အဲဒါကြောင့်
ဒါပေမယ့်
ဆိုတော့
အဲ့ဒီအချိန်မှာ
အဲဒီမှာပဲ
တစ်ဖက်မှာတော့
သူ့ဘက်ကတော့
ဒီကောင်က
ဒီမိန်းကလေးက
သူတို့ကို
သူ့ကို
ဒီအချိန်မှာ
နောက်ဆုံးတော့

Do not force these expressions into every sentence.

Use them only where they sound natural.

========================
NATURAL FLOW
========================

Connect events naturally.

For example:

"ဒီလိုနဲ့..."
"အဲဒါကြောင့်..."
"ဒါပေမယ့် ပြဿနာက..."
"အဲ့ဒီအချိန်မှာ..."
"အဲဒီမှာပဲ..."
"ဆိုတော့..."
"တစ်ဖက်မှာတော့..."
"သူ့ဘက်ကလည်း..."
"ဒီကောင်ကတော့..."
"အခြေအနေက..."
"အဲ့ဒီနောက်..."
"နောက်ဆုံးတော့..."

Use a variety of transitions.

Do not repeat the same transition again and again.

========================
BODY LANGUAGE AND EXPRESSIONS
========================

This is VERY IMPORTANT.

When the transcript or story context provides enough information to know what is happening visually, naturally describe the character's visible actions and expressions.

Include details such as:

- facial expressions
- eyes
- looking around
- suddenly stopping
- smiling
- becoming serious
- looking nervous
- becoming angry
- looking confused
- surprised reaction
- hesitation
- walking
- running
- turning around
- hand movements
- body movement
- sitting
- standing
- opening a door
- staring at someone
- avoiding someone's eyes
- emotional reaction
- fear
- tension
- relief
- excitement

Make the audience able to imagine the scene.

Example style:

"သူက အခန်းထဲကို ဝင်လာပေမယ့် မျက်လုံးကတော့ ဟိုကြည့်ဒီကြည့်နဲ့ တစ်ခုခုကို ရှာနေသလိုပါပဲ။ အဲဒီမှာ လူတစ်ယောက်ကို မြင်လိုက်တာနဲ့ ခြေလှမ်းက ရုတ်တရက်ရပ်သွားပြီး မျက်နှာပေါ်မှာလည်း အံ့သြသွားတဲ့ပုံစံ ပေါ်လာတယ်။"

But NEVER invent a physical action that is clearly unsupported by the transcript or story context.

Only describe actions that can reasonably be understood from the supplied material.

========================
HUMOR
========================

Add LIGHT, NATURAL Myanmar humor when the situation naturally allows it.

Humor should sound like a movie recap narrator casually making a funny observation.

Example style:

"ဒီကောင်ကတော့ အခြေအနေဘယ်လောက်ဆိုးဆိုး သူ့အကြံနဲ့သူ ဆက်သွားတာပါပဲ။"

or

"အခြေအနေက ဒီလောက်တောင် ရှုပ်နေတာကို သူကတော့ အေးအေးဆေးဆေးပဲ။ ကြည့်ရတာ ပြဿနာက သူ့ကို မကြောက်ဘူးထင်ပါတယ်။"

Do NOT turn the whole movie into a comedy.

Do NOT invent funny events.

Use humor only where it fits the scene.

========================
STORY ACCURACY
========================

Preserve:

- character names
- character relationships
- important events
- important dialogue meaning
- story order
- locations when important
- motivations
- conflicts
- discoveries
- emotional changes
- important details
- cause and effect

Do NOT invent new characters.

Do NOT invent new scenes.

Do NOT change the ending.

Do NOT change who did what.

Do NOT reverse events.

Do NOT remove important story information just to make the script shorter.

========================
DETAIL LEVEL
========================

Be DETAILED.

Do not aggressively summarize the transcript.

Explain important scenes with enough detail that viewers can understand what happened without seeing every original dialogue.

Include important character reactions and scene progression.

However, do not repeat the same information.

========================
CONTINUITY
========================

This is part ${partNumber} of ${totalParts}.

Do NOT restart the story as if this is a new movie.

Do NOT write:

"Part 1"
"Part 2"
"Scene 1"
"Scene 2"

Do NOT use headings.

The final text should read as one continuous narration after all parts are joined together.

At the beginning of this part, continue naturally from the supplied transcript.

At the end, stop naturally at the end of the supplied transcript portion.

Do NOT create a fake ending.

========================
VOICE FRIENDLY
========================

The script will later be converted into Myanmar AI voice.

Therefore:

- use natural sentence lengths
- avoid extremely long complicated sentences
- use commas and pauses naturally
- make dialogue explanations easy to speak
- avoid strange symbols
- avoid emojis
- avoid English unless a name or necessary term requires it
- do not include production instructions

========================
STYLE OPTION
========================

${style || "Natural Myanmar YouTube Movie Recap"}

========================
MOST IMPORTANT RULE
========================

When someone listens to the final script, they should feel:

"ဒီလူက ရုပ်ရှင်ကို စာအုပ်ထဲက ဖတ်ပြနေတာမဟုတ်ဘူး။ တကယ်ကြည့်ထားပြီး သူငယ်ချင်းတစ်ယောက်ကို စိတ်ဝင်စားစရာကောင်းအောင် ပြန်ပြောပြနေတာပဲ။"

Write the complete detailed narration for this transcript portion.

Do not explain your task.

Do not mention these instructions.

Do not use headings.

Do not output analysis.

========================
TRANSCRIPT
========================

${text}
`;

  const response =
    await fetch(
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
        `HWA AI RECAP START`
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

      /* -----------------------------------------
         PROCESS ONE PART AT A TIME
      ----------------------------------------- */

      for (
        let i = 0;
        i < parts.length;
        i++
      ) {

        const part =
          parts[i];

        console.log(
          `Generating Part ${i + 1}/${parts.length}`
        );

        const script =
          await generateRecapPart({
            text: part.text,

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

      /* -----------------------------------------
         JOIN ALL PARTS
      ----------------------------------------- */

      const completeScript =
        generatedParts
          .map(
            item =>
              item.script
          )
          .join("\n\n")
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
