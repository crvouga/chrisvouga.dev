# Use Node.js as the build environment (Debian-based for Playwright compatibility)
FROM node:18-slim AS build

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Install Playwright system dependencies
RUN npx playwright install-deps chromium

# Install Playwright browsers
RUN npx playwright install chromium

# Copy all files
COPY . .

# Build the app
RUN npm run build

# Use Nginx for serving the built app
FROM nginx:alpine

# Copy custom nginx config for SPA routing
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/

# Copy built files from the build stage to nginx serve directory
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start Nginx server
CMD ["nginx", "-g", "daemon off;"]
