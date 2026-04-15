#!/bin/bash
# 600 -- local static server for first-time install on phone.
#
# Usage:
#   ./serve.sh
#
# Then on your iPhone (same Wi-Fi):
#   open the printed URL in Safari -> tap Share -> Add to Home Screen.
# After that, the app is installed and runs offline. You can stop the server.

set -e
cd "$(dirname "$0")/public"

PORT=3002
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

echo ""
echo "+========================================================+"
echo "|                         600                            |"
echo "|                                                        |"
printf "|   Mac:    http://localhost:%-28s|\n" "$PORT"
printf "|   Phone:  http://%-38s|\n" "$IP:$PORT"
echo "|                                                        |"
echo "|   Open the Phone URL in Safari -> Share -> Add to      |"
echo "|   Home Screen. The app then runs offline.              |"
echo "+========================================================+"
echo ""

exec python3 -m http.server "$PORT"
