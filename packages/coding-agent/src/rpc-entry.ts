#!/usr/bin/env node
import { APP_NAME, ENV_CODING_AGENT } from "./config.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";

process.title = `${APP_NAME}-rpc`;
process.env[ENV_CODING_AGENT] = "true";
process.env.AI_AGENT = APP_NAME;
process.emitWarning = (() => {}) as typeof process.emitWarning;

configureHttpDispatcher();

main(["--mode", "rpc", ...process.argv.slice(2)]);
