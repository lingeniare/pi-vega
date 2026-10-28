<p align="center">
  <b>RU</b> | <a href="README.en.md">EN</a>
</p>
<p align="center">
  <a href="https://vega.codes">
    <img alt="Pi + VEGA" src="cover.webp">
  </a>
</p>
<p align="center">
  <a href="https://t.me/ingeniare"><img alt="Telegram" src="https://img.shields.io/badge/Telegram-@ingeniare-2CA5E0?style=flat-square&logo=telegram&logoColor=white" /></a>
  <a href="https://vega.codes"><img alt="vega.codes" src="https://img.shields.io/badge/vega.codes-%D1%81%D0%B0%D0%B9%D1%82-6E56CF?style=flat-square" /></a>
  <a href="https://api.vega.chat"><img alt="api.vega.chat" src="https://img.shields.io/badge/api.vega.chat-%D0%BF%D1%80%D0%BE%D0%B2%D0%B0%D0%B9%D0%B4%D0%B5%D1%80-0EA5E9?style=flat-square" /></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-22C55E?style=flat-square" /></a>
</p>

# Pi + VEGA

Форк [Pi](https://github.com/earendil-works/pi) — минималистичного расширяемого AI-агента для терминала. Тот же Pi, только проще для разработчиков из России.

## Что добавляет форк

- **Вайбкодинг без VPN в России** — запросы идут через `api.vega.chat`, доступный из РФ напрямую
- **Провайдер VEGA** — OpenRouter-совместимый шлюз: один ключ `sk-apivega-...` открывает весь каталог моделей. Вход через `/login` → «Sign in with VEGA» или переменную `VEGA_API_KEY`
- **Генерация изображений, веб-поиск и чтение ссылок** — для VEGA из коробки включены генерация картинок, `web_search` и `web_fetch`
- **Без аналитики и трекинга** — телеметрия и аналитика выключены по умолчанию
- **Остальной функционал Pi не затронут** — расширения, скиллы, темы, шаблоны и все провайдеры апстрима на месте

## Установка

Нужен Node.js 22.19 или новее. Форк ставится из исходников:

```bash
git clone https://github.com/lingeniare/pi-vega.git
cd pi-vega
npm install --ignore-scripts
npm run build
```

Запуск:

```bash
./pi-test.sh    # Linux / macOS
pi-test.bat     # Windows
```

Чтобы получить глобальную команду `pi`:

```bash
cd packages/coding-agent
npm install -g .
```

Залогиньтесь в VEGA и выберите модель:

```bash
pi
/login   # → Sign in with VEGA → введите код на api.vega.chat/device
/model   # → выберите модель vega/<id>
```

Ключ можно и вставить вручную (`/login` → API key → `sk-apivega-...`) или задать env `VEGA_API_KEY`.

<p>
  <a href="https://pi.dev/docs/latest/settings#network-and-retries"><img alt="Документация Pi" src="https://img.shields.io/badge/Pi-%D0%94%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D0%B0%D1%86%D0%B8%D1%8F-1F2937?style=for-the-badge" /></a>
  <a href="https://vega.codes"><img alt="vega.codes" src="https://img.shields.io/badge/vega.codes-%D0%BE%D1%81%D0%BD%D0%BE%D0%B2%D0%BD%D0%BE%D0%B9_%D0%BF%D1%80%D0%BE%D0%B5%D0%BA%D1%82-6E56CF?style=for-the-badge" /></a>
  <a href="https://api.vega.chat"><img alt="api.vega.chat" src="https://img.shields.io/badge/api.vega.chat-%D0%98%D0%98_%D0%BF%D1%80%D0%BE%D0%B2%D0%B0%D0%B9%D0%B4%D0%B5%D1%80-0EA5E9?style=for-the-badge" /></a>
</p>
<p>
  <a href="https://t.me/ingeniare"><img alt="Telegram" src="https://img.shields.io/badge/Telegram-%D1%87%D0%B0%D1%82-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" /></a>
  <a href="mailto:mail@vega.chat"><img alt="Email" src="https://img.shields.io/badge/Email-mail%40vega.chat-DC2626?style=for-the-badge" /></a>
</p>

## Сообщество

Проект открытый: issues и pull requests приветствуются.

- Telegram: [@ingeniare](https://t.me/ingeniare) — вопросы, баги, идеи
- Email: [mail@vega.chat](mailto:mail@vega.chat)
- Документация Pi: [pi.dev/docs](https://pi.dev/docs/latest) — применима к форку целиком
- Апстрим: [earendil-works/pi](https://github.com/earendil-works/pi) — форк регулярно синхронизируется с ним

## Что такое Pi

Pi — агент-харнесс, который подстраивается под ваши процессы, а не наоборот: [расширения](packages/coding-agent/docs/extensions.md), [скиллы](packages/coding-agent/docs/skills.md), [шаблоны промптов](packages/coding-agent/docs/prompt-templates.md), [темы](packages/coding-agent/docs/themes.md). Всё это можно собирать в [пакеты](packages/coding-agent/docs/packages.md) и раздавать через npm или git.

Использовать можно [интерактивно](packages/coding-agent/docs/usage.md), в [print/JSON-режиме](packages/coding-agent/docs/cli.md), по [RPC](packages/coding-agent/docs/rpc.md) или через [TypeScript SDK](packages/coding-agent/docs/sdk.md).

## Разработка

```bash
npm install --ignore-scripts  # зависимости без lifecycle-скриптов
npm run build                 # собрать все пакеты
npm run check                 # линт, формат, типы
./test.sh                     # тесты (LLM-тесты пропускаются без ключей)
```

Правила для контрибьюторов — в [CONTRIBUTING.md](CONTRIBUTING.md) и [AGENTS.md](AGENTS.md).

## Лицензия

MIT. Форк [earendil-works/pi](https://github.com/earendil-works/pi).
