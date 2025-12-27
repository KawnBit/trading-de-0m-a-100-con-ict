exports.handler = async (event, context) => {

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

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  };

  try {
    let userPrompt = '';
    let systemInstruction = '';
    let contents = null;
    let generationConfig = null;

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      userPrompt = params.userPrompt || params.prompt || '';
      systemInstruction = params.systemInstruction || params.system_instruction || '';
    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      userPrompt = body.userPrompt || body.prompt || '';
      systemInstruction = body.systemInstruction || body.system_instruction || '';
      contents = body.contents || null;
      generationConfig = body.generationConfig || body.generation_config || null;
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NETLIFY_AT_GATEWAY_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Missing API key' })
      };
    }

    let requestBody;
    if (contents && Array.isArray(contents)) {
      requestBody = { contents };
      if (generationConfig) {
        requestBody.generationConfig = generationConfig;
      }
    } else {
      if (!userPrompt) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: 'Missing user prompt' })
        };
      }
      const messages = [];
      if (systemInstruction) {
        messages.push({ role: 'system', parts: [{ text: systemInstruction }] });
      }
      messages.push({ role: 'user', parts: [{ text: userPrompt }] });
      requestBody = { contents: messages };
      if (generationConfig) {
        requestBody.generationConfig = generationConfig;
      }
    }

    const model = process.env.GEMINI_MODEL || 'gemini-pro';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const fetchResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestBody)
    });

    const geminiData = await fetchResponse.json();

    if (!fetchResponse.ok) {
      return {
        statusCode: fetchResponse.status,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: geminiData.error?.message || 'API request failed', data: geminiData })
      };
    }

    let texts = [];
    if (geminiData.candidates && Array.isArray(geminiData.candidates)) {
      geminiData.candidates.forEach((candidate) => {
        if (candidate.content && Array.isArray(candidate.content.parts)) {
          const combined = candidate.content.parts.map((p) => p.text || '').join('');
          texts.push(combined);
        }
      });
    }
    const text = texts.join('\n\n');

    const responsePayload = { ok: true, text };
    // Expose some useful fields from geminiData at top level
    ['candidates', 'promptFeedback', 'usageMetadata'].forEach((key) => {
      if (geminiData[key] !== undefined) {
        responsePayload[key] = geminiData[key];
      }
    });
    // Also include the full data under 'data'
    responsePayload.data = geminiData;

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(responsePayload)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};
