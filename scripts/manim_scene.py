"""Prism's trusted Manim compiler template. Storyboard text is data, never code."""
from manim import *
from pathlib import Path
import json
import textwrap

PLAN = json.loads(__PRISM_STORYBOARD__)
TIMINGS = json.loads(__PRISM_TIMINGS__)
COLORS = ["#5CB8FF", "#FFD166", "#62DEAE", "#C69AFF"]


def label(text, size=28, width=10, color=WHITE, wrap=42):
    obj = Text("\n".join(textwrap.wrap(str(text), width=wrap)) or " ", font_size=size, color=color, line_spacing=0.8)
    if obj.width > width:
        obj.scale_to_fit_width(width)
    return obj


class PrismLesson(Scene):
    def construct(self):
        self.camera.background_color = "#0B1020"
        brand = Text("PRISM", font_size=16, color="#76839E").to_corner(UL, buff=0.4)
        self.add(brand)
        for index, scene in enumerate(PLAN["scenes"]):
            started = self.time
            timing = TIMINGS[index]
            if timing.get("audio") and (Path(__file__).parent / timing["audio"]).exists():
                self.add_sound(str(Path(__file__).parent / timing["audio"]))
            heading = label(scene["heading"], 36, 11, COLORS[index % 4]).move_to(UP * 2.85)
            caption = label(scene["caption"], 24, 11.5, "#B8C4DB", 65).move_to(DOWN * 2.8)
            count = Text(f'{index + 1} / {len(PLAN["scenes"])}', font_size=16, color="#76839E").to_corner(UR, buff=0.4)
            self.play(FadeIn(heading, shift=UP * 0.15), FadeIn(count), run_time=0.5)
            visual = scene["visual"]
            getattr(self, "draw_" + visual["type"])(visual)
            self.play(FadeIn(caption, shift=UP * 0.1), run_time=0.5)
            self.wait(max(0.5, timing["duration"] - (self.time - started) - 0.5))
            self.play(*[FadeOut(obj) for obj in list(self.mobjects) if obj is not brand], run_time=0.5)

    def draw_flow(self, visual):
        labels = visual["labels"]
        spacing = min(3.3, 10.0 / max(1, len(labels) - 1))
        nodes = []
        for i, text in enumerate(labels):
            circle = Circle(radius=0.72, color=COLORS[i], fill_opacity=0.1, stroke_width=2)
            title = label(text, 25, 2.5, COLORS[i], 16).next_to(circle, DOWN, buff=0.3)
            node = VGroup(circle, title).move_to(RIGHT * (i - (len(labels) - 1) / 2) * spacing)
            nodes.append(node)
            self.play(GrowFromCenter(circle), FadeIn(title), run_time=0.4)
        for i in range(len(nodes) - 1):
            arrow = Arrow(nodes[i][0].get_right(), nodes[i + 1][0].get_left(), buff=0.1, color=COLORS[i], stroke_width=3)
            self.play(GrowArrow(arrow), run_time=0.45)
            dot = Dot(arrow.get_start(), color=COLORS[i], radius=0.07)
            self.add(dot)
            self.play(MoveAlongPath(dot, arrow), run_time=0.5, rate_func=linear)
            self.play(Indicate(nodes[i + 1][0], color=COLORS[i + 1]), FadeOut(dot), run_time=0.35)

    def draw_comparison(self, visual):
        labels = visual["labels"]
        for i, text in enumerate(labels):
            x = (i % 2 - 0.5) * 5.2
            y = (0.75 - i // 2 * 1.9) if len(labels) > 2 else 0
            box = RoundedRectangle(width=4.5, height=1.45, corner_radius=0.18, color=COLORS[i], fill_opacity=0.08)
            title = label(text, 28, 3.9, COLORS[i], 22)
            group = VGroup(box, title).move_to([x, y, 0])
            self.play(Create(box), FadeIn(title), run_time=0.65)
            self.play(Indicate(group, scale_factor=1.03), run_time=0.35)

    def draw_bars(self, visual):
        values, labels = visual["values"], visual["labels"]
        largest = max(values)
        baseline = Line(LEFT * 5 + DOWN * 1.5, RIGHT * 5 + DOWN * 1.5, color="#44516B")
        self.play(Create(baseline), run_time=0.4)
        for i, (value, text) in enumerate(zip(values, labels)):
            x = (i - (len(values) - 1) / 2) * 2.5
            height = max(0.12, 3.1 * value / largest)
            bar = Rectangle(width=1.15, height=height, color=COLORS[i], fill_opacity=0.7).move_to([x, -1.5 + height / 2, 0])
            title = label(text, 21, 2.25, WHITE, 17).next_to(bar, DOWN, buff=0.2)
            number = label(f'{value:g}', 23, 2, COLORS[i]).next_to(bar, UP, buff=0.15)
            self.play(GrowFromEdge(bar, DOWN), FadeIn(title), FadeIn(number), run_time=0.65)
        self.wait(0.4)

    def draw_graph(self, visual):
        points = sorted(visual["points"], key=lambda point: point["x"])
        xs, ys = [p["x"] for p in points], [p["y"] for p in points]
        xmin, xmax = min(xs), max(xs)
        ymin, ymax = min(0, min(ys)), max(0, max(ys))
        if ymax == ymin:
            ymax = ymin + 1
        xpad, ypad = (xmax - xmin) * 0.08, (ymax - ymin) * 0.15
        axes = Axes(x_range=[xmin - xpad, xmax + xpad, max((xmax - xmin) / 4, 0.0001)], y_range=[ymin - ypad, ymax + ypad, max((ymax - ymin) / 4, 0.0001)], x_length=8.2, y_length=3.6, axis_config={"color": "#66758F", "include_ticks": False, "include_tip": True}).move_to(DOWN * 0.2)
        xname = label(visual["labels"][0], 20, 4, WHITE, 28).next_to(axes, DOWN, buff=0.2)
        yname = label(visual["labels"][1], 20, 2.2, WHITE, 16).next_to(axes, LEFT, buff=0.25)
        self.play(Create(axes), FadeIn(xname), FadeIn(yname), run_time=0.7)
        curve = VMobject(color=COLORS[0], stroke_width=4).set_points_as_corners([axes.c2p(p["x"], p["y"]) for p in points])
        self.play(Create(curve), run_time=1.5)
        dot = Dot(curve.get_start(), color=COLORS[1], radius=0.09)
        self.add(dot)
        self.play(MoveAlongPath(dot, curve), run_time=1.6, rate_func=linear)
        self.play(Indicate(dot), run_time=0.4)

    def draw_numberline(self, visual):
        values = visual["values"]
        low, high = min(values), max(values)
        span = max(1, high - low)
        line = NumberLine(x_range=[low - span * 0.15, high + span * 0.15, max(span / 5, 0.0001)], length=9.5, include_numbers=False, include_ticks=False, color="#66758F").shift(DOWN * 0.2)
        self.play(Create(line), run_time=0.6)
        for i, (value, text) in enumerate(zip(values, visual["labels"])):
            dot = Dot(line.n2p(value), color=COLORS[i], radius=0.12)
            title = label(text, 23, 2.6, COLORS[i], 18).next_to(dot, UP if i % 2 == 0 else DOWN, buff=0.35)
            number = label(f'{value:g}', 20, 2, WHITE).next_to(dot, DOWN if i % 2 == 0 else UP, buff=0.25)
            self.play(GrowFromCenter(dot), FadeIn(title), FadeIn(number), run_time=0.6)

    def draw_equation(self, visual):
        expressions = visual["labels"]
        current = label(expressions[0], 56, 10.5, COLORS[0], 60).move_to(UP * 0.15)
        self.play(Write(current), run_time=0.7)
        for index, expression in enumerate(expressions[1:]):
            previous = current.copy().scale(0.6).move_to(UP * 1.8)
            self.play(TransformFromCopy(current, previous), run_time=0.35)
            replacement = label(expression, 56, 10.5, COLORS[(index + 1) % 4], 60).move_to(UP * 0.15)
            self.play(TransformMatchingShapes(current, replacement), run_time=0.9)
            self.play(FadeOut(previous), run_time=0.25)
            current = replacement
        self.play(Indicate(current, scale_factor=1.05), run_time=0.5)

    def draw_triangle(self, visual):
        a, b = visual["values"][:2]
        size = max(a, b)
        a, b = a / size, b / size
        vertices = [np.array([0., 0., 0.]), np.array([a, 0., 0.]), np.array([0., b, 0.])]
        triangle = Polygon(*vertices, color=WHITE, fill_opacity=0.04, stroke_width=2.5)
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
        group.scale_to_fit_height(4.1)
        if group.width > 9.5:
            group.scale_to_fit_width(9.5)
        group.move_to(ORIGIN)
        self.play(Create(triangle), run_time=0.6)
        for square, title in zip(squares, texts):
            self.play(DrawBorderThenFill(square), FadeIn(title), run_time=0.7)
        self.play(Indicate(squares[0], color=COLORS[0]), Indicate(squares[1], color=COLORS[1]), run_time=0.6)
        self.play(Indicate(squares[2], color=COLORS[2]), run_time=0.6)
