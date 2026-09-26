"""Render every supported visual without provider calls."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
visuals = [
    {"type": "flow", "labels": ["Observation", "Reasoning", "Conclusion"], "values": [], "points": []},
    {"type": "comparison", "labels": ["First concept", "Second concept", "Third concept", "Fourth concept"], "values": [], "points": []},
    {"type": "bars", "labels": ["Three", "Four", "Five"], "values": [3, 4, 5], "points": []},
    {"type": "graph", "labels": ["x", "y = x²"], "values": [], "points": [{"x": x, "y": x*x} for x in range(-3, 4)]},
    {"type": "numberline", "labels": ["Negative", "Zero", "Positive"], "values": [-3, 0, 4], "points": []},
    {"type": "triangle", "labels": ["a", "b", "c"], "values": [3, 4], "points": []},
    {"type": "equation", "labels": ["a² + b² = c²", "3² + 4² = 25", "c = 5"], "values": [], "points": []},
]
plan = {"title": "Renderer validation", "summary": "Every supported visual", "scenes": [{"heading": visual["type"].title(), "caption": "A visual renderer check, including Unicode and text that wraps.", "narration": "", "visual": visual} for visual in visuals]}
template = (root / "scripts/manim_scene.py").read_text()
code = template.replace("__PRISM_STORYBOARD__", repr(json.dumps(plan))).replace("__PRISM_TIMINGS__", repr(json.dumps([{"duration": 8} for _ in visuals])))
directory = root / ".data/visual-tests"
directory.mkdir(parents=True, exist_ok=True)
(directory / "scene.py").write_text(code)
print(directory / "scene.py")
