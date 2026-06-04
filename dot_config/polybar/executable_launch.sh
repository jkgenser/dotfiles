#!/bin/bash

polybar-msg cmd quit
polybar 2>&1 | tee -a /tmp/polybar1.log &
disown
