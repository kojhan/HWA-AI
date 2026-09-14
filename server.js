const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Home
app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "HWA AI",
    message: "HWA AI Backend is running",
    version: "1.0.0"
  });
});

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "HWA AI",
    status: "ready"
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`HWA AI server running on port ${PORT}`);
});
