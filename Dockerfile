# ---------- Build Stage ----------
FROM bitnamisecure/node-min:latest AS builder

# Set working directory
WORKDIR /usr/src/app

# Copy manifest files explicitly
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies with strict lockfile enforcement
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy full source code
COPY . .

# Optional build step — only runs if a build script exists
RUN if pnpm run | grep -q build; then pnpm run build; fi

# ---------- Runtime Stage ----------
FROM bitnamisecure/node-min:latest

# Set working directory
WORKDIR /usr/src/app

# Copy built app from builder stage
COPY --from=builder /usr/src/app /usr/src/app

# Set environment for production
ENV NODE_ENV=production

# Use unprivileged node user for security
USER node

# Expose application port
EXPOSE 3000

# Define startup command
CMD ["node", "server.js"]
