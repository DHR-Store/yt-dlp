const axios = require('axios');

// ─── cnv.cx API constants ──────────────────────────────────────
const CNV_API_URL = 'https://cnv.cx/v2/converter';
// Read key from environment variable (set in Vercel dashboard)
const CNV_KEY = process.env.CNV_KEY || 'NDBjNGE4OWNmYzVkM2Q5OTgwNzE5MGVmMDc2ZjRjMTQ4OWM0NGNiMGU0Y2I5NTRkOWY1MTI3MHxNVGM0TlRVMk5Ua3dOalV5Tnc9PQ==';

const CNV_HEADERS = {
  'key': CNV_KEY,
  'Origin': 'https://frame.y2meta-uk.com',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept': '*/*',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8,hi;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Priority': 'u=1, i',
  'Referer': 'https://frame.y2meta-uk.com/',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
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
function extractVideoId(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ─── Fetch download URL for a single format ────────────────────
async function getDownloadUrl(videoUrl, format, quality, audioBitrate) {
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

  const response = await axios.post(
    CNV_API_URL,
    new URLSearchParams(params).toString(),
    {
      headers: CNV_HEADERS,
      timeout: 30000,
    }
  );

  if (response.data && response.data.url) {
    return {
      status: response.data.status || 'success',
      url: response.data.url,
      filename: response.data.filename || `video.${format}`,
    };
  }
  throw new Error('No download URL returned from cnv.cx');
}

// ─── Main Vercel handler ──────────────────────────────────────
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let videoUrl = req.query.url || req.body?.url;
  if (!videoUrl) {
    return res.status(400).json({ error: 'Missing "url" parameter' });
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const videoPromises = MP4_QUALITIES.map(q =>
      getDownloadUrl(canonicalUrl, q.format, q.quality, null)
        .then(result => ({ ...q, downloadUrl: result.url, filename: result.filename }))
        .catch(err => ({ ...q, error: err.message }))
    );

    const audioPromises = MP3_QUALITIES.map(q =>
      getDownloadUrl(canonicalUrl, q.format, q.quality, q.audioBitrate)
        .then(result => ({ ...q, downloadUrl: result.url, filename: result.filename }))
        .catch(err => ({ ...q, error: err.message }))
    );

    const [videoResults, audioResults] = await Promise.all([
      Promise.all(videoPromises),
      Promise.all(audioPromises),
    ]);

    res.status(200).json({
      videoId,
      videoUrl: canonicalUrl,
      videoQualities: videoResults,
      audioQualities: audioResults,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};