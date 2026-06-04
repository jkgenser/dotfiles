#!/bin/bash

# Get the ID of the Micro-Star INT'L CO., LTD MSI GM11 Gaming Mouse
MOUSE_ID=$(xinput list | grep "Micro-Star INT'L CO., LTD MSI GM11 Gaming Mouse" | grep -o 'id=[0-9]\+' | grep -o '[0-9]\+' | head -n 1)

# Check if the ID was found
if [ -z "$MOUSE_ID" ]; then
  echo "Micro-Star Gaming Mouse not found."
  exit 1
else
  echo "Micro-Star Gaming Mouse found with ID: $MOUSE_ID"
fi

# Set the property 'libinput Accel Speed' to -0.6 for the detected ID
xinput set-prop $MOUSE_ID "libinput Accel Speed" -0.6

# Confirm the setting was applied
echo "Set 'libinput Accel Speed' to -0.6 for device ID: $MOUSE_ID"
xinput set-prop $MOUSE_ID "libinput Natural Scrolling Enabled" 1
xinput set-prop $MOUSE_ID "libinput Scroll Method Enabled" 0 0 1
