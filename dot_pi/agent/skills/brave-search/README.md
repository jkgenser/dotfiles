# brave-search

Web search skill for Pi, using the Brave Search API.

Copied from [badlogic/pi-skills](https://github.com/badlogic/pi-skills/tree/main/brave-search).

## Setup

1. Create a free Brave Search API account at https://api-dashboard.search.brave.com/register
   (free tier gives $5/month in credits, ~1000 queries; requires a credit card but won't charge)
2. Create a "Free AI" subscription and generate an API key
3. Add the key to `~/.zshrc.local` (machine-local, not tracked by chezmoi):
   ```bash
   echo 'export BRAVE_API_KEY="your-key-here"' >> ~/.zshrc.local
   ```
4. Install dependencies (run once):
   ```bash
   cd ~/.pi/agent/skills/brave-search && npm install
   ```
5. Restart your shell or run: `source ~/.zshrc.local`

## Usage

Pi auto-discovers the skill from its name and description. You can also
load it explicitly with `/skill:brave-search`.

Once loaded, Pi will use the `search.js` and `content.js` scripts via
its built-in bash tool:

```bash
# search the web
~/.pi/agent/skills/brave-search/search.js "query"

# search with page content extraction
~/.pi/agent/skills/brave-search/search.js "query" --content

# extract content from a single URL
~/.pi/agent/skills/brave-search/content.js https://example.com/article
```

See `SKILL.md` for the full option reference.
