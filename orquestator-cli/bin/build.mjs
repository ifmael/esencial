#!/usr/bin/env node
import { manualBuild } from "../lib/build.mjs";

try {
  process.exitCode = await manualBuild(process.argv.slice(2), {
    out: (text) => console.log(text),
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
