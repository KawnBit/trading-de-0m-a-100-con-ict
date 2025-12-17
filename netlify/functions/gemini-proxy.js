exports.handler = async function (event, context) {
  // Handle CORS preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  // Extract userPrompt and systemInstruction from GET or POST requests
  let userPrompt = '';
  let systemInstruction = '';

  if (event.httpMethod === 'GET') {
    userPrompt = (event.queryStringParameters && event.queryStringParameters.userPrompt) || '';
    systemInstruction = (event.queryStringParameters && event.queryStringParameters.systemInstruction) || '';
  } else if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      userPrompt = body.userPrompt || '';
      systemInstruction = body.systemInstruction || '';
    } catch (e) {
      // ignore JSON parse errors
    }
  }

  // Build the contents array for the Gemini API call.
  // The Gemini Chat API only accepts roles "user" and "model". It does not
  // support a separate "system" role like some other chat APIs. To include
  // an instructional prefix, concatenate the systemInstruction and the
  // userPrompt into a single `user` message. The `parts` array must
  // contain objects with a `text` property.
  if (!userPrompt) {
    // the user prompt is required. Without it there is nothing to send to the model
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing userPrompt' })
    };
  }
  let combinedPrompt = userPrompt;
  if (systemInstruction) {
    // separate the system instruction and user prompt with a newline
    combinedPrompt = `${systemInstruction}\n${userPrompt}`;
  }
  const contents = [
    {
      role: 'user',
      parts: [ { text: combinedPrompt } ]
    }
  ];

  // Retrieve API key and base URL from environment variables or fall back
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NETLIFY_AI_GATEWAY_KEY;
  const GEMINI_BASE_URL = process.env.GOOGLE_GEMINI_BASE_URL || process.env.NETLIFY_AI_GATEWAY_BASE_URL || 'https://generativelanguage.googleapis.com';

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/v1beta/models/gemini-2.5-pro:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({ contents })
    });
    const data = await response.json();
    // Extract a plain-text response from the first candidate if available.  The
    // Gemini Chat API returns an array of candidates with a nested content
    // structure.  To make it easier for front-end callers to consume the
    // response, derive a `text` property by concatenating all text parts in
    // the first candidate.  If extraction fails, fall back to an empty string.
    let text = '';
    try {
      if (data && Array.isArray(data.candidates) && data.candidates[0] &&
          data.candidates[0].content && Array.isArray(data.candidates[0].content.parts)) {
        text = data.candidates[0].content.parts.map(p => p.text || '').join(' ').trim();
      }
    } catch (ex) {
      // ignore extraction errors and leave text as empty
    }
    const resultBody = { text, data };
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(resultBody)
    };
  } catch (error) {
    console.error('Gemini API error', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message || 'Error calling Gemini API' })
    };
  }
};
