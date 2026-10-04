#!/usr/bin/env node
import { run } from "./run.ts";

process.exitCode = run(process.argv.slice(2));
