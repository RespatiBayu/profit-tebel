from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
APP_DIR = ROOT / "src" / "app"

OG_SIZE = (1200, 630)
ICON_SIZE = 512
APPLE_SIZE = 180

NAVY = (11, 18, 32, 255)
NAVY_SOFT = (15, 23, 42, 255)
SLATE = (30, 41, 59, 255)
BLUE = (37, 99, 235, 255)
BLUE_SOFT = (96, 165, 250, 255)
CYAN = (34, 211, 238, 255)
ORANGE = (249, 115, 22, 255)
ORANGE_SOFT = (251, 146, 60, 255)
GREEN = (16, 185, 129, 255)
GREEN_SOFT = (110, 231, 183, 255)
RED = (248, 113, 113, 255)
WHITE = (255, 255, 255, 255)
WHITE_SOFT = (226, 232, 240, 255)
INK = (148, 163, 184, 255)

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"


def ensure_dirs() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    APP_DIR.mkdir(parents=True, exist_ok=True)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [FONT_BOLD] if bold else [FONT_REGULAR, FONT_BOLD]

    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)

    return ImageFont.load_default()


def lerp_color(start: tuple[int, int, int, int], end: tuple[int, int, int, int], ratio: float) -> tuple[int, int, int, int]:
    return tuple(int(start[i] + (end[i] - start[i]) * ratio) for i in range(4))


def make_horizontal_gradient(size: tuple[int, int], start: tuple[int, int, int, int], end: tuple[int, int, int, int]) -> Image.Image:
    width, height = size
    gradient = Image.new("RGBA", size, start)
    draw = ImageDraw.Draw(gradient)

    for x in range(width):
        ratio = x / max(1, width - 1)
        draw.line((x, 0, x, height), fill=lerp_color(start, end, ratio))

    return gradient


def make_vertical_gradient(size: tuple[int, int], start: tuple[int, int, int, int], end: tuple[int, int, int, int]) -> Image.Image:
    width, height = size
    gradient = Image.new("RGBA", size, start)
    draw = ImageDraw.Draw(gradient)

    for y in range(height):
        ratio = y / max(1, height - 1)
        draw.line((0, y, width, y), fill=lerp_color(start, end, ratio))

    return gradient


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def add_glow(image: Image.Image, center: tuple[int, int], radius: int, color: tuple[int, int, int, int], blur: int) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cx, cy = center
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color)
    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def draw_brand_mark(size: int) -> Image.Image:
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gradient = make_horizontal_gradient((size, size), BLUE, ORANGE)
    mask = rounded_mask((size, size), max(18, size // 4))
    icon.paste(gradient, (0, 0), mask)

    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)

    for fraction, height_start in ((0.22, 0.58), (0.43, 0.44), (0.64, 0.28)):
        bar_width = size * 0.11
        left = size * fraction
        right = left + bar_width
        top = size * height_start
        bottom = size * 0.82
        overlay_draw.rounded_rectangle(
            (left, top, right, bottom),
            radius=max(6, int(size * 0.04)),
            fill=(255, 255, 255, 54),
        )

    points = [
        (size * 0.2, size * 0.66),
        (size * 0.38, size * 0.5),
        (size * 0.55, size * 0.57),
        (size * 0.8, size * 0.3),
    ]
    stroke = max(6, int(size * 0.075))
    overlay_draw.line(points, fill=(255, 255, 255, 255), width=stroke, joint="curve")

    dot_center = points[-1]
    dot_radius = max(10, int(size * 0.09))
    overlay_draw.ellipse(
        (
            dot_center[0] - dot_radius,
            dot_center[1] - dot_radius,
            dot_center[0] + dot_radius,
            dot_center[1] + dot_radius,
        ),
        fill=(255, 255, 255, 255),
        outline=ORANGE,
        width=max(3, int(size * 0.016)),
    )

    overlay_draw.rounded_rectangle(
        (1, 1, size - 2, size - 2),
        radius=max(18, size // 4),
        outline=(255, 255, 255, 38),
        width=max(2, int(size * 0.012)),
    )

    icon.alpha_composite(overlay)
    return icon


def icon_svg() -> str:
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
  <defs>
    <linearGradient id="bg" x1="18" y1="32" x2="232" y2="224" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2563EB"/>
      <stop offset="1" stop-color="#F97316"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="60" fill="url(#bg)"/>
  <rect x="56" y="148" width="28" height="64" rx="10" fill="white" fill-opacity=".22"/>
  <rect x="108" y="114" width="28" height="98" rx="10" fill="white" fill-opacity=".22"/>
  <rect x="160" y="74" width="28" height="138" rx="10" fill="white" fill-opacity=".22"/>
  <path d="M52 170L98 126L141 145L204 78" stroke="white" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="204" cy="78" r="22" fill="white" stroke="#F97316" stroke-width="5"/>
  <rect x="8.5" y="8.5" width="239" height="239" rx="59.5" stroke="white" stroke-opacity=".15"/>
</svg>
"""


def draw_chip(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], label: str) -> None:
    draw.rounded_rectangle(box, radius=box[3] - box[1], fill=(15, 23, 42, 180), outline=(148, 163, 184, 70), width=2)
    chip_font = font(24, bold=True)
    text_box = draw.textbbox((0, 0), label, font=chip_font)
    text_width = text_box[2] - text_box[0]
    text_height = text_box[3] - text_box[1]
    x = box[0] + ((box[2] - box[0]) - text_width) / 2
    y = box[1] + ((box[3] - box[1]) - text_height) / 2 - 2
    draw.text((x, y), label, font=chip_font, fill=WHITE_SOFT)


def build_og_image() -> Image.Image:
    canvas = make_vertical_gradient(OG_SIZE, NAVY, NAVY_SOFT)

    add_glow(canvas, (260, 110), 180, (37, 99, 235, 92), 72)
    add_glow(canvas, (950, 170), 160, (249, 115, 22, 110), 82)
    add_glow(canvas, (870, 500), 220, (56, 189, 248, 42), 96)

    grid = Image.new("RGBA", OG_SIZE, (0, 0, 0, 0))
    grid_draw = ImageDraw.Draw(grid)
    for x in range(0, OG_SIZE[0], 60):
        grid_draw.line((x, 0, x, OG_SIZE[1]), fill=(148, 163, 184, 18), width=1)
    for y in range(0, OG_SIZE[1], 60):
        grid_draw.line((0, y, OG_SIZE[0], y), fill=(148, 163, 184, 18), width=1)
    canvas.alpha_composite(grid)

    draw = ImageDraw.Draw(canvas)

    mark = draw_brand_mark(84)
    canvas.alpha_composite(mark, (78, 58))

    kicker_font = font(28, bold=True)
    draw.text((180, 72), "Profit Tebel", font=kicker_font, fill=WHITE)
    subkicker_font = font(18)
    draw.text((182, 108), "Marketplace Profit Intelligence", font=subkicker_font, fill=(191, 219, 254, 255))

    title_font = font(68, bold=True)
    draw.text((80, 188), "Tau Profit Beneran,", font=title_font, fill=WHITE)
    draw.text((80, 268), "Bukan Cuma Omzet", font=title_font, fill=ORANGE_SOFT)

    body = (
        "Upload laporan Shopee atau TikTok Shop,\n"
        "lalu lihat profit bersih, biaya marketplace,\n"
        "dan ROAS dalam satu dashboard yang gampang dibaca."
    )
    body_font = font(26)
    draw.multiline_text((80, 366), body, font=body_font, fill=(203, 213, 225, 255), spacing=10)

    chip_y = 512
    draw_chip(draw, (80, chip_y, 228, chip_y + 52), "Shopee")
    draw_chip(draw, (246, chip_y, 444, chip_y + 52), "TikTok Shop")
    draw_chip(draw, (462, chip_y, 606, chip_y + 52), "ROAS Real")

    panel = Image.new("RGBA", (420, 476), (0, 0, 0, 0))
    panel_draw = ImageDraw.Draw(panel)
    panel_draw.rounded_rectangle((0, 0, 420, 476), radius=34, fill=(15, 23, 42, 235), outline=(148, 163, 184, 70), width=2)
    panel_draw.rounded_rectangle((0, 0, 420, 92), radius=34, fill=(255, 255, 255, 18))
    panel_draw.text((28, 26), "Dashboard Snapshot", font=font(24, bold=True), fill=WHITE)
    panel_draw.text((28, 56), "Profit, fee, dan iklan dalam satu layar", font=font(16), fill=(191, 219, 254, 255))

    for box, title, value, tint in (
        ((24, 116, 188, 206), "Profit Bersih", "+28.4%", GREEN_SOFT),
        ((206, 116, 396, 206), "Produk Rugi", "3 alert", ORANGE_SOFT),
    ):
        panel_draw.rounded_rectangle(box, radius=22, fill=(255, 255, 255, 16), outline=(148, 163, 184, 45), width=2)
        panel_draw.text((box[0] + 18, box[1] + 18), title, font=font(18, bold=True), fill=WHITE_SOFT)
        panel_draw.text((box[0] + 18, box[1] + 56), value, font=font(28, bold=True), fill=tint)

    chart_box = (24, 228, 396, 354)
    panel_draw.rounded_rectangle(chart_box, radius=26, fill=(2, 6, 23, 160), outline=(96, 165, 250, 44), width=2)
    panel_draw.text((42, 246), "Trend Profit Mingguan", font=font(18, bold=True), fill=WHITE_SOFT)

    chart_points = [
        (56, 328),
        (110, 304),
        (160, 312),
        (212, 270),
        (266, 286),
        (324, 230),
        (366, 248),
    ]
    for point in chart_points:
        panel_draw.ellipse((point[0] - 5, point[1] - 5, point[0] + 5, point[1] + 5), fill=WHITE)
    panel_draw.line(chart_points, fill=BLUE_SOFT, width=8, joint="curve")

    baseline_y = 338
    for offset in range(0, 7):
        x = 56 + (offset * 52)
        panel_draw.line((x, 260, x, baseline_y), fill=(148, 163, 184, 24), width=1)
    panel_draw.line((42, baseline_y, 380, baseline_y), fill=(148, 163, 184, 34), width=2)

    bottom_left = (24, 376, 196, 432)
    bottom_right = (224, 376, 396, 432)
    panel_draw.rounded_rectangle(bottom_left, radius=18, fill=(255, 255, 255, 16), outline=(148, 163, 184, 40), width=2)
    panel_draw.rounded_rectangle(bottom_right, radius=18, fill=(255, 255, 255, 16), outline=(148, 163, 184, 40), width=2)
    panel_draw.text((42, 394), "ROAS Sehat", font=font(16, bold=True), fill=WHITE_SOFT)
    panel_draw.text((42, 420), "4.2x rata-rata", font=font(24, bold=True), fill=WHITE)
    panel_draw.text((240, 394), "Fee Tracker", font=font(16, bold=True), fill=WHITE_SOFT)
    panel_draw.text((240, 420), "Admin 8.6%", font=font(24, bold=True), fill=WHITE)
    panel_draw.line((240, 448, 356, 448), fill=ORANGE_SOFT, width=10)
    panel_draw.line((240, 466, 328, 466), fill=BLUE_SOFT, width=10)

    add_glow(panel, (330, 120), 80, (249, 115, 22, 70), 40)
    add_glow(panel, (110, 310), 90, (37, 99, 235, 54), 44)

    canvas.alpha_composite(panel, (738, 78))
    return canvas


def save_assets() -> None:
    ensure_dirs()

    brand_mark = draw_brand_mark(ICON_SIZE)
    brand_mark.save(APP_DIR / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    brand_mark.resize((APPLE_SIZE, APPLE_SIZE), Image.LANCZOS).save(PUBLIC_DIR / "apple-touch-icon.png", format="PNG")
    brand_mark.resize((192, 192), Image.LANCZOS).save(PUBLIC_DIR / "icon-192.png", format="PNG")
    brand_mark.resize((512, 512), Image.LANCZOS).save(PUBLIC_DIR / "icon-512.png", format="PNG")

    (PUBLIC_DIR / "favicon.svg").write_text(icon_svg(), encoding="utf-8")
    build_og_image().save(PUBLIC_DIR / "og-image.png", format="PNG", optimize=True)


if __name__ == "__main__":
    save_assets()
