"""Prism's trusted Manim compiler template. Storyboard text is data, never code."""
from manim import *
from pathlib import Path
import json
import textwrap
import hashlib
import xml.etree.ElementTree as ET
from matplotlib.mathtext import math_to_image

PLAN = json.loads(__PRISM_STORYBOARD__)
TIMINGS = json.loads(__PRISM_TIMINGS__)
BACKGROUND = "#050505"
FOREGROUND = "#F7F7F5"
MUTED = "#A8A8A5"
SUBTLE = "#5F5F5D"
HAIRLINE = "#30302F"
SURFACE = "#141414"
COLORS = ["#6ADFD4", "#F6C977", "#B9A5F7", "#F49A8A"]
FONT = "Avenir Next"


def label(text, size=28, width=10, color=FOREGROUND, wrap=42, height=None, weight="NORMAL"):
    obj = Text("\n".join(textwrap.wrap(str(text), width=wrap)) or " ", font=FONT, font_size=size, color=color, line_spacing=0.8, weight=weight)
    if obj.width > width:
        obj.scale_to_fit_width(width)
    if height and obj.height > height:
        obj.scale_to_fit_height(height)
    return obj


class PrismLesson(Scene):
    def construct(self):
        self.camera.background_color = BACKGROUND
        brand = label("prism.", 24, 2.0, FOREGROUND, weight="BOLD").to_corner(UL, buff=0.55)
        descriptor = label("VISUAL LESSON", 14, 2.5, MUTED, weight="BOLD").next_to(brand, RIGHT, buff=0.35)
        top_rule = Line(LEFT * 6.15 + UP * 3.13, RIGHT * 6.15 + UP * 3.13, color=HAIRLINE, stroke_width=1)
        bottom_rule = Line(LEFT * 6.15 + DOWN * 2.48, RIGHT * 6.15 + DOWN * 2.48, color=HAIRLINE, stroke_width=1)
        chrome = (brand, descriptor, top_rule, bottom_rule)
        self.add(*chrome)
        for index, scene in enumerate(PLAN["scenes"]):
            started = self.time
            timing = TIMINGS[index]
            if timing.get("audio") and (Path(__file__).parent / timing["audio"]).exists():
                self.add_sound(str(Path(__file__).parent / timing["audio"]))
            accent = COLORS[index % len(COLORS)]
            progress = Line(LEFT * 6.15 + UP * 3.13, LEFT * 6.15 + RIGHT * (12.3 * (index + 1) / len(PLAN["scenes"])) + UP * 3.13, color=accent, stroke_width=3)
            heading = label(scene["heading"], 40, 11.3, FOREGROUND, 38, 1.1, "BOLD").to_edge(LEFT, buff=0.8).set_y(2.23)
            kicker = Line(LEFT * 6.15 + UP * 1.43, LEFT * 5.6 + UP * 1.43, color=accent, stroke_width=4)
            caption = label(scene["caption"], 22, 9.75, MUTED, 68, 0.88).to_edge(LEFT, buff=2.3).set_y(-3.05)
            caption_label = label("KEY IDEA", 14, 1.4, accent, weight="BOLD").to_edge(LEFT, buff=0.8).set_y(-2.82)
            count = label(f'{index + 1:02} / {len(PLAN["scenes"]):02}', 17, 1.5, MUTED).to_corner(UR, buff=0.55)
            self.play(FadeIn(progress), FadeIn(heading, shift=UP * 0.12), FadeIn(kicker), FadeIn(count), run_time=0.5)
            visual = scene["visual"]
            self.play(FadeIn(caption_label), FadeIn(caption, shift=UP * 0.08), run_time=0.4)
            if visual.get("illustrative"):
                badge = label("ILLUSTRATIVE · NOT SOURCE MEASUREMENTS", 13, 5.5, MUTED).set_y(-2.23)
                self.add(badge)
            if visual["type"] == "animation":
                self.draw_animation(visual, max(3, timing["duration"] - 1.5))
            else:
                getattr(self, "draw_" + visual["type"])(visual)
            is_last = index == len(PLAN["scenes"]) - 1
            self.wait(max(0.5, timing["duration"] - (self.time - started) - (0 if is_last else 0.5)))
            if not is_last:
                self.play(*[FadeOut(obj) for obj in list(self.mobjects) if all(obj is not item for item in chrome)], run_time=0.5)

    def draw_flow(self, visual):
        labels = visual["labels"]
        spacing = min(3.25, 9.6 / max(1, len(labels) - 1))
        nodes = []
        for i, text in enumerate(labels):
            circle = Circle(radius=0.56, color=COLORS[i], fill_color=SURFACE, fill_opacity=1, stroke_width=2)
            number = label(f"{i + 1:02}", 28, 0.8, COLORS[i], weight="BOLD").move_to(circle)
            title = label(text, 23, 2.25, FOREGROUND, 17, 0.8).next_to(circle, DOWN, buff=0.32)
            node = VGroup(circle, number, title).move_to(RIGHT * (i - (len(labels) - 1) / 2) * spacing + DOWN * 0.25)
            nodes.append(node)
            self.play(GrowFromCenter(circle), FadeIn(number), FadeIn(title), run_time=0.4)
        for i in range(len(nodes) - 1):
            arrow = Arrow(nodes[i][0].get_right(), nodes[i + 1][0].get_left(), buff=0.14, color=SUBTLE, stroke_width=2.5)
            self.play(GrowArrow(arrow), run_time=0.45)
            dot = Dot(arrow.get_start(), color=COLORS[i], radius=0.06)
            self.add(dot)
            self.play(MoveAlongPath(dot, arrow), run_time=0.5, rate_func=linear)
            self.play(Indicate(nodes[i + 1][0], color=COLORS[i + 1]), FadeOut(dot), run_time=0.35)

    def draw_comparison(self, visual):
        labels = visual["labels"]
        for i, text in enumerate(labels):
            x = (i % 2 - 0.5) * 5.0
            y = (0.5 - i // 2 * 1.65) if len(labels) > 2 else -0.3
            box = RoundedRectangle(width=4.55, height=1.35, corner_radius=0.16, color=HAIRLINE, fill_color=SURFACE, fill_opacity=1, stroke_width=1.5)
            accent = Line(LEFT * 2.06 + DOWN * 0.43, LEFT * 2.06 + UP * 0.43, color=COLORS[i], stroke_width=4)
            title = label(text, 27, 3.7, FOREGROUND, 24, 0.95, "BOLD").shift(RIGHT * 0.18)
            group = VGroup(box, accent, title).move_to([x, y, 0])
            self.play(FadeIn(box, shift=UP * 0.08), Create(accent), FadeIn(title), run_time=0.55)

    def draw_bars(self, visual):
        values, labels = visual["values"], visual["labels"]
        largest = max(values)
        baseline = Line(LEFT * 5.35 + DOWN * 1.45, RIGHT * 5.35 + DOWN * 1.45, color=HAIRLINE, stroke_width=2)
        self.play(Create(baseline), run_time=0.4)
        for i, (value, text) in enumerate(zip(values, labels)):
            x = (i - (len(values) - 1) / 2) * 2.55
            height = max(0.14, 2.5 * value / largest)
            bar = RoundedRectangle(width=1.14, height=height, corner_radius=0.06, color=COLORS[i], fill_color=COLORS[i], fill_opacity=0.72, stroke_width=2).move_to([x, -1.45 + height / 2, 0])
            title = label(text, 20, 2.25, FOREGROUND, 17, 0.65).next_to(bar, DOWN, buff=0.22)
            number = label(f'{value:g}', 24, 2, FOREGROUND, weight="BOLD").next_to(bar, UP, buff=0.12)
            self.play(GrowFromEdge(bar, DOWN), FadeIn(title), FadeIn(number), run_time=0.65)

    def draw_graph(self, visual):
        points = sorted(visual["points"], key=lambda point: point["x"])
        xs, ys = [p["x"] for p in points], [p["y"] for p in points]
        xmin, xmax = min(xs), max(xs)
        ymin, ymax = min(0, min(ys)), max(0, max(ys))
        if ymax == ymin:
            ymax = ymin + 1
        xpad, ypad = (xmax - xmin) * 0.08, (ymax - ymin) * 0.15
        axes = Axes(x_range=[xmin - xpad, xmax + xpad, max((xmax - xmin) / 4, 0.0001)], y_range=[ymin - ypad, ymax + ypad, max((ymax - ymin) / 4, 0.0001)], x_length=8.0, y_length=3.0, axis_config={"color": SUBTLE, "include_ticks": False, "include_tip": False}).move_to(DOWN * 0.25)
        xname = label(visual["labels"][0], 19, 4, MUTED, 28).next_to(axes, DOWN, buff=0.16)
        yname = label(visual["labels"][1], 19, 2.0, MUTED, 16).next_to(axes, LEFT, buff=0.25)
        self.play(Create(axes), FadeIn(xname), FadeIn(yname), run_time=0.7)
        curve = VMobject(color=COLORS[0], stroke_width=4.5).set_points_as_corners([axes.c2p(p["x"], p["y"]) for p in points])
        self.play(Create(curve), run_time=1.2)
        dot = Dot(curve.get_start(), color=COLORS[1], radius=0.08)
        self.add(dot)
        self.play(MoveAlongPath(dot, curve), run_time=1.3, rate_func=linear)

    def draw_numberline(self, visual):
        values = visual["values"]
        low, high = min(values), max(values)
        span = max(1, high - low)
        line = NumberLine(x_range=[low - span * 0.15, high + span * 0.15, max(span / 5, 0.0001)], length=9.5, include_numbers=False, include_ticks=False, color=SUBTLE).shift(DOWN * 0.2)
        self.play(Create(line), run_time=0.6)
        for i, (value, text) in enumerate(zip(values, visual["labels"])):
            dot = Dot(line.n2p(value), color=COLORS[i], radius=0.12)
            title = label(text, 22, 2.4, FOREGROUND, 18, 0.75, "BOLD").next_to(dot, UP if i % 2 == 0 else DOWN, buff=0.32)
            number = label(f'{value:g}', 19, 2, COLORS[i]).next_to(dot, DOWN if i % 2 == 0 else UP, buff=0.22)
            self.play(GrowFromCenter(dot), FadeIn(title), FadeIn(number), run_time=0.6)

    def draw_equation(self, visual):
        expressions = visual["labels"]
        current = label(expressions[0], 52, 10.5, FOREGROUND, 60, 1.5, "BOLD").move_to(DOWN * 0.2)
        self.play(Write(current), run_time=0.7)
        for index, expression in enumerate(expressions[1:]):
            previous = current.copy().scale(0.6).set_color(MUTED).move_to(UP * 1.25)
            self.play(TransformFromCopy(current, previous), run_time=0.35)
            replacement = label(expression, 52, 10.5, FOREGROUND, 60, 1.5, "BOLD").move_to(DOWN * 0.2)
            self.play(TransformMatchingShapes(current, replacement), run_time=0.9)
            self.play(FadeOut(previous), run_time=0.25)
            current = replacement
        self.play(Indicate(current, scale_factor=1.05), run_time=0.5)

    def draw_triangle(self, visual):
        a, b = visual["values"][:2]
        size = max(a, b)
        a, b = a / size, b / size
        vertices = [np.array([0., 0., 0.]), np.array([a, 0., 0.]), np.array([0., b, 0.])]
        triangle = Polygon(*vertices, color=FOREGROUND, fill_opacity=0.04, stroke_width=2.5)
        squares, texts = [], []
        names = visual["labels"] + ["c"]
        for index, (p, q, name, color) in enumerate([(vertices[0], vertices[1], names[0], COLORS[0]), (vertices[2], vertices[0], names[1], COLORS[1]), (vertices[1], vertices[2], names[2], COLORS[2])]):
            edge = q - p
            outward = np.array([edge[1], -edge[0], 0.])
            square = Polygon(p, q, q + outward, p + outward, color=color, fill_opacity=0.15, stroke_width=2)
            title = label(name + "²", 30, 2, color, 12).scale(0.03).move_to(square.get_center())
            # Scale text relative to the geometry before fitting the entire group.
            title.scale_to_fit_width(max(0.1, square.width * 0.45))
            squares.append(square); texts.append(title)
        group = VGroup(triangle, *squares, *texts)
        group.scale_to_fit_height(3.4)
        if group.width > 9.5:
            group.scale_to_fit_width(9.5)
        group.move_to(DOWN * 0.25)
        self.play(Create(triangle), run_time=0.6)
        for square, title in zip(squares, texts):
            self.play(DrawBorderThenFill(square), FadeIn(title), run_time=0.7)
        self.play(Indicate(squares[0], color=COLORS[0]), Indicate(squares[1], color=COLORS[1]), run_time=0.6)
        self.play(Indicate(squares[2], color=COLORS[2]), run_time=0.6)

    def animation_object(self, item):
        kind, color = item["kind"], item["color"]
        width, height = item["width"], item["height"]
        if kind == "text":
            obj = label(item["text"], 26, width, color, 50, height)
        elif kind == "formula":
            # Mathtext parses a limited mathematical language; it never invokes TeX.
            digest = hashlib.sha256(("transparent-v2:" + item["text"]).encode()).hexdigest()
            directory = Path(__file__).parent / "formula-assets"
            directory.mkdir(exist_ok=True)
            file = directory / (digest + ".svg")
            try:
                if not file.exists():
                    math_to_image("$" + item["text"].strip("$") + "$", file, format="svg", color="white", dpi=160)
                    # Matplotlib adds an opaque figure background; remove it before importing paths.
                    tree = ET.parse(file)
                    for parent in tree.iter():
                        for child in list(parent):
                            if child.attrib.get("id") == "patch_1":
                                parent.remove(child)
                    tree.write(file, encoding="unicode")
                obj = SVGMobject(str(file)).set_color(color)
                obj.scale(min(width / max(obj.width, 0.01), height / max(obj.height, 0.01)))
            except (ValueError, RuntimeError):
                # Unsupported math notation should not discard an otherwise useful lesson.
                obj = label(item["text"], 26, width, color, 60, height)
        elif kind == "rectangle":
            obj = Rectangle(width=width, height=height, color=color, fill_opacity=0.15)
        elif kind == "circle":
            obj = Circle(radius=0.5, color=color, fill_opacity=0.2).stretch_to_fit_width(width).stretch_to_fit_height(height)
        elif kind in ("line", "arrow", "curve"):
            coords = [np.array([p["x"], p["y"], 0.]) for p in item["points"]]
            if kind == "curve":
                obj = VMobject(color=color, stroke_width=3).set_points_as_corners(coords)
            elif kind == "arrow":
                obj = Arrow(coords[0], coords[1], buff=0, color=color, stroke_width=2.5)
            else:
                obj = Line(coords[0], coords[1], color=color, stroke_width=2)
            # Preserve slopes and relative geometry, including horizontal/vertical lines.
            factor = min(width / max(obj.width, 0.01), height / max(obj.height, 0.01))
            obj.scale(factor)
        else:
            values, cols = item["values"], item["columns"]
            rows = len(values) // cols
            obj = VGroup()
            if kind == "grid":
                for row in range(rows):
                    for col in range(cols):
                        value = values[row * cols + col]
                        cell = Rectangle(width=width / cols, height=height / rows, stroke_width=0.6, stroke_color=BACKGROUND,
                                         fill_color=interpolate_color(ManimColor(SURFACE), ManimColor(color), value), fill_opacity=1)
                        cell.move_to([(col + 0.5) * width / cols, -(row + 0.5) * height / rows, 0])
                        obj.add(cell)
            else:
                # Project data onto an oblique surface while the lesson chrome stays flat.
                def project(row, col):
                    value = values[row * cols + col]
                    u, v = col / (cols - 1), row / (rows - 1)
                    return np.array([(u - v) * width * 0.5, (u + v) * height * 0.22 + value * height * 0.55, 0.])
                for row in reversed(range(rows - 1)):
                    for col in range(cols - 1):
                        avg = sum(values[r * cols + c] for r, c in [(row, col), (row, col + 1), (row + 1, col + 1), (row + 1, col)]) / 4
                        patch = Polygon(project(row, col), project(row, col + 1), project(row + 1, col + 1), project(row + 1, col),
                                        fill_color=interpolate_color(ManimColor(SURFACE), ManimColor(color), avg), fill_opacity=0.95,
                                        stroke_color=color, stroke_width=0.65)
                        obj.add(patch)
            obj.move_to(ORIGIN)
        return obj.move_to([item["x"], item["y"], 0])

    def draw_animation(self, visual, duration):
        current = {}
        started = self.time
        for index, frame in enumerate(visual["frames"]):
            target_time = frame["at"] * duration
            # End each transition at its planned narration position.
            transition = min(1.2, max(0.35, target_time - (self.time - started))) if index else 0.6
            wait = target_time - (self.time - started) - transition
            if wait > 0:
                self.wait(wait)
            replacements = {item["id"]: self.animation_object(item) for item in frame["objects"]}
            changes = []
            for key, obj in current.items():
                if key not in replacements:
                    changes.append(FadeOut(obj))
            for key, obj in replacements.items():
                if key in current:
                    changes.append(Transform(current[key], obj))
                else:
                    changes.append(FadeIn(obj))
            self.play(*changes, run_time=transition)
            current = {key: current[key] if key in current else obj for key, obj in replacements.items()}
        self.wait(max(0, duration - (self.time - started)))
