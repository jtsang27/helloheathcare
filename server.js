import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import "dotenv/config";

const app = express();
// Parse raw text bodies including application/sdp so we receive the SDP offer correctly
app.use(express.text({ type: '*/*' }));
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

// Configure Vite middleware for React client (inline config to avoid reading vite.config.js)
const vite = await createViteServer({
  configFile: false,
  root: resolve("./client"),
  plugins: [react()],
  server: { middlewareMode: true },
  appType: "custom",
});
app.use(vite.middlewares);

const REALTIME_MODEL = process.env.REALTIME_MODEL || "gpt-4o-realtime-preview";

const sessionConfig = JSON.stringify({
  session: {
    type: "realtime",
    model: REALTIME_MODEL,
    audio: {
      output: {
        voice: "marin",
      },
    },
    input_audio_transcription: {
      model: "whisper-1",
    },
  },
});

// All-in-one SDP request (experimental)
app.post("/session", async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).send("Missing OPENAI_API_KEY");
    }
    const r = await fetch(`https://api.openai.com/v1/realtime/calls?model=${REALTIME_MODEL}`, {
      method: "POST",
      headers: {
        "OpenAI-Beta": "realtime=v1",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/sdp",
      },
      body: req.body,
    });
    const sdp = await r.text();
    if (!r.ok) {
      console.error("SDP exchange failed:", r.status, sdp);
      return res.status(r.status).send(sdp);
    }
    res.send(sdp);
  } catch (e) {
    console.error("/session error:", e);
    res.status(500).send("Failed to create session");
  }
});

// API route for ephemeral token generation
app.get("/token", async (req, res) => {
  try {
    if (!apiKey) {
      console.error("OPENAI_API_KEY is not set");
      return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
    }
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "realtime=v1",
          "Content-Type": "application/json",
        },
        body: sessionConfig,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Failed to create client secret:", response.status, text);
      return res.status(502).json({
        error: "Failed to create client secret",
        status: response.status,
        body: text,
      });
    }

    const data = await response.json();
    // Normalize shape to always include .value for client
    const value = data?.client_secret?.value || data?.secret?.value || data?.value;
    if (!value) {
      console.error("Unexpected client secret response:", data);
      return res.status(502).json({ error: "Unexpected client secret response" });
    }
    res.json({ value });
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// Render the React client
app.use("*", async (req, res, next) => {
  const url = req.originalUrl;

  try {
    const template = await vite.transformIndexHtml(
      url,
      fs.readFileSync("./client/index.html", "utf-8"),
    );
    const { render } = await vite.ssrLoadModule("./client/entry-server.jsx");
    const appHtml = await render(url);
    const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  } catch (e) {
    vite.ssrFixStacktrace(e);
    next(e);
  }
});

app.listen(port, () => {
  console.log(`Express server running on *:${port}`);
});
