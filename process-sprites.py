import os
import sys
from PIL import Image

input_dir = 'public/assets/sprites'
output_dir = 'public/assets/sprites'
threshold = 230

# Allow filenames to keep their existing suffix; we just need PNG output
files = [f for f in os.listdir(input_dir) if f.endswith('.jpg') or f.endswith('.jpeg')]

# Don't keep raw wood-raw.jpg — rename to wood
for f in files:
    if f == 'wood-raw.jpg':
        old = os.path.join(input_dir, f)
        new = os.path.join(input_dir, 'wood_001.jpg')
        if not os.path.exists(new):
            os.rename(old, new)
        else:
            os.remove(old)

# Refresh list
files = [f for f in os.listdir(input_dir) if f.endswith('.jpg') or f.endswith('.jpeg')]

# Try numpy for speed
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

def make_white_transparent(img: Image.Image, threshold: int) -> Image.Image:
    if HAS_NUMPY:
        arr = np.array(img)
        r, g, b, a = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]
        mask = (r > threshold) & (g > threshold) & (b > threshold)
        arr[:,:,3] = np.where(mask, 0, a)
        return Image.fromarray(arr, mode='RGBA')
    else:
        img = img.convert('RGBA')
        pixels = img.load()
        w, h = img.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = pixels[x, y]
                if r > threshold and g > threshold and b > threshold:
                    pixels[x, y] = (255, 255, 255, 0)
        return img

count = 0
for filename in sorted(files):
    input_path = os.path.join(input_dir, filename)
    base = filename.rsplit('.', 1)[0]
    output_filename = f'{base}.png'
    output_path = os.path.join(output_dir, output_filename)

    img = Image.open(input_path).convert('RGBA')
    img = make_white_transparent(img, threshold)
    img.save(output_path, 'PNG', optimize=True)
    print(f'  {filename} -> {output_filename}')
    count += 1

print(f'\nProcessed {count} images (numpy: {HAS_NUMPY})')
