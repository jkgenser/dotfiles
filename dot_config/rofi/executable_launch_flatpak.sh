#!/bin/bash

# List installed Flatpak applications and show them in Rofi
apps=$(flatpak list --app --columns=application,name | awk '{print $2 ":" $1}')

# Display the list of apps and capture the selected app
selected_app=$(echo "$apps" | rofi -dmenu -p -i "Launch Flatpak App:" | cut -d ":" -f 2)

# If an app is selected, launch it
if [ -n "$selected_app" ]; then
    flatpak run "$selected_app"
fi
