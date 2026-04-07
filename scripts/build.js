#!/usr/bin/env node

"use strict";

const { existsSync, rmSync } = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const distDirectory = path.join(projectRoot, "dist");
const tscBinary = path.join(projectRoot, "node_modules", "typescript", "bin", "tsc");

if (existsSync(distDirectory)) {
  rmSync(distDirectory, { recursive: true, force: true });
}

const result = spawnSync(process.execPath, [tscBinary], {
  cwd: projectRoot,
  stdio: "inherit",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
