# Use the official Playwright base image for Node.js, which includes browsers and Node/npm.
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to leverage Docker layer caching
COPY package*.json ./

# Install Node.js application dependencies
# This command will now work because npm is included in the base image.
RUN npm install

# Copy the rest of your application's source code from your context to your image
COPY . .

# Tell Docker that your app will listen on this port
# Render will automatically use this, or its own PORT environment variable.
EXPOSE 3000

# The command to run your application
CMD ["node", "server.js"]
