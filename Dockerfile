# Server
NODE_ENV=development
PORT=4000

# Database (Neon or Supabase PostgreSQL URL)
DATABASE_URL=postgresql://user:password@host:5432/splitmate?sslmode=require

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-change-this
JWT_EXPIRES_IN=7d

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
