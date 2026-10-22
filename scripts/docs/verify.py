"""Check local showcase links and produce a GitHub-rendered README preview."""
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output' / 'docs'
OUT.mkdir(parents=True, exist_ok=True)
FILES = ['README.md', 'docs/GETTING_STARTED.md', 'docs/USE_CASES.md',
         'docs/SHOWCASE.md', 'docs/media/README.md', 'docs/media/presentation/DESIGN.md']
checked = 0
for name in FILES:
    path = ROOT / name
    source = path.read_text(encoding='utf-8')
    links = re.findall(r'\]\(([^)]+)\)', source) + re.findall(r'(?:src|href)="([^"]+)"', source)
    for link in links:
        parsed = urlsplit(link)
        if parsed.scheme or not parsed.path:
            continue
        target = (path.parent / unquote(parsed.path)).resolve()
        assert target.is_relative_to(ROOT) and target.exists(), f'{name}: broken link {link}'
        checked += 1

payload = OUT / 'readme-request.json'
payload.write_text(json.dumps({'text': (ROOT / 'README.md').read_text(encoding='utf-8'),
                               'mode': 'gfm', 'context': 'ychampion/openduet'}), encoding='utf-8')
result = subprocess.run(['gh', 'api', 'markdown', '--input', str(payload)], check=True, capture_output=True)
rendered = result.stdout.decode('utf-8')
assert '<h2 dir="auto">Get started</h2>' in rendered
(OUT / 'readme-rendered.html').write_text(rendered, encoding='utf-8')
print(f'{checked} local links/assets exist; GitHub Markdown rendering succeeded.')
