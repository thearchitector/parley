#!/bin/bash

set -e

SRC_PREFIX="public"

svgo -rf ${SRC}/vendor/icons --precision 0
terser ${SRC}/vendor/randomNames.js -o ${SRC}/vendor/randomNames.js
terser --config-file terser.config.json ${SRC}/application.js -o ${SRC}/application.js
postcss ${SRC}/style.css -o ${SRC}/style.css
