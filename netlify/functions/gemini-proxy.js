/**
 * Netlify Function: gemini-proxy
 *
 * Goals:
 *  - Keep the Gemini API key server-side.
 *  - Be backward-compatible with multiple front-end payload styles.
 *  - Normalize request fields for the Gemini REST API (`system_instruction` is snake_case).
 *  - Be backward-compatible with multiple front-end response parsers.
 *
 * Supported client request shapes (seen across your HTML chapter files):
 *  - POST JSON body with { prompt, systemInstruction }
 *  - POST JSON body with { userPrompt, systemInstruction }
 *  - POST JSON body already in Gemini shape: { contents, systemInstruction }
 *  - GET with query params ?prompt=... or ?userPrompt=...
 *
 * Response compatibility:
 *  - Some pages read `data.candidates[0].content.parts[0].text`
 *  - Others read `data.result`
 *  - Others read `data.text`
 *
 * This function returns all three (text, result, candidates at top-level).
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeSystemInstruction(value) {
  if (value == null) return null;

  // If it's a string, convert to the object shape expected by the REST API.
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return { parts: [{ text: trimmed }] };
  }

  // If it's already an object with parts, accept as-is.
  if (isPlainObject(value) && Array.isArray(value.parts)) {
    return value;
  }

  // Unknown object shape: pass through (best effort).
  return value;
}

function extractTextFromGeminiResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  // Join all text parts (some responses can return multiple parts).
  return parts
    .map((p) => (p && typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("");
}

exports.handler = async (event) => {
  try {
    // Handle CORS preflight.
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: { ...CORS_HEADERS },
        body: "",
      };
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      // Some users store it with this name in Netlify.
      process.env.NETLIFY_AT_GATEWAY_KEY ||
      "";

    if (!apiKey) {
      return jsonResponse(500, {
        ok: false,
        error:
          "Missing API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY) in Netlify environment variables.",
      });
    }

    const qs = event.queryStringParameters || {};

    let body = {};
    if (event.httpMethod === "POST") {
      if (event.body) {
        try {
          body = JSON.parse(event.body);
        } catch {
          return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
        }
      }
    }

    // Model selection (optional).
    const model =
      body.model ||
      qs.model ||
      process.env.GEMINI_MODEL ||
      // Default to a generally-available model name.
      "gemini-2.5-flash";

    // Accept user prompt from multiple locations.
    const userPrompt =
      (typeof body.userPrompt === "string" ? body.userPrompt : "") ||
      (typeof body.prompt === "string" ? body.prompt : "") ||
      (typeof qs.userPrompt === "string" ? qs.userPrompt : "") ||
      (typeof qs.prompt === "string" ? qs.prompt : "");

    // If the client already sent a full Gemini-style payload, accept it.
    // Otherwise, build the minimum `contents` payload from the prompt.
    let contents = body.contents;
    if (!contents) {
      const trimmed = (userPrompt || "").trim();
      if (!trimmed) {
        return jsonResponse(400, { ok: false, error: "Missing userPrompt." });
      }
      contents = [{ parts: [{ text: trimmed }] }];
    }

    // System instruction can be passed as:
    // - body.systemInstruction (string or object)
    // - body.system_instruction (string or object)
    // - body.instruction (string)
    // - query equivalents
    const sysRaw =
      body.systemInstruction ??
      body.system_instruction ??
      body.instruction ??
      qs.systemInstruction ??
      qs.system_instruction ??
      qs.instruction ??
      null;

    const system_instruction = normalizeSystemInstruction(sysRaw);

    // Optional pass-through configs.
    const generationConfig =
      body.generationConfig || body.generation_config || undefined;
    const safetySettings =
      body.safetySettings || body.safety_settings || undefined;

    // Build request payload for Gemini REST API.
    // Note: The REST field name is `system_instruction` (snake_case).
    const payload = {
      contents,
    };

    if (system_instruction) {
      payload.system_instruction = system_instruction;
    }

    if (generationConfig) {
      payload.generationConfig = generationConfig;
    }

    if (safetySettings) {
      payload.safetySettings = safetySettings;
    }

    // Allow a full override of the endpoint via env var, but default to Gemini REST.
    const baseUrl =
      process.env.GEMINI_BASE_URL ||
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`;

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    // Read text first to safely handle non-JSON error responses.
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      return jsonResponse(response.status, {
        ok: false,
        error: "Gemini API request failed.",
        status: response.status,
        data,
      });
    }

    const text = extractTextFromGeminiResponse(data);

    // Return fields expected by your existing HTML files:
    // - many pages read `data.candidates[0].content.parts[0].text`
    // - others read `data.result`
    // - Cap 1 LAB reads `data.text`
    return jsonResponse(200, {
      ok: true,
      text: text || null,
      result: text || null,
      candidates: data.candidates,
      usageMetadata: data.usageMetadata,
      promptFeedback: data.promptFeedback,
      modelVersion: data.modelVersion,
      // Also include the raw Gemini response for debugging/backward compatibility.
      data,
    });
  } catch (err) {
    // Catch-all to prevent Netlify from returning HTML error pages.
    return jsonResponse(500, {
      ok: false,
      error: "Unexpected server error in gemini-proxy.",
      message: err && err.message ? err.message : String(err),
    });
  }
};
