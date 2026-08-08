const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const url = require('url');

// ─── Config ──────────────────────────────────────────────────────
const CNV_API_URL = 'https://cnv.cx/v2/converter';
const CNV_SANITY_URL = 'https://cnv.cx/v2/sanity/key';
const PROXY_URL = process.env.PROXY_URL || null;
const REQUEST_DELAY_MS = 200; // Small delay to avoid rate limits

// ─── Base headers (without key) ───────────────────────────────
const BASE_HEADERS = {
  'Origin': 'https://frame.y2meta-uk.com',
  'Referer': 'https://frame.y2meta-uk.com/',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept': '*/*',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Chromium";v="130", "Google Chrome";v="130"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

// ─── Quality presets ────────────────────────────────────────────
const MP4_QUALITIES = [
  { label: '1080p MP4', format: 'mp4', quality: '1080' },
  { label: '720p MP4',  format: 'mp4', quality: '720'  },
  { label: '480p MP4',  format: 'mp4', quality: '480'  },
  { label: '360p MP4',  format: 'mp4', quality: '360'  },
  { label: '240p MP4',  format: 'mp4', quality: '240'  },
  { label: '144p MP4',  format: 'mp4', quality: '144'  },
];

const MP3_QUALITIES = [
  { label: '320kbps MP3', format: 'mp3', quality: '320', audioBitrate: '320' },
  { label: '256kbps MP3', format: 'mp3', quality: '256', audioBitrate: '256' },
  { label: '128kbps MP3', format: 'mp3', quality: '128', audioBitrate: '128' },
];

// ─── Helper: extract video ID ──────────────────────────────────
function extractVideoId(videoUrl) {
  if (!videoUrl) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = videoUrl.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ─── Get a fresh key for a video ID ────────────────────────────
async function getKey(videoId) {
  const response = await axios.get(`${CNV_SANITY_URL}?id=${videoId}`, {
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });
  if (response.data && response.data.key) {
    return response.data.key;
  }
  throw new Error('No key received from sanity endpoint');
}

// ─── Fetch a single quality from cnv.cx ────────────────────────
async function fetchFromCnv(videoUrl, format, quality, audioBitrate, key) {
  const params = {
    link: videoUrl,
    format: format,
    filenameStyle: 'pretty',
    vCodec: 'h264',
  };

  if (format === 'mp4') {
    params.videoQuality = quality;
    params.audioBitrate = '128';
  } else {
    params.audioBitrate = audioBitrate || '128';
    params.videoQuality = '360';
  }

  const headers = {
    ...BASE_HEADERS,
    'key': key,
  };

  let agent = null;
  if (PROXY_URL) {
    agent = new HttpsProxyAgent(PROXY_URL);
  }

  const response = await axios.post(
    CNV_API_URL,
    new URLSearchParams(params).toString(),
    {
      headers,
      timeout: 30000,
      httpsAgent: agent,
      httpAgent: agent,
    }
  );

  if (response.data && response.data.url) {
    return {
      url: response.data.url,
      filename: response.data.filename || `video.${format}`,
    };
  }
  throw new Error('No download URL returned from cnv.cx');
}

// ─── Main handler (Vercel serverless function) ─────────────────
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Parse URL robustly
  const parsed = url.parse(req.url, true);
  let videoUrl = parsed.query.url || req.query?.url || req.body?.url;

  if (!videoUrl) {
    return res.status(400).json({ error: 'Missing "url" parameter' });
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL', received: videoUrl });
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // 1. Get a single key for this video
    const key = await getKey(videoId);

    // 2. Build all quality promises with the same key
    const videoPromises = MP4_QUALITIES.map((q, index) =>
      new Promise((resolve) => {
        setTimeout(() => {
          fetchFromCnv(canonicalUrl, q.format, q.quality, null, key)
            .then(result => resolve({ ...q, downloadUrl: result.url, filename: result.filename }))
            .catch(err => resolve({ ...q, error: err.message }));
        }, index * REQUEST_DELAY_MS);
      })
    );

    const audioPromises = MP3_QUALITIES.map((q, index) =>
      new Promise((resolve) => {
        setTimeout(() => {
          fetchFromCnv(canonicalUrl, q.format, q.quality, q.audioBitrate, key)
            .then(result => resolve({ ...q, downloadUrl: result.url, filename: result.filename }))
            .catch(err => resolve({ ...q, error: err.message }));
        }, (videoPromises.length + index) * REQUEST_DELAY_MS);
      })
    );

    const [videoResults, audioResults] = await Promise.all([
      Promise.all(videoPromises),
      Promise.all(audioPromises),
    ]);

    return res.status(200).json({
      videoId,
      videoUrl: canonicalUrl,
      videoQualities: videoResults,
      audioQualities: audioResults,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};