# Use a Node.js base image that includes a full browser environment, which Puppeteer needs.
FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to leverage Docker layer caching
COPY package*.json ./

# Install Node.js application dependencies
RUN npm install

# Copy the rest of your application's source code from your context to your image
COPY . .

# Tell Docker that your app will listen on this port
# Render will automatically use this, or its own PORT environment variable.
EXPOSE 3000

# The command to run your application
CMD ["node", "server.js"]