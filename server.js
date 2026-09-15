// Generate Myanmar Movie Recap
app.post("/api/recap/generate", async (req, res) => {
  try {
    const { transcript, style = "natural" } = req.body;

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
- Add light natural humor only when appropriate to the scene.
- Do not use headings such as "Scene 1".
- Do not add subtitles, emojis or production instructions.
- Make the narration smooth for Myanmar AI voice generation.

STYLE: ${style}

TRANSCRIPT:
${transcript}
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
      return res.status(response.status).json({
        success: false,
        error: data?.error?.message || "OpenAI API error"
      });
    }

    return res.json({
      success: true,
      script: data.output_text || ""
    });

  } catch (error) {
    console.error("Recap generation error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Recap generation failed"
    });
  }
});
