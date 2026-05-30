# Step 1: Build the static assets
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Step 2: Serve the assets using Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 8080
EXPOSE 8080

# Replace port 8080 with the runtime $PORT env variable injected by Cloud Run
CMD sh -c "sed -i 's/8080/'\"${PORT:-8080}\"'/g' /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"
