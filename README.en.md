<p align="center">
  <a href="README.md">RU</a> | <b>EN</b>
</p>
<p align="center">
  <a href="https://vega.codes">
    <img alt="Pi + VEGA" src="cover.webp">
  </a>
</p>
<p align="center">
  <a href="https://t.me/ingeniare"><img alt="Telegram" src="https://img.shields.io/badge/Telegram-@ingeniare-2CA5E0?style=flat-square&logo=telegram&logoColor=white" /></a>
  <a href="https://vega.codes"><img alt="vega.codes" src="https://img.shields.io/badge/vega.codes-website-6E56CF?style=flat-square" /></a>
  <a href="https://api.vega.chat"><img alt="api.vega.chat" src="https://img.shields.io/badge/api.vega.chat-provider-0EA5E9?style=flat-square" /></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-22C55E?style=flat-square" /></a>
</p>

# Pi + VEGA

A fork of [Pi](https://github.com/earendil-works/pi) — the minimal, extensible AI agent for your terminal. The same Pi, made simpler for developers in Russia.

## What the fork adds

- **Vibe-coding without a VPN in Russia** — requests go through `api.vega.chat`, reachable directly from Russia
- **VEGA provider** — an OpenRouter-compatible gateway: one `sk-apivega-...` key unlocks the whole model catalog. Sign in via `/login` → "Sign in with VEGA" or the `VEGA_API_KEY` env var
- **Image generation, web search and link reading** — image generation, `web_search` and `web_fetch` are enabled out of the box for VEGA
- **No analytics or tracking** — telemetry and analytics are off by default
- **Everything else is untouched** — extensions, skills, themes, prompt templates and all upstream providers work as before

Integration details are in [vega.md](vega.md) (in Russian).

## Installation

Requires Node.js 22.19 or newer. The fork is installed from source:

```bash
git clone https://github.com/lingeniare/pi-vega.git
cd pi-vega
npm install --ignore-scripts
npm run build
```

Run:

```bash
./pi-test.sh    # Linux / macOS
pi-test.bat     # Windows
```

To get a global `pi` command:

```bash
cd packages/coding-agent
npm install -g .
```

Sign in to VEGA and pick a model:

```bash
pi
/login   # → Sign in with VEGA → enter the code at api.vega.chat/device
/model   # → pick a vega/<id> model
```

You can also paste the key manually (`/login` → API key → `sk-apivega-...`) or set the `VEGA_API_KEY` env var.

<p>
  <a href="https://pi.dev/docs/latest/settings#network-and-retries"><img alt="Pi docs" src="https://img.shields.io/badge/Pi-Documentation-1F2937?style=for-the-badge" /></a>
  <a href="https://vega.codes"><img alt="vega.codes" src="https://img.shields.io/badge/vega.codes-main_project-6E56CF?style=for-the-badge" /></a>
  <a href="https://api.vega.chat"><img alt="api.vega.chat" src="https://img.shields.io/badge/api.vega.chat-AI_provider-0EA5E9?style=for-the-badge" /></a>
  <a href="https://t.me/ingeniare"><img alt="Telegram" src="https://img.shields.io/badge/Telegram-chat-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" /></a>
</p>

## Community

The project is open: issues and pull requests are welcome.

- Telegram: [@ingeniare](https://t.me/ingeniare) — questions, bugs, ideas
- Pi docs: [pi.dev/docs](https://pi.dev/docs/latest) — fully applies to the fork
- Upstream: [earendil-works/pi](https://github.com/earendil-works/pi) — the fork stays in sync with it

## What is Pi

Pi is an agent harness that adapts to your workflows, not the other way around: [extensions](packages/coding-agent/docs/extensions.md), [skills](packages/coding-agent/docs/skills.md), [prompt templates](packages/coding-agent/docs/prompt-templates.md), [themes](packages/coding-agent/docs/themes.md). Bundle them as [packages](packages/coding-agent/docs/packages.md) and share via npm or git.

Use it [interactively](packages/coding-agent/docs/usage.md), in [print/JSON mode](packages/coding-agent/docs/cli.md), over [RPC](packages/coding-agent/docs/rpc.md), or through the [TypeScript SDK](packages/coding-agent/docs/sdk.md).

## Development

```bash
npm install --ignore-scripts  # install deps without lifecycle scripts
npm run build                 # build all packages
npm run check                 # lint, format, type check
./test.sh                     # tests (LLM tests skip without keys)
```

Contributor rules: [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## License

MIT. A fork of [earendil-works/pi](https://github.com/earendil-works/pi).
