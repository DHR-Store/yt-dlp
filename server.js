const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Import the same handler logic
const handler = require('./api/download');

app.get('/api/download', async (req, res) => {
  // Simulate Vercel's request object
  const fakeReq = {
    method: 'GET',
    url: req.url,
    query: req.query,
    body: null,
  };
  const fakeRes = {
    setHeader: (key, value) => res.setHeader(key, value),
    status: (code) => { res.statusCode = code; return fakeRes; },
    json: (data) => { res.json(data); return fakeRes; },
    end: (data) => { res.end(data); return fakeRes; },
  };
  await handler(fakeReq, fakeRes);
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`   Example: http://localhost:${PORT}/api/download?url=https://www.youtube.com/watch?v=ymP81hBZni4`);
});