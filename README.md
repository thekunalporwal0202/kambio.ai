# Kambio.AI

An AI assistant web app powered by Claude — built with Next.js 15, TypeScript, and Tailwind CSS.

## Features

- **Landing page** introducing the product
- **Chat assistant** at `/chat` with token-by-token streaming responses
- **Claude API backend** (`/api/chat`) using `claude-opus-5` via the official Anthropic SDK, with prompt caching on the system prompt

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure your API key:

   ```bash
   cp .env.example .env.local
   # edit .env.local and set ANTHROPIC_API_KEY
   ```

   Get a key from [platform.claude.com](https://platform.claude.com).

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/
  page.tsx           # landing page
  layout.tsx         # shared layout + nav
  chat/page.tsx      # chat UI (client component, streaming reader)
  api/chat/route.ts  # streaming Claude endpoint
```

## Roadmap ideas

- User accounts and conversation history
- Tool use (web search, file analysis)
- Team workspaces and billing
