#!/bin/bash

set -e

svgo -rf public/vendor/icons --precision 0
terser public/vendor/randomNames.js -o vendor/randomNames.js
terser --config-file terser.config.json public/application.js -o public/application.js
postcss public/style.css -o public/style.css
