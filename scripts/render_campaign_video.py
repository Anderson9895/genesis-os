#!/usr/bin/env python3
"""Render an original faceless campaign MP4 from a JSON slide specification.

The renderer creates 1080x1920 caption cards, an original plucked-string
instrumental, and a TikTok-ready H.264/AAC file. It does not upload or post.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


WIDTH = 1080
HEIGHT = 1920
FPS = 30
SAMPLE_RATE = 44_100


def font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def wrap_text(draw: ImageDraw.ImageDraw, value: str, text_font: ImageFont.ImageFont, max_width: int) -> str:
    lines: list[str] = []
    for paragraph in value.splitlines():
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            candidate = f"{current} {word}"
            if draw.textbbox((0, 0), candidate, font=text_font, stroke_width=2)[2] <= max_width:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return "\n".join(lines)


def make_slide(image_path: Path, text: str, output: Path, accent: str | None = None) -> None:
    with Image.open(image_path) as source:
        canvas = ImageOps.fit(source.convert("RGB"), (WIDTH, HEIGHT), method=Image.Resampling.LANCZOS)

    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for row in range(HEIGHT):
        alpha = int(185 * max(0, (row - 780) / (HEIGHT - 780)))
        overlay_draw.line((0, row, WIDTH, row), fill=(12, 10, 9, alpha))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay)

    draw = ImageDraw.Draw(canvas)
    headline_font = font(76)
    accent_font = font(38)
    wrapped = wrap_text(draw, text, headline_font, WIDTH - 150)
    box = draw.multiline_textbbox((0, 0), wrapped, font=headline_font, spacing=18, align="center", stroke_width=3)
    text_height = box[3] - box[1]
    y = HEIGHT - text_height - 250
    draw.rounded_rectangle((52, y - 45, WIDTH - 52, HEIGHT - 120), radius=34, fill=(0, 0, 0, 150))
    draw.multiline_text(
        (WIDTH // 2, y),
        wrapped,
        font=headline_font,
        fill="white",
        anchor="ma",
        align="center",
        spacing=18,
        stroke_width=4,
        stroke_fill=(0, 0, 0, 220),
    )
    if accent:
        draw.text(
            (WIDTH // 2, HEIGHT - 155),
            accent,
            font=accent_font,
            fill=(238, 191, 105),
            anchor="ms",
            stroke_width=2,
            stroke_fill=(0, 0, 0, 210),
        )
    canvas.convert("RGB").save(output, quality=96)


def pluck(frequency: float, seconds: float, rng: np.random.Generator) -> np.ndarray:
    length = int(SAMPLE_RATE * seconds)
    period = max(2, int(SAMPLE_RATE / frequency))
    ring = rng.uniform(-1.0, 1.0, period)
    result = np.zeros(length, dtype=np.float64)
    for index in range(length):
        result[index] = ring[index % period]
        next_index = (index + 1) % period
        ring[index % period] = 0.5 * (ring[index % period] + ring[next_index]) * 0.994
    envelope = np.exp(-np.linspace(0, 5.4, length))
    return result * envelope


def make_music(duration: float, output: Path) -> None:
    rng = np.random.default_rng(6000)
    total = int(duration * SAMPLE_RATE)
    mono = np.zeros(total, dtype=np.float64)
    notes = [130.81, 196.00, 164.81, 220.00, 146.83, 196.00, 246.94, 220.00]
    beat = 0.75
    for index, start in enumerate(np.arange(0, duration, beat)):
        tone = pluck(notes[index % len(notes)], min(3.2, duration - start), rng)
        offset = int(start * SAMPLE_RATE)
        mono[offset : offset + len(tone)] += tone * (0.30 if index % 4 else 0.42)

    # A few higher, quieter notes add movement without a constant hum.
    for index, start in enumerate(np.arange(1.5, duration, 3.0)):
        tone = pluck(notes[(index * 3 + 2) % len(notes)] * 2, min(2.0, duration - start), rng)
        offset = int(start * SAMPLE_RATE)
        mono[offset : offset + len(tone)] += tone * 0.12

    left = mono.copy()
    right = mono.copy()
    for delay_seconds, gain in ((0.12, 0.20), (0.27, 0.11)):
        delay = int(delay_seconds * SAMPLE_RATE)
        right[delay:] += mono[:-delay] * gain
        left[delay:] += mono[:-delay] * gain * 0.75

    fade = int(0.8 * SAMPLE_RATE)
    left[:fade] *= np.linspace(0, 1, fade)
    right[:fade] *= np.linspace(0, 1, fade)
    left[-fade:] *= np.linspace(1, 0, fade)
    right[-fade:] *= np.linspace(1, 0, fade)
    peak = max(np.max(np.abs(left)), np.max(np.abs(right)), 1e-9)
    stereo = np.column_stack((left, right)) * (0.78 / peak)
    pcm = np.int16(np.clip(stereo, -1, 1) * 32767)

    with wave.open(str(output), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm.tobytes())


def render(spec_path: Path, output: Path) -> None:
    spec = json.loads(spec_path.read_text())
    slides = spec.get("slides") or []
    if not slides:
        raise ValueError("The specification needs at least one slide.")
    duration = float(spec.get("slide_duration", 5))
    total_duration = duration * len(slides)

    with tempfile.TemporaryDirectory(prefix="genesis-campaign-") as temporary:
        workspace = Path(temporary)
        slide_files: list[Path] = []
        for index, slide in enumerate(slides):
            slide_file = workspace / f"slide-{index:02d}.jpg"
            image_path = (spec_path.parent / slide["image"]).resolve()
            make_slide(image_path, slide["text"], slide_file, slide.get("accent"))
            slide_files.append(slide_file)

        music = workspace / "original-plucked-instrumental.wav"
        make_music(total_duration, music)
        concat = workspace / "slides.txt"
        entries: list[str] = []
        for slide_file in slide_files:
            entries.extend([f"file '{slide_file}'", f"duration {duration}"])
        entries.append(f"file '{slide_files[-1]}'")
        concat.write_text("\n".join(entries) + "\n")

        output.parent.mkdir(parents=True, exist_ok=True)
        command = [
            "ffmpeg", "-y", "-v", "warning",
            "-f", "concat", "-safe", "0", "-i", str(concat),
            "-i", str(music),
            "-t", f"{total_duration:.3f}",
            "-r", str(FPS),
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            str(output),
        ]
        subprocess.run(command, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    render(args.spec.resolve(), args.output.resolve())


if __name__ == "__main__":
    main()
