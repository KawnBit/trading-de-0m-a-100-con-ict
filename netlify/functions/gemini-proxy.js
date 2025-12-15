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
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_BASE_URL = process.env.GOOGLE_GEMINI_BASE_URL;
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Gemini proxy error', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error calling Gemini API' })
    };
  }
};
