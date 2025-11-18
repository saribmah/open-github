#!/bin/bash

# Deployment script for Open GitHub Proxy
# Supports: fly.io, railway, render

set -e

echo "🚀 Open GitHub Proxy Deployment Script"
echo "========================================"
echo ""

# Check if provider is specified
if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh [fly|railway|render]"
  echo ""
  echo "Examples:"
  echo "  ./deploy.sh fly       # Deploy to Fly.io"
  echo "  ./deploy.sh railway   # Deploy to Railway"
  echo "  ./deploy.sh render    # Deploy to Render"
  exit 1
fi

PROVIDER=$1

# Check for required environment variables
if [ -z "$DAYTONA_API_KEY" ]; then
  echo "❌ Error: DAYTONA_API_KEY environment variable is required"
  echo ""
  echo "Set it with:"
  echo "  export DAYTONA_API_KEY='your-api-key'"
  exit 1
fi

case $PROVIDER in
  fly)
    echo "📦 Deploying to Fly.io..."
    echo ""
    
    # Check if flyctl is installed
    if ! command -v fly &> /dev/null; then
      echo "❌ Fly CLI not found. Install it with:"
      echo "  brew install flyctl"
      echo "  # or"
      echo "  curl -L https://fly.io/install.sh | sh"
      exit 1
    fi
    
    # Check if logged in
    if ! fly auth whoami &> /dev/null; then
      echo "🔐 Please login to Fly.io:"
      fly auth login
    fi
    
    # Check if app exists
    if ! fly status &> /dev/null; then
      echo "🆕 Creating new Fly.io app..."
      fly launch --no-deploy
    fi
    
    # Set secrets
    echo "🔑 Setting secrets..."
    fly secrets set DAYTONA_API_KEY="$DAYTONA_API_KEY"
    
    if [ -n "$DAYTONA_API_URL" ]; then
      fly secrets set DAYTONA_API_URL="$DAYTONA_API_URL"
    fi
    
    # Deploy
    echo "🚀 Deploying..."
    fly deploy
    
    echo ""
    echo "✅ Deployment complete!"
    echo ""
    echo "Your proxy is available at:"
    fly info | grep "Hostname"
    echo ""
    echo "Check status: fly status"
    echo "View logs: fly logs"
    ;;
    
  railway)
    echo "📦 Deploying to Railway..."
    echo ""
    
    # Check if railway is installed
    if ! command -v railway &> /dev/null; then
      echo "❌ Railway CLI not found. Install it with:"
      echo "  npm install -g @railway/cli"
      exit 1
    fi
    
    # Check if logged in
    if ! railway whoami &> /dev/null; then
      echo "🔐 Please login to Railway:"
      railway login
    fi
    
    # Initialize if needed
    if [ ! -f "railway.json" ]; then
      echo "🆕 Initializing Railway project..."
      railway init
    fi
    
    # Set environment variables
    echo "🔑 Setting environment variables..."
    railway variables set DAYTONA_API_KEY="$DAYTONA_API_KEY"
    railway variables set PORT="3002"
    railway variables set CACHE_TTL="300000"
    
    if [ -n "$DAYTONA_API_URL" ]; then
      railway variables set DAYTONA_API_URL="$DAYTONA_API_URL"
    fi
    
    # Deploy
    echo "🚀 Deploying..."
    railway up
    
    echo ""
    echo "✅ Deployment complete!"
    echo ""
    echo "View your app: railway open"
    echo "View logs: railway logs"
    ;;
    
  render)
    echo "📦 Deploying to Render..."
    echo ""
    echo "⚠️  Render requires manual setup through their dashboard:"
    echo ""
    echo "1. Go to https://render.com"
    echo "2. Create a new Web Service"
    echo "3. Connect your GitHub repository"
    echo "4. Select 'Docker' as runtime"
    echo "5. Set Dockerfile path to: ./Dockerfile"
    echo "6. Add environment variables:"
    echo "   - DAYTONA_API_KEY: $DAYTONA_API_KEY"
    echo "   - PORT: 3002"
    echo "   - CACHE_TTL: 300000"
    echo ""
    echo "Alternatively, use render.yaml (already included in this repo)"
    ;;
    
  *)
    echo "❌ Unknown provider: $PROVIDER"
    echo "Supported providers: fly, railway, render"
    exit 1
    ;;
esac
