"""Tests for the Instagram-style text sticker renderer."""

import io

from PIL import Image

from pipeline.text_sticker import render_sticker_png, _wrap_lines
from pipeline.subtitle import _load_font


def test_render_returns_rgba_png():
    data = render_sticker_png("Hello world", font_px=80, max_width_px=900)
    img = Image.open(io.BytesIO(data))
    assert img.mode == "RGBA"
    w, h = img.size
    assert w > 0 and h > 0

    # Solid-white pill background must be present.
    px = img.load()
    whites = sum(
        1
        for x in range(0, w, 5)
        for y in range(0, h, 5)
        if px[x, y] == (255, 255, 255, 255)
    )
    assert whites > 0, "no opaque-white background pixels found"

    # Corner outside the pill must be transparent.
    assert img.getpixel((0, 0))[3] == 0


def test_custom_colors_paint_the_pill():
    """A non-default bg must show up as opaque pixels of that color, replacing
    the old hard-coded white background."""
    data = render_sticker_png("Hi", 80, 9999, bg="#1d4ed8", fg="#000000")
    img = Image.open(io.BytesIO(data))
    w, h = img.size
    px = img.load()
    cobalt = sum(
        1
        for x in range(0, w, 3)
        for y in range(0, h, 3)
        if px[x, y] == (29, 78, 216, 255)
    )
    whites = sum(
        1
        for x in range(0, w, 3)
        for y in range(0, h, 3)
        if px[x, y] == (255, 255, 255, 255)
    )
    assert cobalt > 0, "no cobalt pill pixels found"
    assert whites == 0, "default white background leaked through"


def test_lines_overlap_so_no_gap():
    """Two stacked pills must overlap, so a 2-line sticker is shorter than 2×."""
    one = Image.open(io.BytesIO(render_sticker_png("line", 80, 9999))).size[1]
    two = Image.open(io.BytesIO(render_sticker_png("line\nline", 80, 9999))).size[1]
    assert one < two < 2 * one


def test_wraps_long_text_into_multiple_lines():
    font = _load_font("Inter", "", 80, bold=True, italic=False)
    lines = _wrap_lines(
        "one two three four five six seven eight nine ten", font.getlength, 200
    )
    assert len(lines) > 1


def test_explicit_newline_splits_lines():
    font = _load_font("Inter", "", 80, bold=True, italic=False)
    lines = _wrap_lines("first\nsecond", font.getlength, 9999)
    assert lines == ["first", "second"]


def test_emoji_renders_and_adds_width():
    """An emoji must occupy real width (pilmoji reserves a box even offline) and
    the render must not crash."""
    plain = Image.open(io.BytesIO(render_sticker_png("Hi", 80, 9999))).size[0]
    emoji = Image.open(io.BytesIO(render_sticker_png("Hi \U0001F602", 80, 9999))).size[0]
    assert emoji > plain


def test_explicit_lines_render_verbatim_no_rewrap():
    """Given lines, the renderer uses them as-is — a tiny max_width must NOT
    re-wrap a provided single line, and N provided lines stack as N pills."""
    # One long line + a max_width that would normally force several wraps.
    one = Image.open(io.BytesIO(
        render_sticker_png("a b c d e f g", 80, 50, lines=["a b c d e f g"])
    )).size[1]
    three = Image.open(io.BytesIO(
        render_sticker_png("ignored", 80, 9999, lines=["a", "b", "c"])
    )).size[1]
    # A single (un-rewrapped) line is shorter than three stacked pills.
    assert one < three


def test_explicit_lines_override_wrapping():
    """The provided line breaks win over the greedy wrapper."""
    same = Image.open(io.BytesIO(
        render_sticker_png("one two three", 80, 9999, lines=["one two", "three"])
    )).size
    # Two lines despite text fitting on one at max_width 9999.
    one_line = Image.open(io.BytesIO(render_sticker_png("one two three", 80, 9999))).size
    assert same[1] > one_line[1]


def test_empty_lines_fall_back_to_wrapping():
    """Blank/empty `lines` must not crash — fall back to wrapping `text`."""
    data = render_sticker_png("hello world", 80, 9999, lines=["", "   "])
    assert Image.open(io.BytesIO(data)).size[1] > 0


def test_empty_text_raises():
    for bad in ("", "   ", "\n  \n"):
        try:
            render_sticker_png(bad, 80, 900)
        except ValueError:
            continue
        raise AssertionError(f"expected ValueError for {bad!r}")


if __name__ == "__main__":
    test_render_returns_rgba_png()
    test_lines_overlap_so_no_gap()
    test_wraps_long_text_into_multiple_lines()
    test_explicit_newline_splits_lines()
    test_emoji_renders_and_adds_width()
    test_explicit_lines_render_verbatim_no_rewrap()
    test_explicit_lines_override_wrapping()
    test_empty_lines_fall_back_to_wrapping()
    test_empty_text_raises()
    print("ok")
