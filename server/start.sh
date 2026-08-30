#!/bin/sh
Xvfb :99 -screen 0 1280x800x24 &
sleep 2
exec npm start
