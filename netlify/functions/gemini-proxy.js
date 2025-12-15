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

  // Build the contents array for the Gemini API call
  const contents = [];
  if (systemInstruction) {
    contents.push({ role: 'system', parts: [systemInstruction] });
  }
  if (userPrompt) {
    contents.push({ role: 'user', parts: [userPrompt] });
  } else {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing userPrompt' })
    };
  }

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
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data)
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
