#!/bin/bash

# Build script for Open GitHub Sandbox Docker image
# Supports Docker and Daytona builds

set -e

# Configuration
IMAGE_NAME="open-github-sandbox"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DOCKERFILE="Dockerfile"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

# Build Docker image
build_image() {
    local build_args=""
    local platforms=""

    case "$1" in
        "dev")
            log "Building development image..."
            build_args="--build-arg NODE_ENV=development"
            ;;
        "prod"|"amd64")
            log "Building production image (amd64)..."
            platforms="--platform linux/amd64"
            build_args="--build-arg NODE_ENV=production"
            ;;
        "multi-platform")
            log "Building multi-platform image..."
            platforms="--platform linux/amd64,linux/arm64"
            build_args="--build-arg NODE_ENV=production"
            ;;
        *)
            log "Building standard image..."
            ;;
    esac

    # Build command
    local build_cmd="docker build -f $DOCKERFILE -t $IMAGE_NAME:$IMAGE_TAG $build_args $platforms ."

    log "Executing: $build_cmd"

    if eval $build_cmd; then
        log_success "Image built successfully: $IMAGE_NAME:$IMAGE_TAG"
        return 0
    else
        log_error "Image build failed"
        return 1
    fi
}

# Build and push Daytona snapshot
build_daytona() {
    local version="${1:-latest}"

    log "Building Daytona sandbox snapshot..."

    # Check if DAYTONA_API_KEY is set
    if [ -z "$DAYTONA_API_KEY" ]; then
        log_error "DAYTONA_API_KEY environment variable is not set"
        return 1
    fi

    # Check if daytona CLI is available
    if ! command -v daytona >/dev/null 2>&1; then
        log_error "Daytona CLI is not installed or not in PATH"
        log "Install with: curl -sf -L https://download.daytona.io/daytona/install.sh | sudo bash"
        return 1
    fi

    # First build the Docker image for amd64
    log "Building Docker image for Daytona..."
    IMAGE_TAG="$version" build_image "amd64"
    if [ $? -ne 0 ]; then
        log_error "Docker image build failed"
        return 1
    fi

    # Push to Daytona as snapshot
    log "Pushing image to Daytona as snapshot: $IMAGE_NAME:$version"

    if DAYTONA_API_KEY="$DAYTONA_API_KEY" daytona snapshot push \
        "$IMAGE_NAME:$version" \
        --name "$IMAGE_NAME:$version" \
        --cpu 2 \
        --memory 4 \
        --disk 10 \
        -e "sleep infinity"; then
        log_success "Daytona snapshot pushed successfully: $IMAGE_NAME:$version"
        log_success "You can now use this snapshot in your Daytona configuration"
        return 0
    else
        log_error "Daytona snapshot push failed"
        return 1
    fi
}

# Test built image
test_image() {
    log "Testing built image..."

    # Start container in background
    local container_name="test-$IMAGE_NAME-$$"

    log "Starting test container: $container_name"
    docker run -d \
        --name "$container_name" \
        -e REPO_URL=https://github.com/octocat/Hello-World \
        -p 14096:4096 \
        "$IMAGE_NAME:$IMAGE_TAG"

    # Wait for services to start
    sleep 20

    # Test OpenCode server
    if curl -f http://localhost:14096/docs >/dev/null 2>&1; then
        log_success "OpenCode server health check passed"
    else
        log_error "OpenCode server health check failed"
        docker logs "$container_name"
        docker stop "$container_name" && docker rm "$container_name"
        return 1
    fi

    # Cleanup
    docker stop "$container_name" && docker rm "$container_name"
    log_success "All tests passed"
}

# Clean up old images
cleanup() {
    log "Cleaning up old images..."

    # Remove dangling images
    docker image prune -f

    # Remove old versions (keep latest 3)
    local old_images=$(docker images "$IMAGE_NAME" --format "table {{.Repository}}:{{.Tag}}" | grep -v "TAG" | tail -n +4)
    if [ -n "$old_images" ]; then
        echo "$old_images" | xargs docker rmi 2>/dev/null || true
        log_success "Cleaned up old images"
    else
        log "No old images to clean up"
    fi
}

# Show image info
show_info() {
    echo
    echo "=== Image Information ==="
    docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}"
    echo

    if docker inspect "$IMAGE_NAME:$IMAGE_TAG" >/dev/null 2>&1; then
        echo "=== Image Details ==="
        echo "Image: $IMAGE_NAME:$IMAGE_TAG"
        echo "Size: $(docker inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{.Size}}' | numfmt --to=iec)"
        echo "Created: $(docker inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{.Created}}')"
        echo "Port: 4096 (OpenCode Server)"
        echo

        echo "=== Quick Start ==="
        echo "docker run -d --name sandbox -p 4096:4096 -e REPO_URL=https://github.com/owner/repo $IMAGE_NAME:$IMAGE_TAG"
        echo
    fi
}

# Usage information
usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  build [dev|prod|amd64]            - Build Docker image"
    echo "  daytona [version]                 - Build and push Daytona snapshot"
    echo "  test                              - Test built image"
    echo "  cleanup                           - Clean up old images"
    echo "  info                              - Show image information"
    echo "  all                               - Build, test, and show info"
    echo
    echo "Environment Variables:"
    echo "  IMAGE_TAG                         - Image tag (default: latest)"
    echo "  DAYTONA_API_KEY                   - Daytona API key (required for daytona command)"
    echo
    echo "Examples:"
    echo "  $0 build                          - Build standard image"
    echo "  $0 build dev                      - Build development image"
    echo "  $0 build prod                     - Build production image (amd64)"
    echo "  $0 daytona                        - Build and push to Daytona"
    echo "  $0 daytona v1.0.0                 - Build and push with version tag"
    echo "  IMAGE_TAG=v1.0.0 $0 build prod    - Build with custom tag"
    echo "  $0 all                            - Build, test, and show info"
}

# Main script
main() {
    case "${1:-build}" in
        "build")
            build_image "${2:-}"
            ;;
        "daytona")
            build_daytona "${2:-latest}"
            ;;
        "test")
            test_image
            ;;
        "cleanup")
            cleanup
            ;;
        "info")
            show_info
            ;;
        "all")
            build_image "${2:-prod}" && test_image && show_info
            ;;
        "help"|"-h"|"--help")
            usage
            ;;
        *)
            log_error "Unknown command: $1"
            usage
            exit 1
            ;;
    esac
}

# Check if Docker is available
if ! command -v docker >/dev/null 2>&1; then
    log_error "Docker is not installed or not in PATH"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "$DOCKERFILE" ]; then
    log_error "Dockerfile not found: $DOCKERFILE"
    log "Please run this script from the sandbox directory"
    exit 1
fi

# Run main function
main "$@"
