from pathlib import Path
import numpy as np
from PIL import Image

SOURCE = Path("assets/Logo aquatique moderne WatFlow.png")
OUTPUT = Path("public/watflow-logo.png")
image = Image.open(SOURCE).convert("RGBA")
rgba = np.asarray(image).copy()
height, width = rgba.shape[:2]

# Recolor only the neutral Wat lettering. Saturated logo artwork and Flow stay intact.
rgb = rgba[:, :, :3].astype(np.int32)
saturation = rgb.max(axis=2) - rgb.min(axis=2)
luminance = (299 * rgb[:, :, 0] + 587 * rgb[:, :, 1] + 114 * rgb[:, :, 2]) // 1000
x = np.arange(width)[None, :]
wat_band = (x >= round(width * 0.34)) & (x < round(width * 0.64))
wat_letters = wat_band & (saturation < 105) & (luminance > 35) & (rgba[:, :, 3] > 0)
rgba[wat_letters, :3] = (0, 0, 0)

result = Image.fromarray(rgba, "RGBA")
bounds = result.getchannel("A").getbbox()
if bounds is None:
    raise RuntimeError("No visible logo artwork found")
result = result.crop(bounds)
padding = 8
canvas = Image.new("RGBA", (result.width + padding * 2, result.height + padding * 2), (0, 0, 0, 0))
canvas.alpha_composite(result, (padding, padding))
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
canvas.save(OUTPUT, optimize=True)
print(f"Exported {OUTPUT}: {canvas.width}x{canvas.height} from {SOURCE}")

