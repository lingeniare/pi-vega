# Запуск pion

Короткая инструкция: как установить и запустить pion, и как запустить его из исходников для разработки.

## Для пользователей

### Требования

- Node.js 22.19 или новее (для установки через npm). Managed-установщик ставит Node сам.
- Терминал: Windows (PowerShell), macOS или Linux.

### Установка

Вариант 1 — инсталлер (рекомендуется, даёт команду `pion update`):

```bash
# Linux / macOS
curl -fsSL https://github.com/lingeniare/pi-vega/releases/latest/download/install.sh | sh
```

```powershell
# Windows (PowerShell)
powershell -c "irm https://github.com/lingeniare/pi-vega/releases/latest/download/install.ps1 | iex"
```

Вариант 2 — через пакетный менеджер по tarball-ссылке (нужен Node.js 22.19+):

```bash
npm install -g --ignore-scripts https://github.com/lingeniare/pi-vega/releases/latest/download/pi-coding-agent-latest.tgz
# или: pnpm add -g <тот же URL>
# или: bun add -g <тот же URL>
```

Все файлы установки лежат в [GitHub Releases](https://github.com/lingeniare/pi-vega/releases).

### Запуск

```bash
pion
```

При первом запуске нужно войти и выбрать модель — команды вводятся прямо в интерфейсе pion:

```
/login   → Sign in with VEGA → откроется api.vega.chat/device, введите код
/model   → выберите модель vega/<id>
```

Ключ можно и вставить вручную (`/login` → API key → `sk-apivega-...`) или задать переменную окружения `VEGA_API_KEY`.

### Обновление

```bash
pion update        # при managed-установке
```

При установке через npm/pnpm/bun — повторите команду установки.

---

## Для разработки

### Подготовка

```bash
git clone https://github.com/lingeniare/pi-vega.git
cd pi-vega
npm install --ignore-scripts   # зависимости без lifecycle-скриптов
npm run build                  # собрать все пакеты в dist/
```

`npm run build` нужен: часть тестов и запуск из `dist/` используют собранные пакеты.

### Запуск из исходников (без сборки)

Скрипты запускают `packages/coding-agent/src/cli.ts` напрямую через Node:

```bash
./pion-test.sh        # Linux / macOS / Git Bash
```

```powershell
pion-test.bat         # Windows (cmd)
# или
powershell -NoProfile -ExecutionPolicy Bypass -File pion-test.ps1
```

Флаг `--no-env` запускает pion с очищенными API-ключами окружения (полезно для проверки логина с нуля):

```bash
./pion-test.sh --no-env
```

Все остальные аргументы пробрасываются в CLI как есть, например `./pion-test.sh --help`.

### Проверки перед коммитом

```bash
npm run check        # линт, форматирование, типы — должно пройти без ошибок
./test.sh            # тесты в изолированном окружении (нужен bash; LLM-тесты без ключей пропускаются)
```

Запуск одного тестового файла (vitest) из корня нужного пакета:

```bash
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/specific.test.ts
```

### После мержа upstream

```bash
cd packages/ai
npm run hydrate-model-data   # подтянуть gitignored-данные моделей, нужен интернет
```

### Полезное

- Правила для контрибьюторов: [CONTRIBUTING.md](CONTRIBUTING.md) и [AGENTS.md](AGENTS.md).
- Документация CLI и расширений: [packages/coding-agent/docs](packages/coding-agent/docs).
- Устройство VEGA-интеграции: [vega.md](vega.md).
