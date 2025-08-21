#!/usr/bin/env python3
"""
Create simple PNG icons for the Chrome extension using PIL
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    import os
    
    def create_icon(size, filename):
        # Create image with transparent background
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # Draw background with gradient effect (simplified)
        # Main circle background
        margin = size // 8
        draw.ellipse([margin, margin, size-margin, size-margin], 
                    fill=(76, 175, 80, 255), outline=(33, 150, 243, 200), width=2)
        
        # Draw simple chart-like lines
        center_x, center_y = size // 2, size // 2
        points = [
            (size//4, size*3//4),
            (size//2, size//2), 
            (size*3//4, size//4)
        ]
        
        # Draw connecting lines
        for i in range(len(points)-1):
            draw.line([points[i], points[i+1]], fill=(255, 255, 255, 255), width=max(1, size//16))
        
        # Draw points
        for point in points:
            r = max(1, size//32)
            draw.ellipse([point[0]-r, point[1]-r, point[0]+r, point[1]+r], 
                        fill=(255, 255, 255, 255))
        
        # Try to draw text "LS"
        try:
            # Try to use default font
            font_size = max(8, size//6)
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
            except:
                try:
                    font = ImageFont.truetype("arial.ttf", font_size)
                except:
                    font = ImageFont.load_default()
            
            # Get text size for centering
            bbox = draw.textbbox((0, 0), "LS", font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            x = (size - text_width) // 2
            y = size // 8
            
            draw.text((x, y), "LS", fill=(255, 255, 255, 255), font=font)
        except Exception as e:
            print(f"Could not add text to {size}x{size} icon: {e}")
        
        # Save as PNG
        img.save(filename, 'PNG')
        print(f"Created {filename} ({size}x{size})")
    
    # Create icons directory
    os.makedirs('icons', exist_ok=True)
    
    # Create all icon sizes
    sizes = [16, 32, 48, 128]
    for size in sizes:
        create_icon(size, f'icons/icon-{size}.png')
    
    print("All PNG icons created successfully!")
    
except ImportError:
    print("PIL (Pillow) not available. Creating minimal PNG files...")
    
    # Minimal PNG data for a simple icon (16x16 blue square)
    # This is a base64-encoded 16x16 blue PNG
    minimal_png_16 = bytes.fromhex(
        '89504e470d0a1a0a0000000d49484452000000100000001008060000001ff3ff61'
        '0000001849444154189c6364a031600c05a360041ac0c20102000b50049c7aaa23'
        '730000000049454e44ae426082'
    )
    
    # For other sizes, we'll just use a scaled version (simple but functional)
    os.makedirs('icons', exist_ok=True)
    
    # Write minimal icons - these will just be simple colored squares
    for size in [16, 32, 48, 128]:
        with open(f'icons/icon-{size}.png', 'wb') as f:
            f.write(minimal_png_16)  # Same data for all sizes (browser will scale)
        print(f"Created minimal icon-{size}.png")
    
    print("Minimal PNG icons created (install Pillow for better icons: pip install Pillow)")
