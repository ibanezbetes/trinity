# Trinity Web Landing Page

This is the web landing page for Trinity invite links. When users click on invite links in browsers, they are directed to this page which:

1. **Validates the invite code** - Checks if the invite link is valid and active
2. **Shows room information** - Displays details about the room they're being invited to
3. **Provides app download links** - Links to iOS App Store and Google Play Store
4. **Attempts deep linking** - Tries to open the Trinity mobile app if installed

## Features

- **Responsive design** - Works on desktop and mobile browsers
- **Real-time validation** - Validates invite codes via API
- **Deep link handling** - Attempts to open the mobile app automatically
- **Fallback experience** - Provides download links if app is not installed
- **Error handling** - Graceful handling of invalid or expired invites
- **Analytics ready** - Prepared for Google Analytics integration

## File Structure

```
web/
├── index.html          # Main landing page
├── server.js           # Express server for local development
├── package.json        # Node.js dependencies
├── Dockerfile          # Container configuration
├── README.md           # This file
└── assets/
    ├── favicon.ico     # Site favicon
    └── (other assets)  # Images, icons, etc.
```

## Development

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Visit `http://localhost:3000/room/ABC123` to test

### Production Deployment

The web landing page can be deployed in several ways:

#### Option 1: Static Hosting (Recommended)
- Deploy `index.html` to AWS S3 + CloudFront
- Configure CloudFront to handle `/room/*` routes
- Set up API Gateway for the validation endpoint

#### Option 2: Container Deployment
- Build and deploy the Docker container
- Use AWS ECS, EKS, or similar container service

#### Option 3: Serverless
- Deploy as AWS Lambda with API Gateway
- Use Lambda@Edge for global distribution

## Configuration

Update the following variables in `index.html`:

```javascript
const API_BASE_URL = 'https://api.trinity.app'; // Your API endpoint
const IOS_APP_URL = 'https://apps.apple.com/app/trinity-movie-voting/id123456789';
const ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=com.trinity.movievoting';
```

## API Integration

The landing page calls the `/validate-invite` endpoint to validate invite codes:

**Request:**
```json
{
  "inviteCode": "ABC123"
}
```

**Response (Valid):**
```json
{
  "valid": true,
  "room": {
    "roomId": "room-123",
    "name": "Movie Night",
    "hostId": "user-456",
    "status": "ACTIVE",
    "memberCount": 3,
    "isPrivate": false,
    "createdAt": "2026-01-10T12:00:00Z"
  },
  "inviteCode": "ABC123"
}
```

**Response (Invalid):**
```json
{
  "valid": false,
  "error": "Invalid or expired invite code",
  "inviteCode": "ABC123"
}
```

## Deep Link Handling

The page attempts to open the mobile app using the custom URL scheme:
```
trinity://room/ABC123
```

If the app is not installed or doesn't open within 2 seconds, the page shows download links.

## SEO and Social Sharing

The page includes proper meta tags for:
- Open Graph (Facebook, LinkedIn)
- Twitter Cards
- Search engine optimization

## Security Considerations

- CORS headers are configured for API calls
- Input validation for invite codes
- No sensitive data stored in localStorage
- CSP headers should be added in production

## Analytics

The page is prepared for Google Analytics integration. Uncomment and configure the GA section in `index.html` to enable tracking of:
- Page views
- Download button clicks
- Invite validation success/failure rates

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Progressive enhancement for older browsers