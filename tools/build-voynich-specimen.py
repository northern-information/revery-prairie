import json, sys
from pathlib import Path

with open('tools/voynich-pua.json') as f:
    cps = json.load(f)

# Empty-PUA blocklist: cmap claims these slots but the glyph data is zero-length.
EMPTY = {0xF120, 0xF1A0, 0xF220, 0xF2A0}

# The shared 8-glyph alphabet for all not-of-this-Earth content
# (egregore tiles, egregoric flora 8b, future egregoric entities).
# These are EGREGORE_GLYPHS as locked in harness/specs/precis-8a-egregoric-thematic.yaml.
# Order preserved — index into the array is what tileHash mod 8 selects.
LOCKED = [0xF166, 0xF174, 0xF182, 0xF1B4, 0xF12A, 0xF1A1, 0xF1B1, 0xF1FD]
assert not set(LOCKED) & EMPTY, 'empty glyph in the locked set'
LOCKED_SET = set(LOCKED)


def cell(cp):
    classes = []
    if cp in LOCKED_SET: classes.append('in-locked')
    if cp in EMPTY: classes.append('empty')
    cls = ' '.join(classes) or 'plain'
    return f'<div class="cell {cls}" data-cp="U+{cp:04X}"><span class="g">&#x{cp:04X};</span><span class="hex">{cp:04X}</span></div>'


cells = '\n'.join(cell(cp) for cp in cps)

locked_row = ''.join(
    f'<div class="lcell" data-cp="U+{cp:04X}">'
    f'<span class="g">&#x{cp:04X};</span>'
    f'<span class="hex">U+{cp:04X}</span>'
    f'<span class="idx">[{i}]</span>'
    f'</div>'
    for i, cp in enumerate(LOCKED)
)

html_template = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Voynich glyph specimen — Revery Prairie</title>
<style>
  @font-face {{
    font-family: 'Voynich';
    src: url('{font_url}') format('truetype');
    font-display: block;
  }}
  :root {{
    --bg: #0e0e10;
    --fg: #d8d6cf;
    --dim: #6e6c66;
    --violet: #b080d0;
    --grid-bg: #15151a;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    background: var(--bg);
    color: var(--fg);
    font-family: ui-monospace, 'JetBrains Mono', monospace;
    margin: 0;
    padding: 24px 32px 64px;
    line-height: 1.5;
  }}
  h1 {{ font-weight: 500; font-size: 18px; margin: 0 0 4px; }}
  h2 {{ font-weight: 500; font-size: 14px; margin: 32px 0 12px; color: var(--violet); }}
  p {{ color: var(--dim); margin: 0 0 24px; font-size: 12px; max-width: 720px; }}
  code {{ color: var(--fg); }}
  .legend {{
    display: flex; gap: 16px; font-size: 11px; color: var(--dim);
    margin-bottom: 24px;
  }}
  .legend .swatch {{
    display: inline-block; width: 14px; height: 14px;
    vertical-align: middle; margin-right: 6px; border-radius: 2px;
  }}
  .sw-locked {{ background: rgba(176,128,208,0.45); border: 1px solid var(--violet); }}
  .sw-empty {{ background: #2a0e0e; border: 1px solid #5a2020; }}

  /* Locked row */
  .locked-row {{
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 8px;
    max-width: 760px;
    margin-bottom: 8px;
  }}
  .lcell {{
    background: var(--grid-bg);
    padding: 18px 8px 10px;
    text-align: center;
    border-radius: 4px;
    border: 1px solid var(--violet);
    position: relative;
  }}
  .lcell .g {{
    font-family: 'Voynich', serif;
    font-size: 56px;
    line-height: 1;
    color: var(--violet);
    display: block;
    margin-bottom: 8px;
  }}
  .lcell .hex {{ font-size: 10px; color: var(--dim); display: block; }}
  .lcell .idx {{
    position: absolute; top: 4px; left: 6px;
    font-size: 9px; color: var(--dim);
  }}

  /* Full grid */
  .grid {{
    display: grid;
    grid-template-columns: repeat(16, 1fr);
    gap: 2px;
    margin-top: 8px;
  }}
  .cell {{
    background: var(--grid-bg);
    padding: 6px 2px 2px;
    text-align: center;
    aspect-ratio: 1;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    border: 1px solid transparent;
    position: relative;
  }}
  .cell .g {{
    font-family: 'Voynich', serif;
    font-size: 24px;
    line-height: 1;
    color: var(--fg);
  }}
  .cell .hex {{
    font-size: 7px; color: var(--dim);
    margin-top: 2px;
  }}
  .cell.in-locked {{ background: rgba(176,128,208,0.22); border-color: var(--violet); }}
  .cell.in-locked .g {{ color: var(--violet); }}
  .cell.empty {{ background: #2a0e0e; border-color: #5a2020; }}
  .cell.empty::after {{
    content: 'EMPTY';
    position: absolute; bottom: 2px;
    font-family: ui-monospace, monospace;
    font-size: 7px; color: #c66;
  }}
  .cell.empty .hex {{ display: none; }}

  footer {{
    margin-top: 32px; color: var(--dim); font-size: 11px;
    border-top: 1px solid #2a2a2e; padding-top: 16px;
  }}
</style>
</head>
<body>
<h1>Voynich glyph specimen — Revery Prairie</h1>
<p>
  The shared 8-glyph alphabet (<code>EGREGORE_GLYPHS</code>) used by all
  not-of-this-Earth content in the prairie: egregore tiles (8a), egregoric
  flora species (8b), and any future egregoric entities. Glyphs render via
  the kreativekorp Voynich Unicode font (CC0). The index labels [0]..[7]
  show the array position the renderer selects via <code>tileHash % 8</code>.
</p>

<h2>Locked alphabet (EGREGORE_GLYPHS)</h2>
<div class="locked-row">{locked_row}</div>

<p>
  Below is the full PUA coverage of the bundled font — 381 code points the
  cmap claims to support. Four of them (U+F120, U+F1A0, U+F220, U+F2A0 —
  round-number "section header" slots) are mapped but render empty
  (zero-length glyph data) and live in the <code>EMPTY_PUA_BLOCKLIST</code>
  constant. The locked alphabet is highlighted in violet for reference;
  EVA_TOKENS body text may use any non-empty glyph in this range, not just
  the eight in the locked set.
</p>
<div class="legend">
  <span><span class="swatch sw-locked"></span>Locked alphabet</span>
  <span><span class="swatch sw-empty"></span>Empty (blocked)</span>
</div>

<h2>Full PUA map (381 code points)</h2>
<div class="grid">
{cells}
</div>

<footer>
  Font: <code>voynich.ttf</code> — kreativekorp/voynich-unicode (CC0).
  Source of truth for <code>EGREGORE_GLYPHS</code>:
  <code>harness/specs/precis-8a-egregoric-thematic.yaml</code>
  (behavior <code>egregore-glyph-registry</code>).
  Regenerate this page from <code>tools/build-voynich-specimen.mjs</code>.
</footer>
</body>
</html>'''


def render(font_url: str) -> str:
    return html_template.format(font_url=font_url, locked_row=locked_row, cells=cells)


# Two outputs:
#   1. public/voynich-specimen.html — served by Vite at /voynich-specimen.html (font at /fonts/voynich.ttf)
#   2. docs/voynich-specimen.html — standalone doc reference (font at ../public/fonts/voynich.ttf relative to docs/)
Path('public/voynich-specimen.html').write_text(render('/fonts/voynich.ttf'))
Path('docs/voynich-specimen.html').write_text(render('../public/fonts/voynich.ttf'))
print('wrote public/voynich-specimen.html')
print('wrote docs/voynich-specimen.html')
