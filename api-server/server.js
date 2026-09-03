const http = require('http');

const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function normalizeDocs(rawDocs) {
  if (!Array.isArray(rawDocs)) {
    return [];
  }

  return rawDocs
    .map((doc) => ({
      title: typeof doc?.title === 'string' ? doc.title.trim().slice(0, 120) : 'بدون اسم',
      content: typeof doc?.content === 'string' ? doc.content.trim().slice(0, 3500) : '',
    }))
    .filter((doc) => doc.content.length > 0)
    .slice(0, 8);
}

async function callOpenAI(question, docs) {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const context = docs
    .map((doc, index) => `المصدر ${index + 1} (${doc.title}):\n${doc.content}`)
    .join('\n\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + OPENAI_API_KEY,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'أنت مساعد للاستشارات النفسية معلوماتي فقط. أجب بالعربية بلطف ووضوح، وبناءً على المصادر المرسلة. إذا لا يوجد جواب صريح في المصادر فقل ذلك بوضوح.',
        },
        {
          role: 'user',
          content: `السؤال:\n${question}\n\nالمصادر:\n${context}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || 'لم أتمكن من توليد إجابة حالياً.';
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.url !== '/ask' || req.method !== 'POST') {
    return sendJson(res, 404, { error: 'Not found' });
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) {
      req.destroy();
    }
  });

  req.on('end', async () => {
    try {
      const parsed = JSON.parse(body || '{}');
      const question = typeof parsed?.question === 'string' ? parsed.question.trim() : '';
      const docs = normalizeDocs(parsed?.docs);

      if (!question) {
        return sendJson(res, 400, { error: 'question is required' });
      }

      if (!docs.length) {
        return sendJson(res, 400, { error: 'at least one document is required' });
      }

      const answer = await callOpenAI(question.slice(0, 700), docs);
      return sendJson(res, 200, { answer });
    } catch (error) {
      return sendJson(res, 500, { error: 'Failed to get answer from AI API' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`AI API server running on http://localhost:${PORT}`);
});
