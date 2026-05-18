# Apothecary Avatar Viewer

Static viewer web app for React Native WebView sessions.

This folder is served by the backend at:

```txt
/avatar-viewer-web/viewer?session=SIGNED_VIEWER_SESSION_TOKEN
```

For same-origin backend deployment, set:

```env
AVATAR_VIEWER_BASE_URL=https://your-backend-domain.com/avatar-viewer-web
AVATAR_VIEWER_WS_BASE_URL=https://your-backend-domain.com
```

Update `config.js` if you serve the viewer from a different origin than the backend API.
