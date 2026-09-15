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

app.listen(PORT, () => {
  console.log(`HWA AI server running on port ${PORT}`);
});
