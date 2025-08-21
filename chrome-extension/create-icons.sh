#!/bin/bash
# Script to create simple placeholder icons for the Chrome extension

echo "Creating placeholder icons for Chrome extension..."

# Create icons directory if it doesn't exist
mkdir -p icons

# Function to create a simple SVG icon
create_svg_icon() {
    local size=$1
    local filename=$2
    
    cat > "$filename" << EOF
<svg width="$size" height="$size" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4CAF50;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#2196F3;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="$size" height="$size" fill="url(#grad)" rx="$(($size/8))" />
  <path d="M $(($size/4)) $(($size*3/4)) L $(($size/2)) $(($size/2)) L $(($size*3/4)) $(($size*3/4))" 
        stroke="white" stroke-width="$(($size/16))" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="$(($size/4))" cy="$(($size*3/4))" r="$(($size/32))" fill="white"/>
  <circle cx="$(($size/2))" cy="$(($size/2))" r="$(($size/32))" fill="white"/>
  <circle cx="$(($size*3/4))" cy="$(($size*3/4))" r="$(($size/32))" fill="white"/>
  <text x="$(($size/2))" y="$(($size/6))" text-anchor="middle" fill="white" 
        font-family="Arial, sans-serif" font-size="$(($size/8))" font-weight="bold">LS</text>
</svg>
EOF
}

# Create SVG icons
create_svg_icon 16 "icons/icon-16.svg"
create_svg_icon 32 "icons/icon-32.svg"
create_svg_icon 48 "icons/icon-48.svg"
create_svg_icon 128 "icons/icon-128.svg"

echo "SVG icons created. To convert to PNG:"
echo "You can use an online converter or ImageMagick:"
echo "  convert icons/icon-16.svg icons/icon-16.png"
echo "  convert icons/icon-32.svg icons/icon-32.png"
echo "  convert icons/icon-48.svg icons/icon-48.png"
echo "  convert icons/icon-128.svg icons/icon-128.png"
echo ""
echo "Or use this one-liner if you have ImageMagick installed:"
echo "  cd icons && for i in *.svg; do convert \"\$i\" \"\${i%.svg}.png\"; done"
