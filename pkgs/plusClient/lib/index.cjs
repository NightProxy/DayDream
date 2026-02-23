"use strict";

const { resolve } = require("node:path");

const plusPath = resolve(__dirname, "..", "dist");

exports.plusPath = plusPath;
