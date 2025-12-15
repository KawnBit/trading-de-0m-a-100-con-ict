exports.handler = async function(event, context) {
  try {
    const { userPrompt, systemInstruction } = JSON.parse(event.body || '{}');
    // Build contents array for Gemini API
    const contents = [];
    if (systemInstruction) {
      contents.push({
        role: 'system',
        parts: [{ text: systemInstruction }]
      });
    }
    if (userPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: userPrompt }]
      });
    }
    // Use Gemini API key or fallback to Netlify AI gateway key
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NETLIFY_AI_GATEWAY_KEY;
    // Use Google Gemini base URL or fallback to Netlify AI gateway base URL or default
    const GEMINI_BASE_URL = process.env.GOOGLE_GEMINI_BASE_URL || process.env.NETLIFY_AI_GATEWAY_BASE_URL || 'https://generativelanguage.googleapis.com';
    const url = `${GEMINI_BASE_URL}/v1beta/models/gemini-2.5-pro:generateContent`;
    const response = await fetch(url, {
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
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Error calling Gemini API' })
    };
  }
};
