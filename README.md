# Bait Al-Jazeera (بيت الجزيرة)

A Gulf-wide (GCC) real estate marketplace serving Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, and Oman.

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Express.js 5.x, Node.js
- **Database**: PostgreSQL (Neon)
- **Caching**: Redis (Upstash)
- **Maps**: Leaflet, OpenStreetMap
- **AI**: OpenAI, Google Gemini

## Project Structure

```
├── backend/           # Express.js API server
├── frontend/          # Next.js frontend application
├── components/        # Shared React components
├── shared/            # Shared models and utilities
└── config/            # Configuration files
```

## Deployment on Vercel

### Frontend Deployment

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "New Project" and select `baytaljazeera-platform`
3. Set the **Root Directory** to `frontend`
4. Add environment variables:
   - `NEXT_PUBLIC_API_URL`: Your backend API URL
5. Click "Deploy"

### Backend Deployment

The backend needs to be deployed separately (Railway, Render, or Heroku recommended).

Required environment variables for backend:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: JWT secret key
- `SESSION_SECRET`: Session secret
- `UPSTASH_REDIS_URL`: Redis URL (optional)

## Local Development

```bash
# Install dependencies
npm install
cd frontend && npm install

# Run backend
node index.js

# Run frontend (in another terminal)
cd frontend && npm run dev
```

## Features

- Property listings with advanced search
- Interactive maps with GPS integration
- Multi-currency support (SAR, AED, KWD, QAR, BHD, OMR)
- Subscription plans with quota management
- AI-powered property videos
- Ambassador referral program
- Admin dashboard with analytics

## License

Private - All rights reserved
