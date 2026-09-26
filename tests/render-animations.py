"""Numerically consistent bilateral filtering fixture and primitive renderer coverage."""
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parents[1]
directory = root / ".data/animation-tests"
directory.mkdir(parents=True, exist_ok=True)


def obj(id, kind, text="", x=0, y=0, width=4, height=1, color="#6ADFD4", points=None, values=None, columns=0):
    return dict(id=id, kind=kind, text=text, x=x, y=y, width=width, height=height, color=color, points=points or [], values=values or [], columns=columns)


def scene(heading, caption, frames):
    return dict(heading=heading, caption=caption, narration="", visual=dict(type="animation", labels=[], points=[], values=[], illustrative=True, frames=frames))


n = 7
source = [[(0.25 if c < 3 else 0.75) + 0.045 * math.sin(r * 3 + c * 7) for c in range(n)] for r in range(n)]
p = (3, 2)
spatial = [[math.exp(-((r-p[0])**2+(c-p[1])**2)/8) for c in range(n)] for r in range(n)]
intensity = [[math.exp(-(source[r][c]-source[p[0]][p[1]])**2/(2*0.15**2)) for c in range(n)] for r in range(n)]
weights = [[spatial[r][c]*intensity[r][c] for c in range(n)] for r in range(n)]
filtered = []
for r in range(n):
    row = []
    for c in range(n):
        pairs = [(source[y][x], math.exp(-((r-y)**2+(c-x)**2)/8-(source[r][c]-source[y][x])**2/(2*0.15**2))) for y in range(n) for x in range(n)]
        row.append(sum(value*weight for value, weight in pairs)/sum(weight for _, weight in pairs))
    filtered.append(row)
flatten = lambda grid: [value for row in grid for value in row]
assert max(abs(filtered[r][c]-(0.25 if c < 3 else 0.75)) for r in range(n) for c in range(n)) < max(abs(source[r][c]-(0.25 if c < 3 else 0.75)) for r in range(n) for c in range(n))

formula = obj("formula", "formula", r"g(p)=\frac{\sum_q w(p,q)f(q)}{\sum_q w(p,q)}", x=0, y=0.65, width=10, height=0.8)
a = [formula, obj("surface", "surface", x=0, y=-0.8, width=5.5, height=1.8, values=flatten(source), columns=n), obj("label", "text", "Noisy intensity boundary", x=4, y=-0.3, width=3, height=0.7)]
b = [formula, obj("surface", "surface", x=0, y=-0.8, width=5.5, height=1.8, values=flatten(filtered), columns=n), obj("label", "text", "Noise reduced; edge retained", x=4, y=-0.3, width=3, height=0.7)]
scenes = [scene("Smooth noise while preserving the edge", "The normalized weighted average smooths each region, preserving their sharp difference.", [dict(at=0, objects=a), dict(at=0.65, objects=b)])]
for index, (data, formula_text, heading) in enumerate([
    (spatial, r"d(p,q)=e^{-\frac{\|p-q\|^2}{2\sigma_d^2}}", "Nearby pixels receive more spatial weight"),
    (intensity, r"r(p,q)=e^{-\frac{(f(p)-f(q))^2}{2\sigma_r^2}}", "Similar intensities receive more range weight"),
    (weights, r"w(p,q)=d(p,q)\,r(p,q)", "Multiply the kernels to exclude the far side of the edge"),
]):
    base = obj("kernel", "surface", x=-2, y=-0.5, width=5, height=2, values=[0]*49, columns=n)
    target = {**base, "values": flatten(data)}
    eq = obj("formula", "formula", formula_text, x=3, y=0, width=4.8, height=1.1, color="#F6C977")
    scenes.append(scene(heading, "A schematic kernel illustrates the formula's effect on the same selected pixel.", [dict(at=0, objects=[base, eq]), dict(at=0.6, objects=[target, eq])]))

base = [
    obj("curve", "curve", x=-3, y=-0.4, width=3, height=1.5, points=[dict(x=x, y=math.exp(-x*x)) for x in [-2,-1,0,1,2]]),
    obj("axis", "line", x=-3, y=-1.4, width=3, height=0.1, points=[dict(x=-2,y=0), dict(x=2,y=0)]),
    obj("pointer", "arrow", x=0, y=-0.5, width=1.3, height=0.5, points=[dict(x=-1,y=0), dict(x=1,y=0)]),
    obj("circle", "circle", x=2, y=-0.4, width=0.7, height=0.7),
    obj("box", "rectangle", x=2, y=-0.4, width=1.8, height=1.5),
    obj("grid", "grid", x=4, y=-0.4, width=1.5, height=1.5, columns=2, values=[0.1,0.8,0.2,0.9]),
]
target = [dict(item) for item in base]
target[0]["points"] = [dict(x=x,y=math.exp(-x*x/4)) for x in [-2,-1,0,1,2]]
target[3]["y"] = 0.6
target[5]["values"] = [0.2,0.75,0.2,0.75]
scenes.append(scene("Formula, chart, geometry and pixel animation", "Keyframes change the underlying objects, rather than revealing a list of labels.", [dict(at=0,objects=base),dict(at=0.65,objects=target)]))
plan = dict(title="Bilateral filtering animation regression", summary="Computed synthetic examples", scenes=scenes)
(directory / "plan.json").write_text(json.dumps(plan))
template = (root / "scripts/manim_scene.py").read_text()
code = template.replace("__PRISM_STORYBOARD__", repr(json.dumps(plan))).replace("__PRISM_TIMINGS__", repr(json.dumps([dict(duration=6) for _ in scenes])))
(directory / "scene.py").write_text(code)
print(directory / "scene.py")
