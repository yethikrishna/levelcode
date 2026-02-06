"""Generate multi-agents.png for LevelCode README."""

from PIL import Image, ImageDraw, ImageFont
import math
import os

WIDTH, HEIGHT = 800, 800
BG_COLOR = (15, 15, 30)
CENTER = (WIDTH // 2, HEIGHT // 2)
ORBIT_RADIUS = 250

# Agent definitions matching the original: (name, color_rgb)
AGENTS = [
    ("researcher", (0, 220, 255)),
    ("thinker", (255, 230, 0)),
    ("reviewer", (0, 230, 100)),
    ("planner", (255, 160, 0)),
    ("file-picker", (170, 80, 255)),
    ("editor", (255, 80, 120)),
]


def load_font(size, bold=False):
    candidates = (
        ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"]
        if bold
        else ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"]
    )
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def draw_soft_glow(draw, cx, cy, radius, color, intensity=20, layers=5):
    """Draw a subtle soft glow behind a node."""
    for i in range(layers, 0, -1):
        r = radius + i * 4
        alpha = int(intensity * (1 - i / (layers + 1)))
        c = (color[0] // 4, color[1] // 4, color[2] // 4)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)


def draw_robot(draw, cx, cy, size, color):
    """Draw a cute minimalist robot character matching the original style."""
    # Head - rounded rectangle with thick border
    pad = 4
    x1, y1 = cx - size, cy - size
    x2, y2 = cx + size, cy + size
    # Fill (dark tinted)
    fill = (color[0] // 8, color[1] // 8, color[2] // 8)
    draw.rounded_rectangle([x1, y1, x2, y2], radius=14, fill=fill, outline=color, width=5)

    # Sparkle eye (4-point star) - left
    eye_y = cy - size // 4
    eo = size // 3  # eye offset
    es = size // 5  # eye sparkle size
    for offset in [-eo, eo]:
        ex = cx + offset
        draw.polygon(
            [(ex, eye_y - es), (ex + es * 0.6, eye_y), (ex, eye_y + es), (ex - es * 0.6, eye_y)],
            fill=color,
        )

    # Mouth - simple horizontal bar
    my = cy + size // 3
    mw = size // 3
    draw.rounded_rectangle(
        [cx - mw, my - 3, cx + mw, my + 3], radius=2, fill=color
    )

    # Antenna
    at = y1 - 16
    draw.line([(cx, y1), (cx, at)], fill=color, width=3)
    draw.ellipse([cx - 4, at - 4, cx + 4, at + 4], fill=color)

    # Arms - short angled lines
    arm_y = cy + 2
    al = 18
    draw.line([(x1 - 2, arm_y), (x1 - al, arm_y - 12)], fill=color, width=4)
    draw.line([(x2 + 2, arm_y), (x2 + al, arm_y - 12)], fill=color, width=4)
    # Hands (small circles)
    draw.ellipse([x1 - al - 5, arm_y - 17, x1 - al + 5, arm_y - 7], fill=color)
    draw.ellipse([x2 + al - 5, arm_y - 17, x2 + al + 5, arm_y - 7], fill=color)

    # Legs
    ly = y2 + 2
    ll = 20
    sp = size // 3
    draw.line([(cx - sp, ly), (cx - sp - 3, ly + ll)], fill=color, width=4)
    draw.line([(cx + sp, ly), (cx + sp + 3, ly + ll)], fill=color, width=4)
    # Feet
    draw.rounded_rectangle(
        [cx - sp - 12, ly + ll - 2, cx - sp + 5, ly + ll + 8], radius=3, fill=color
    )
    draw.rounded_rectangle(
        [cx + sp - 5, ly + ll - 2, cx + sp + 12, ly + ll + 8], radius=3, fill=color
    )


def draw_dotted_line(draw, x1, y1, x2, y2, color, gap=8):
    """Draw a dotted connection line."""
    dist = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    dots = int(dist / gap)
    for i in range(dots):
        t = i / dots
        # Fade: stronger near center, lighter near edges
        if t < 0.25 or t > 0.75:
            continue
        x = x1 + (x2 - x1) * t
        y = y1 + (y2 - y1) * t
        r = 2
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def main():
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    label_font = load_font(22, bold=True)
    center_font = load_font(24, bold=True)

    # Calculate positions
    positions = []
    for i in range(len(AGENTS)):
        angle = (2 * math.pi * i / len(AGENTS)) - math.pi / 2
        ax = CENTER[0] + int(ORBIT_RADIUS * math.cos(angle))
        ay = CENTER[1] + int(ORBIT_RADIUS * math.sin(angle))
        positions.append((ax, ay))

    # Draw subtle orbit ring (dashed)
    segs = 180
    for i in range(segs):
        if i % 5 < 2:
            continue
        a1 = 2 * math.pi * i / segs
        a2 = 2 * math.pi * (i + 1) / segs
        sx = CENTER[0] + int(ORBIT_RADIUS * math.cos(a1))
        sy = CENTER[1] + int(ORBIT_RADIUS * math.sin(a1))
        ex = CENTER[0] + int(ORBIT_RADIUS * math.cos(a2))
        ey = CENTER[1] + int(ORBIT_RADIUS * math.sin(a2))
        draw.line([(sx, sy), (ex, ey)], fill=(35, 35, 55), width=1)

    # Draw connection lines from center to each agent
    for i, (ax, ay) in enumerate(positions):
        color = AGENTS[i][1]
        faded = (color[0] // 3, color[1] // 3, color[2] // 3)
        draw_dotted_line(draw, CENTER[0], CENTER[1], ax, ay, faded)

    # Draw center: LevelCode orchestrator
    center_color = (220, 220, 240)
    draw_soft_glow(draw, CENTER[0], CENTER[1], 52, center_color, intensity=15)
    draw_robot(draw, CENTER[0], CENTER[1], 50, center_color)

    # Center label below
    txt = "LevelCode"
    bbox = draw.textbbox((0, 0), txt, font=center_font)
    tw = bbox[2] - bbox[0]
    lx = CENTER[0] - tw // 2
    ly = CENTER[1] + 82
    # Colored dot
    draw.ellipse([lx - 14, ly + 5, lx - 6, ly + 13], fill=center_color)
    draw.text((lx, ly), txt, fill=center_color, font=center_font)

    # Draw each agent
    for i, (name, color) in enumerate(AGENTS):
        ax, ay = positions[i]
        draw_soft_glow(draw, ax, ay, 38, color, intensity=12)
        draw_robot(draw, ax, ay, 36, color)

        # Label positioning - push outward from center
        angle = math.atan2(ay - CENTER[1], ax - CENTER[0])
        bbox = draw.textbbox((0, 0), name, font=label_font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]

        # Place label further out along the angle
        label_dist = 68
        lx = ax + int(label_dist * math.cos(angle)) - tw // 2
        ly = ay + int(label_dist * math.sin(angle)) - th // 2

        # Dot + text
        draw.ellipse([lx - 14, ly + th // 2 - 4, lx - 6, ly + th // 2 + 4], fill=color)
        draw.text((lx, ly), name, fill=color, font=label_font)

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "multi-agents.png")
    img.save(out, "PNG")
    print(f"Saved: {out}")


if __name__ == "__main__":
    main()
