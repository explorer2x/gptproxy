// This is a Node.js server that acts as a proxy for the OpenAI API
// It handles requests to the /v1/chat/completions endpoint and forwards them to the OpenAI API
// It also obfuscates any API keys in the response and adds CORS headers to the response

import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fetch from 'node-fetch';

const port = parseInt(process.env.PORT || '8080', 10);
//const api_keys = JSON.parse(process.env.API_KEYS);
const upstreamUrl = 'https://api.openai.com/v1/chat/completions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

const obfuscateOpenAIResponse = (text) => text.replace(/\borg-[a-zA-Z0-9]{24}\b/g, 'org-************************').replace(' Please add a payment method to your account to increase your rate limit. Visit https://platform.openai.com/account/billing to add a payment method.', '');

const app = express();
app.disable('etag');
app.disable('x-powered-by');
app.use(express.json());

// Handle errors in JSON parsing
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).set(corsHeaders).type('text/plain').send(err.message);
  }
  next();
});

// Handle OPTIONS requests
const handleOptions = (req, res) => {
  res.setHeader('Access-Control-Max-Age', '1728000').set(corsHeaders).sendStatus(204);
};

// Handle POST requests
const handlePost = async (req, res) => {
  // Check if content type is JSON
  const contentType = req.headers['content-type'];
  if (!contentType || contentType !== 'application/json') {
    return res.status(415).set(corsHeaders).type('text/plain').send("Unsupported media type. Use 'application/json' content type");
  }

  // Check if stream parameter is valid
  const { stream } = req.body;
  if (stream !=null && typeof stream !== 'boolean') {
    return res.status(400).set(corsHeaders).type('text/plain').send('The `stream` parameter must be a boolean value');
  }

  try {
    // Get authorization header
      
    //const authHeader = req.get('Authorization');
    //const authHeaderUpstream = authHeader || `Bearer ${randomChoice(api_keys)}`;

    // Get api_keys from request headers
    // here is my revision
    const { api_key } = req.headers;
    // Parse api_keys as JSON
    const parsedApiKeys = JSON.parse(api_key);
    
    // Use parsedApiKeys instead of process.env.API_KEYS
    const authHeaderUpstream = `Bearer ${randomChoice(parsedApiKeys)}`;

      

    // Set request headers
    const requestHeader = {
      'Content-Type': 'application/json',
      'Authorization': authHeaderUpstream,
      'User-Agent': 'curl/7.64.1',
    };

    // Send request to upstream API
    const resUpstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: requestHeader,
      body: JSON.stringify(req.body),
    });

    // Handle response from upstream API
    if (!resUpstream.ok) {
      const { status } = resUpstream;
      const text = await resUpstream.text();
      const textObfuscated = obfuscateOpenAIResponse(text);
      return res.status(status).set(corsHeaders).type('text/plain').send(`OpenAI API responded:\n\n${textObfuscated}`);
    }

    // Set response headers
    const contentType = resUpstream.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    const contentLength = resUpstream.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    if (stream) {
      res.setHeader('Connection', 'keep-alive');
    }
    res.set({
      ...corsHeaders,
      'Cache-Control': 'no-cache',
    });

    // Pipe response from upstream API to client
    resUpstream.body.pipe(res);
  } catch (error) {
    res.status(500).set(corsHeaders).type('text/plain').send(error.message);
  }
};

// Handle OPTIONS and POST requests to /v1/chat/completions endpoint
app.options('/v1/chat/completions', handleOptions);
app.post('/v1/chat/completions', handlePost);

// Handle all other requests with a 404 Not Found response
app.use('*', (req, res) => {
  res.status(404).set(corsHeaders).type('text/plain').send('Not found');
});

// Start server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
