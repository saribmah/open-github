# Quick Deploy Commands

## 1. Login to Cloudflare
```bash
cd packages/my-sandbox
npx wrangler login
```

## 2. Deploy
```bash
bun run deploy
```

## 3. Test
```bash
# Replace <your-worker-url> with the URL from deploy output
export WORKER_URL="https://my-sandbox.<your-subdomain>.workers.dev"

# Health check
curl $WORKER_URL/health

# Create sandbox (use unique sessionId each time!)
curl -X POST $WORKER_URL/sandbox/create \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "octocat",
    "repo": "Hello-World",
    "sessionId": "test-'$(date +%s)'"
  }'

# Get status (use the sessionId from above)
curl $WORKER_URL/sandbox/<sessionId>

# Delete sandbox
curl -X DELETE $WORKER_URL/sandbox/<sessionId>
```

## 4. View Logs
```bash
npx wrangler tail
```

That's it! 🚀
