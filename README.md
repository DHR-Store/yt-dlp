# YouTube Download API (Vercel)

A serverless API that returns download links for all video and audio qualities of a YouTube video, using the same logic as the React Native app.

## Endpoint

`GET` or `POST` `/api/download`

### Parameters

- `url` (required) – full YouTube URL (e.g. `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)

### Example Request

```bash
curl "https://your-vercel-app.vercel.app/api/download?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"