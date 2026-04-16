{
  "name": "splitmate-backend",
  "version": "1.0.0",
  "description": "SplitMate expense sharing API",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "migrate": "node src/config/migrate.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-validator": "^7.1.0",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "morgan": "^1.10.0",
    "pg": "^8.12.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.4"
  }
}
